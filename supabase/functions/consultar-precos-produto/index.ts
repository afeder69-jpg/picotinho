import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!
    ).auth.getUser(authHeader.replace('Bearer ', ''));

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { tipo, termo } = await req.json();

    if (!tipo || !termo) {
      return new Response(JSON.stringify({ error: 'Parâmetros inválidos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Get user location and radius
    const { data: profile } = await supabase
      .from('profiles')
      .select('latitude, longitude')
      .eq('user_id', user.id)
      .single();

    const { data: config } = await supabase
      .from('configuracoes_usuario')
      .select('raio_busca_km')
      .eq('usuario_id', user.id)
      .single();

    const raioKm = config?.raio_busca_km || 5;
    const userLat = profile?.latitude;
    const userLon = profile?.longitude;

    // 2. Find master product(s) - for autocomplete
    if (tipo === 'ean') {
      const { data } = await supabase
        .from('produtos_master_global')
        .select('id, nome_padrao, nome_base, marca, categoria, codigo_barras, imagem_url, sku_global, qtd_valor, qtd_unidade, unidade_base')
        .eq('codigo_barras', termo.trim())
        .limit(5);
      return new Response(JSON.stringify({ produtos: data || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (tipo === 'nome') {
      const normalizado = termo.trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const palavras = normalizado.split(/\s+/).filter((p: string) => p.length >= 2);

      if (palavras.length === 0) {
        return new Response(JSON.stringify({ produtos: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error: rpcError } = await supabase.rpc('buscar_produtos_master_por_palavras', {
        p_palavras: palavras,
      });

      if (rpcError) {
        console.error('[consultar-precos] Erro RPC busca:', rpcError);
      }

      return new Response(JSON.stringify({ produtos: data || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (tipo === 'precos') {
      const masterId = termo;

      const { data: master } = await supabase
        .from('produtos_master_global')
        .select('id, nome_padrao, nome_base, marca, categoria, codigo_barras, imagem_url')
        .eq('id', masterId)
        .single();

      if (!master) {
        return new Response(JSON.stringify({ produto: null, precos: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get nearby supermarket CNPJs
      let cnpjsNaArea: string[] = [];
      if (userLat && userLon) {
        const { data: supers } = await supabase
          .from('supermercados')
          .select('cnpj, nome, latitude, longitude')
          .eq('ativo', true);

        if (supers) {
          for (const s of supers) {
            if (s.latitude && s.longitude && s.cnpj) {
              const dist = haversine(userLat, userLon, s.latitude, s.longitude);
              if (dist <= raioKm) {
                cnpjsNaArea.push(s.cnpj);
              }
            }
          }
        }
      }

      // ===== PRIMARY: Query by produto_master_id (structural link) =====
      let allPrecos: any[] = [];

      const masterQuery = supabase
        .from('precos_atuais')
        .select('valor_unitario, data_atualizacao, estabelecimento_nome, estabelecimento_cnpj')
        .eq('produto_master_id', masterId);

      if (cnpjsNaArea.length > 0) {
        masterQuery.in('estabelecimento_cnpj', cnpjsNaArea);
      }

      const { data: precosMaster } = await masterQuery;
      if (precosMaster) allPrecos.push(...precosMaster);

      console.log(`[consultar-precos] Master ID ${masterId}: ${precosMaster?.length || 0} preços por vínculo direto`);

      // ===== FALLBACK: Query by name if no results from master ID =====
      if (allPrecos.length === 0) {
        console.log(`[consultar-precos] Fallback por nome para: ${master.nome_padrao}`);

        // Collect all known names for this product
        const { data: estoqueNames } = await supabase
          .from('estoque_app')
          .select('produto_nome')
          .eq('produto_master_id', masterId);

        const nomesMaster = new Set<string>();
        nomesMaster.add(master.nome_padrao.toUpperCase());
        if (estoqueNames) {
          for (const e of estoqueNames) {
            nomesMaster.add(e.produto_nome.toUpperCase());
          }
        }

        for (const nome of nomesMaster) {
          const query = supabase
            .from('precos_atuais')
            .select('valor_unitario, data_atualizacao, estabelecimento_nome, estabelecimento_cnpj')
            .ilike('produto_nome', nome);

          if (cnpjsNaArea.length > 0) {
            query.in('estabelecimento_cnpj', cnpjsNaArea);
          }

          const { data: precos } = await query;
          if (precos) allPrecos.push(...precos);
        }

        // Also try nome_base partial match
        if (allPrecos.length === 0 && master.nome_base) {
          const query = supabase
            .from('precos_atuais')
            .select('valor_unitario, data_atualizacao, estabelecimento_nome, estabelecimento_cnpj')
            .ilike('produto_nome', `%${master.nome_base}%`);

          if (cnpjsNaArea.length > 0) {
            query.in('estabelecimento_cnpj', cnpjsNaArea);
          }

          const { data: precos } = await query;
          if (precos) allPrecos.push(...precos);
        }

        console.log(`[consultar-precos] Fallback encontrou ${allPrecos.length} preços`);
      }

      // Deduplicate: keep most recent price per market CNPJ
      const porMercado = new Map<string, any>();
      for (const p of allPrecos) {
        const key = p.estabelecimento_cnpj;
        const existing = porMercado.get(key);
        if (!existing || new Date(p.data_atualizacao) > new Date(existing.data_atualizacao)) {
          porMercado.set(key, p);
        }
      }

      // ===== NORMALIZE MARKET NAMES =====
      const cnpjsResultado = Array.from(porMercado.keys());
      
      if (cnpjsResultado.length > 0) {
        // 1. Try normalizacoes_estabelecimentos (highest priority)
        const { data: normEstab } = await supabase
          .from('normalizacoes_estabelecimentos')
          .select('cnpj_original, nome_normalizado')
          .eq('ativo', true)
          .in('cnpj_original', cnpjsResultado);

        const normMap = new Map<string, string>();
        if (normEstab) {
          for (const n of normEstab) {
            if (n.cnpj_original) normMap.set(n.cnpj_original, n.nome_normalizado);
          }
        }

        // 2. Fallback: supermercados table
        const { data: superNomes } = await supabase
          .from('supermercados')
          .select('cnpj, nome')
          .in('cnpj', cnpjsResultado);

        const superMap = new Map<string, string>();
        if (superNomes) {
          for (const s of superNomes) {
            if (s.cnpj && s.nome) superMap.set(s.cnpj, s.nome);
          }
        }

        // Apply normalized names
        for (const [cnpj, preco] of porMercado) {
          const nomeNorm = normMap.get(cnpj) || superMap.get(cnpj);
          if (nomeNorm) {
            preco.estabelecimento_nome = nomeNorm;
          }
        }
      }

      const precosFinais = Array.from(porMercado.values())
        .sort((a, b) => a.valor_unitario - b.valor_unitario);

      return new Response(JSON.stringify({ produto: master, precos: precosFinais }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Tipo inválido' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Erro na consulta de preços:', error);
    return new Response(JSON.stringify({ error: 'Erro interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
