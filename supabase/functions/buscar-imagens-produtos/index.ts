import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Configuração ──────────────────────────────────────────────────────────

const MAX_FILENAME_LENGTH = 120;

const DOMINIOS_PREFERENCIAIS = [
  'amazon.com.br', 'mercadolivre.com.br', 'shopee.com.br',
  'magazineluiza.com.br', 'americanas.com', 'casasbahia.com.br',
  'paodeacucar.com', 'carrefour.com.br', 'extra.com.br',
  'bistek.com.br', 'savegnago.com.br', 'sams.com.br',
  'condor.com.br', 'atacadao.com.br', 'assai.com.br',
  'static-americanas.b2w.io', 'a-static.mlcdn.com.br',
  'images-americanas.b2w.io', 'cf.shopee.com.br',
  'openfoodfacts.org',
];

const DOMINIOS_EVITAR = [
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
  'youtube.com', 'tiktok.com', 'pinterest.com', 'reddit.com',
  'blogspot.com', 'wordpress.com', 'wp.com',
  'flickr.com', 'tumblr.com',
  'kwai.com', 'likee.com',
];

const EXCLUSOES_SITE_QUERY = [
  'tiktok.com', 'youtube.com', 'facebook.com', 'instagram.com',
  'pinterest.com', 'twitter.com', 'x.com', 'kwai.com', 'reddit.com',
];

const PALAVRAS_CONTEXTO_NEGATIVO = [
  'receita', 'recipe', 'como fazer', 'prateleira', 'gondola',
  'carrinho', 'supermercado interior', 'loja interior',
  'banner', 'promoção', 'oferta', 'encarte', 'folheto',
  'video', 'shorts', 'reels', 'review', 'unboxing',
  'comparativo', 'teste', 'testando',
  'mao', 'segurando', 'pessoa', 'screenshot', 'montagem',
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

function sanitizeFilePath(sku: string, produtoId: string): string {
  let sanitized = sku
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // remove acentos
    .replace(/\//g, '-')              // barra → traço
    .replace(/[^a-zA-Z0-9_\-\.]/g, '_'); // chars inválidos → underscore

  const suffix = `_${produtoId.substring(0, 8)}`;
  const maxBase = MAX_FILENAME_LENGTH - suffix.length;
  if (sanitized.length > maxBase) {
    sanitized = sanitized.substring(0, maxBase);
  }
  return `${sanitized}${suffix}`;
}

function isNomePadraoConfiavel(nomePadrao: string | null): boolean {
  if (!nomePadrao) return false;
  const palavras = nomePadrao.trim().split(/\s+/);
  if (palavras.length < 2) return false;

  const significativas = palavras.filter(p => p.length >= 3);
  if (significativas.length < 2) return false;

  // Detectar excesso de abreviações (>50% das palavras com <=3 chars)
  const abreviacoes = palavras.filter(p => p.length <= 3 && p.length > 0);
  if (palavras.length >= 3 && abreviacoes.length / palavras.length > 0.5) return false;

  return true;
}

function buildSearchQuery(produto: any, customQuery?: string): string {
  // Query customizada é usada LITERALMENTE — sem sufixos, sem exclusões
  if (customQuery) return customQuery;

  let base: string;
  if (isNomePadraoConfiavel(produto.nome_padrao)) {
    base = produto.nome_padrao;
  } else {
    // Fallback: montar a partir dos campos individuais
    base = [
      produto.marca,
      produto.nome_base,
      produto.qtd_valor && produto.qtd_unidade
        ? `${produto.qtd_valor}${produto.qtd_unidade}`
        : null,
    ].filter(Boolean).join(' ');
    console.log(`⚠️ nome_padrao não confiável ("${produto.nome_padrao}"), usando fallback: "${base}"`);
  }

  if (!base || base.trim().length < 3) {
    base = produto.nome_base || produto.nome_padrao || 'produto';
  }

  // Exclusões de site para limpar resultados na origem
  const exclusoes = EXCLUSOES_SITE_QUERY.map(d => `-site:${d}`).join(' ');

  return `${base} embalagem produto ${exclusoes}`;
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

  // 1. Domínio preferencial (+15) ou a evitar (-50)
  if (DOMINIOS_PREFERENCIAIS.some(d => domain.includes(d))) score += 15;
  if (DOMINIOS_EVITAR.some(d => domain.includes(d))) score -= 50;

  // 2. Matching textual: palavras do nome no título (até 50pts)
  const palavrasProduto = nomeProdutoNorm.split(' ').filter(p => p.length >= 3);
  if (palavrasProduto.length > 0) {
    let matchCount = 0;
    for (const palavra of palavrasProduto) {
      if (titleNorm.includes(palavra)) matchCount++;
    }
    const matchRatio = matchCount / palavrasProduto.length;
    score += Math.round(matchRatio * 50);
  }

  // 3. Contexto negativo (-20, uma vez)
  for (const neg of PALAVRAS_CONTEXTO_NEGATIVO) {
    if (snippetNorm.includes(neg) || titleNorm.includes(neg) || contextNorm.includes(neg)) {
      score -= 20;
      break;
    }
  }

  // 4. Proporção da imagem (auxiliar, +5 se 0.6–1.2)
  if (item.image?.width && item.image?.height) {
    const ratio = item.image.width / item.image.height;
    if (ratio >= 0.6 && ratio <= 1.2) score += 5;
  }

  // 5. Tamanho razoável (+3)
  if (item.image?.width && item.image.width >= 300) score += 3;

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
        const safeFileName = sanitizeFilePath(produto.sku_global, produto.id);

        console.log(`🔍 Buscando: "${searchQuery}" ${isCustomSearch ? '(customizada)' : '(auto)'}`);
        console.log(`📁 FilePath base: ${safeFileName}`);

        // Deletar imagens antigas em busca customizada (usando mesmo sanitize)
        if (isCustomSearch) {
          await supabase.storage
            .from("produtos-master-fotos")
            .remove([
              `produtos-master/${safeFileName}.jpg`,
              `produtos-master/${safeFileName}_opcao2.jpg`,
              `produtos-master/${safeFileName}_opcao3.jpg`,
            ]);
        }

        const searchUrl =
          `https://www.googleapis.com/customsearch/v1?` +
          `key=${GOOGLE_API_KEY}&` +
          `cx=${GOOGLE_ENGINE_ID}&` +
          `q=${encodeURIComponent(searchQuery)}&` +
          `searchType=image&` +
          `imgSize=LARGE&` +
          `imgType=photo&` +
          `start=1&` +
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
            status: "no_results", error: "Nenhuma imagem encontrada pelo Google", query: searchQuery,
          });
          continue;
        }

        // ── Rankear TODOS os resultados ──
        const scored = (searchData.items as GoogleItem[]).map(item => ({
          item,
          score: scoreItem(item, nomeProdutoNorm),
        }));
        scored.sort((a, b) => b.score - a.score);

        console.log(`🏆 Ranking: ${scored.map(s => `${s.score}pts(${s.item.displayLink})`).join(', ')}`);

        // Score mínimo dinâmico: aceita até 40pts abaixo do melhor, mínimo 0
        const melhorScore = scored[0].score;
        const scoreMinimo = Math.max(0, melhorScore - 40);
        console.log(`📏 Score mínimo: ${scoreMinimo} (melhor: ${melhorScore})`);

        // ── Baixar as melhores até obter 3 válidas ──
        const imagensValidas: Array<{
          url: string; blob: Blob; titulo: string; contexto: string; score: number;
        }> = [];

        for (const { item, score } of scored) {
          if (imagensValidas.length >= 3) break;
          if (score < scoreMinimo) {
            console.log(`⏭️ Pulando (score=${score} < min=${scoreMinimo}): ${item.displayLink}`);
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
            if (blob.size > 5 * 1024 * 1024 || blob.size < 5000) continue;

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
            status: "no_valid_images",
            error: `Nenhuma imagem válida (${scored.length} resultados, scoreMin=${scoreMinimo})`,
            query: searchQuery,
          });
          continue;
        }

        // ── Upload ──
        const opcoesImagens = [];
        let uploadErrors = 0;

        for (let i = 0; i < imagensValidas.length; i++) {
          const imagem = imagensValidas[i];
          const sufixo = i === 0 ? '' : `_opcao${i + 1}`;
          const filePath = `produtos-master/${safeFileName}${sufixo}.jpg`;

          const arrayBuffer = await imagem.blob.arrayBuffer();
          const { error: uploadError } = await supabase.storage
            .from("produtos-master-fotos")
            .upload(filePath, arrayBuffer, { contentType: "image/jpeg", upsert: true });

          if (uploadError) {
            uploadErrors++;
            console.error(`❌ Upload falhou opção ${i + 1} (${filePath}):`, uploadError.message);
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
          console.log(`💾 Upload OK: ${filePath}`);
        }

        // Determinar status preciso
        let status: string;
        if (opcoesImagens.length === 0 && uploadErrors > 0) {
          status = "upload_failed";
        } else if (opcoesImagens.length > 0 && uploadErrors > 0) {
          status = "partial_success";
        } else {
          status = "success";
        }

        console.log(`📦 ${status}: ${opcoesImagens.length} salvas, ${uploadErrors} falhas upload — ${produto.nome_padrao}`);

        resultados.push({
          produtoId: produto.id, skuGlobal: produto.sku_global,
          nomeProduto: produto.nome_padrao, opcoesImagens,
          query: searchQuery, status,
          ...(uploadErrors > 0 ? { uploadErrors } : {}),
        });
      } catch (error: any) {
        console.error(`❌ Erro ${produto.nome_padrao}:`, error);
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
