import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🧹 Iniciando limpeza de duplicatas de estabelecimentos...');

    // Buscar duplicatas por CNPJ
    const { data: duplicatasCNPJ, error: erroCNPJ } = await supabase
      .from('normalizacoes_estabelecimentos')
      .select('cnpj_original, nome_normalizado, id, created_at')
      .not('cnpj_original', 'is', null)
      .eq('ativo', true)
      .order('created_at', { ascending: true });

    if (erroCNPJ) throw erroCNPJ;

    // Agrupar duplicatas por CNPJ + nome_normalizado
    const gruposCNPJ = new Map<string, any[]>();
    duplicatasCNPJ?.forEach(item => {
      const chave = `${item.cnpj_original}|${item.nome_normalizado}`;
      if (!gruposCNPJ.has(chave)) {
        gruposCNPJ.set(chave, []);
      }
      gruposCNPJ.get(chave)!.push(item);
    });

    let duplicatasRemovidas = 0;
    const idsParaDesativar: string[] = [];

    // Processar duplicatas por CNPJ (manter a mais antiga)
    gruposCNPJ.forEach((items, chave) => {
      if (items.length > 1) {
        // Manter o primeiro (mais antigo), desativar os demais
        items.slice(1).forEach(item => {
          idsParaDesativar.push(item.id);
          duplicatasRemovidas++;
        });
        console.log(`📦 CNPJ: ${chave} - ${items.length - 1} duplicatas encontradas`);
      }
    });

    // Buscar duplicatas por nome_original (quando não há CNPJ)
    const { data: duplicatasNome, error: erroNome } = await supabase
      .from('normalizacoes_estabelecimentos')
      .select('nome_original, nome_normalizado, id, created_at')
      .is('cnpj_original', null)
      .eq('ativo', true)
      .order('created_at', { ascending: true });

    if (erroNome) throw erroNome;

    // Agrupar duplicatas por nome_original + nome_normalizado
    const gruposNome = new Map<string, any[]>();
    duplicatasNome?.forEach(item => {
      const chave = `${item.nome_original}|${item.nome_normalizado}`;
      if (!gruposNome.has(chave)) {
        gruposNome.set(chave, []);
      }
      gruposNome.get(chave)!.push(item);
    });

    // Processar duplicatas por nome (manter a mais antiga)
    gruposNome.forEach((items, chave) => {
      if (items.length > 1) {
        // Manter o primeiro (mais antigo), desativar os demais
        items.slice(1).forEach(item => {
          idsParaDesativar.push(item.id);
          duplicatasRemovidas++;
        });
        console.log(`📝 Nome: ${chave} - ${items.length - 1} duplicatas encontradas`);
      }
    });

    // Desativar todas as duplicatas de uma vez
    if (idsParaDesativar.length > 0) {
      const { error: erroDesativar } = await supabase
        .from('normalizacoes_estabelecimentos')
        .update({ ativo: false, updated_at: new Date().toISOString() })
        .in('id', idsParaDesativar);

      if (erroDesativar) throw erroDesativar;
    }

    console.log(`✅ Limpeza concluída: ${duplicatasRemovidas} duplicatas desativadas`);

    return new Response(
      JSON.stringify({
        success: true,
        duplicatasRemovidas,
        message: duplicatasRemovidas === 0 
          ? 'Nenhuma duplicata encontrada' 
          : `${duplicatasRemovidas} duplicatas foram desativadas com sucesso`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro ao limpar duplicatas:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
