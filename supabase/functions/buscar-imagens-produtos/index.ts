import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Configuração de ranking ───────────────────────────────────────────────

const DOMINIOS_PREFERENCIAIS = [
  'amazon.com.br', 'mercadolivre.com.br', 'shopee.com.br',
  'magazineluiza.com.br', 'americanas.com', 'casasbahia.com.br',
  'paodeacucar.com', 'carrefour.com.br', 'extra.com.br',
  'bistek.com.br', 'savegnago.com.br', 'sams.com.br',
  'condor.com.br', 'atacadao.com.br', 'assai.com.br',
  'static-americanas.b2w.io', 'a-static.mlcdn.com.br',
  'images-americanas.b2w.io', 'cf.shopee.com.br',
];

const DOMINIOS_EVITAR = [
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
  'youtube.com', 'tiktok.com', 'pinterest.com', 'reddit.com',
  'blogspot.com', 'wordpress.com', 'wp.com',
  'flickr.com', 'tumblr.com',
];

const PALAVRAS_CONTEXTO_NEGATIVO = [
  'receita', 'recipe', 'como fazer', 'prateleira', 'gondola',
  'carrinho', 'supermercado interior', 'loja interior',
  'banner', 'promoção', 'oferta', 'encarte', 'folheto',
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSearchQuery(produto: any, customQuery?: string): string {
  // Query customizada é usada LITERALMENTE
  if (customQuery) return customQuery;

  // Usar nome_padrao como base (já contém marca + nome + variante + gramagem)
  const base = produto.nome_padrao || [
    produto.marca,
    produto.nome_base,
    produto.qtd_valor && produto.qtd_unidade
      ? `${produto.qtd_valor}${produto.qtd_unidade}`
      : null,
  ].filter(Boolean).join(' ');

  return `${base} embalagem produto`;
}

interface GoogleItem {
  link: string;
  title?: string;
  snippet?: string;
  displayLink?: string;
  image?: {
    height?: number;
    width?: number;
    byteSize?: number;
    contextLink?: string;
  };
}

function scoreItem(item: GoogleItem, nomeProdutoNorm: string): number {
  let score = 0;
  const domain = (item.displayLink || '').toLowerCase();
  const titleNorm = normalizar(item.title || '');
  const snippetNorm = normalizar(item.snippet || '');
  const contextNorm = normalizar(item.image?.contextLink || '');

  // 1. Domínio preferencial (+15) ou a evitar (-30)
  if (DOMINIOS_PREFERENCIAIS.some(d => domain.includes(d))) {
    score += 15;
  }
  if (DOMINIOS_EVITAR.some(d => domain.includes(d))) {
    score -= 30;
  }

  // 2. Matching textual: cada palavra do nome do produto presente no título (+8 cada)
  //    Este é o critério mais forte para garantir aderência ao produto correto
  const palavrasProduto = nomeProdutoNorm.split(' ').filter(p => p.length >= 3);
  let matchCount = 0;
  for (const palavra of palavrasProduto) {
    if (titleNorm.includes(palavra)) {
      matchCount++;
    }
  }
  if (palavrasProduto.length > 0) {
    // Pontuação proporcional: match completo vale muito
    const matchRatio = matchCount / palavrasProduto.length;
    score += Math.round(matchRatio * 50); // até 50 pontos por aderência textual
  }

  // 3. Contexto negativo no snippet ou título (-20)
  for (const neg of PALAVRAS_CONTEXTO_NEGATIVO) {
    if (snippetNorm.includes(neg) || titleNorm.includes(neg) || contextNorm.includes(neg)) {
      score -= 20;
      break; // penalizar só uma vez
    }
  }

  // 4. Proporção da imagem (critério auxiliar, +5 se próxima de 1:1 ou 3:4)
  if (item.image?.width && item.image?.height) {
    const ratio = item.image.width / item.image.height;
    // Embalagens são tipicamente entre 0.6 e 1.2
    if (ratio >= 0.6 && ratio <= 1.2) {
      score += 5;
    }
  }

  // 5. Imagem com tamanho razoável (+3)
  if (item.image?.width && item.image.width >= 300) {
    score += 3;
  }

  return score;
}

// ─── Handler principal ────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { produtoIds, customQueries } = await req.json();

    if (!produtoIds || !Array.isArray(produtoIds) || produtoIds.length === 0) {
      throw new Error("Lista de IDs de produtos inválida");
    }

    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_SEARCH_API_KEY");
    const GOOGLE_ENGINE_ID = Deno.env.get("GOOGLE_SEARCH_ENGINE_ID");

    if (!GOOGLE_API_KEY || !GOOGLE_ENGINE_ID) {
      throw new Error("Credenciais do Google não configuradas");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const hasCustomQueries = customQueries && Object.keys(customQueries).length > 0;

    let dbQuery = supabase
      .from("produtos_master_global")
      .select("*")
      .in("id", produtoIds);

    if (!hasCustomQueries) {
      dbQuery = dbQuery.is("imagem_url", null);
    }

    const { data: produtos, error: produtosError } = await dbQuery;
    if (produtosError) throw produtosError;

    const resultados = [];

    for (const produto of produtos || []) {
      try {
        const customQuery = customQueries?.[produto.id];
        const isCustomSearch = !!customQuery;
        const searchQuery = buildSearchQuery(produto, customQuery);
        const nomeProdutoNorm = normalizar(produto.nome_padrao || produto.nome_base || '');

        console.log(`🔍 Buscando: "${searchQuery}" ${isCustomSearch ? '(customizada)' : '(auto)'}`);

        // Deletar imagens antigas em busca customizada
        if (isCustomSearch) {
          await supabase.storage
            .from("produtos-master-fotos")
            .remove([
              `produtos-master/${produto.sku_global}.jpg`,
              `produtos-master/${produto.sku_global}_opcao2.jpg`,
              `produtos-master/${produto.sku_global}_opcao3.jpg`,
            ]);
        }

        // Google Custom Search: imgSize=LARGE + imgType=photo para fotos comerciais
        // customQuery sempre start=1 (sem offset aleatório)
        const startParam = isCustomSearch ? 1 : 1;
        const searchUrl =
          `https://www.googleapis.com/customsearch/v1?` +
          `key=${GOOGLE_API_KEY}&` +
          `cx=${GOOGLE_ENGINE_ID}&` +
          `q=${encodeURIComponent(searchQuery)}&` +
          `searchType=image&` +
          `imgSize=LARGE&` +
          `imgType=photo&` +
          `start=${startParam}&` +
          `num=10`;

        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();

        console.log(`📊 Google: ${searchData.items?.length || 0} resultados`);

        if (searchData.error) {
          console.error('❌ Erro Google:', JSON.stringify(searchData.error));
          throw new Error(searchData.error.message || 'Erro da API Google');
        }

        if (!searchData.items || searchData.items.length === 0) {
          resultados.push({
            produtoId: produto.id, skuGlobal: produto.sku_global,
            nomeProduto: produto.nome_padrao,
            status: "error", error: "Nenhuma imagem encontrada", query: searchQuery,
          });
          continue;
        }

        // ── Rankear TODOS os resultados antes de baixar ──
        const scored = (searchData.items as GoogleItem[]).map(item => ({
          item,
          score: scoreItem(item, nomeProdutoNorm),
        }));
        scored.sort((a, b) => b.score - a.score);

        console.log(`🏆 Ranking: ${scored.map(s => `${s.score}pts`).join(', ')}`);

        // ── Baixar as melhores até obter 3 válidas ──
        const imagensValidas: Array<{
          url: string; blob: Blob; titulo: string; contexto: string; score: number;
        }> = [];

        for (const { item, score } of scored) {
          if (imagensValidas.length >= 3) break;
          // Pular itens com score muito negativo
          if (score < -10) {
            console.log(`⏭️ Pulando (score=${score}): ${item.displayLink}`);
            continue;
          }

          try {
            const imageResponse = await fetch(item.link, {
              headers: { "User-Agent": "Mozilla/5.0" },
              signal: AbortSignal.timeout(5000),
            });

            if (!imageResponse.ok) continue;

            const contentType = imageResponse.headers.get("content-type");
            if (!contentType || !["image/jpeg", "image/png", "image/webp"].includes(contentType)) continue;

            const blob = await imageResponse.blob();
            if (blob.size > 5 * 1024 * 1024 || blob.size < 5000) continue; // min 5KB, max 5MB

            imagensValidas.push({
              url: item.link, blob, titulo: item.title || '',
              contexto: item.snippet || '', score,
            });
            console.log(`✅ #${imagensValidas.length} score=${score} ${item.displayLink}`);
          } catch {
            continue;
          }
        }

        if (imagensValidas.length === 0) {
          resultados.push({
            produtoId: produto.id, skuGlobal: produto.sku_global,
            nomeProduto: produto.nome_padrao,
            status: "error", error: "Nenhuma imagem válida após ranking", query: searchQuery,
          });
          continue;
        }

        // ── Upload ──
        const opcoesImagens = [];
        for (let i = 0; i < imagensValidas.length; i++) {
          const imagem = imagensValidas[i];
          const sufixo = i === 0 ? '' : `_opcao${i + 1}`;
          const filePath = `produtos-master/${produto.sku_global}${sufixo}.jpg`;

          const arrayBuffer = await imagem.blob.arrayBuffer();
          const { error: uploadError } = await supabase.storage
            .from("produtos-master-fotos")
            .upload(filePath, arrayBuffer, { contentType: "image/jpeg", upsert: true });

          if (uploadError) {
            console.error(`Erro upload opção ${i + 1}:`, uploadError);
            continue;
          }

          const { data: urlData } = supabase.storage
            .from("produtos-master-fotos")
            .getPublicUrl(filePath);

          opcoesImagens.push({
            imageUrl: urlData.publicUrl,
            imagemPath: filePath,
            titulo: imagem.titulo,
            contexto: imagem.contexto,
            posicao: i + 1,
            confianca: Math.min(99, 70 + imagem.score),
          });
        }

        console.log(`✅ ${opcoesImagens.length} imagens para: ${produto.nome_padrao}`);

        resultados.push({
          produtoId: produto.id, skuGlobal: produto.sku_global,
          nomeProduto: produto.nome_padrao, opcoesImagens,
          query: searchQuery, status: "success",
        });
      } catch (error: any) {
        console.error(`Erro ${produto.nome_padrao}:`, error);
        resultados.push({
          produtoId: produto.id, skuGlobal: produto.sku_global,
          nomeProduto: produto.nome_padrao,
          status: "error", error: error.message,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return new Response(
      JSON.stringify({ success: true, processados: produtos?.length || 0, resultados }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Erro na função:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
