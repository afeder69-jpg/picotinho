import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { produtoIds } = await req.json();

    if (!produtoIds || !Array.isArray(produtoIds) || produtoIds.length === 0) {
      throw new Error("Lista de IDs de produtos inválida");
    }

    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_SEARCH_API_KEY");
    const GOOGLE_ENGINE_ID = Deno.env.get("GOOGLE_SEARCH_ENGINE_ID");

    console.log(`✅ API Key carregada: ${GOOGLE_API_KEY ? 'SIM' : 'NÃO'}`);
    console.log(`✅ Engine ID carregado: ${GOOGLE_ENGINE_ID ? 'SIM' : 'NÃO'}`);

    if (!GOOGLE_API_KEY || !GOOGLE_ENGINE_ID) {
      throw new Error("Credenciais do Google não configuradas");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar produtos sem imagem
    const { data: produtos, error: produtosError } = await supabase
      .from("produtos_master_global")
      .select("*")
      .in("id", produtoIds)
      .is("imagem_url", null);

    if (produtosError) throw produtosError;

    const resultados = [];

    for (const produto of produtos || []) {
      try {
        // Construir query de busca
        const queryParts = [
          produto.marca,
          produto.nome_base,
          produto.qtd_valor && produto.qtd_unidade
            ? `${produto.qtd_valor}${produto.qtd_unidade}`
            : null,
        ].filter(Boolean);

        const query = queryParts.join(" ");

        console.log(`🔍 Buscando imagem para: ${query}`);
        console.log(`📡 Parâmetros: imgSize=MEDIUM, num=3`);

        // Chamar Google Custom Search API
        const searchUrl =
          `https://www.googleapis.com/customsearch/v1?` +
          `key=${GOOGLE_API_KEY}&` +
          `cx=${GOOGLE_ENGINE_ID}&` +
          `q=${encodeURIComponent(query)}&` +
          `searchType=image&` +
          `imgSize=MEDIUM&` +
          `num=3`;

        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();

        if (searchData.error) {
          console.error('❌ Erro detalhado da API Google:', JSON.stringify(searchData.error, null, 2));
          throw new Error(searchData.error.message || 'Erro desconhecido da API');
        }

        if (!searchData.items || searchData.items.length === 0) {
          resultados.push({
            produtoId: produto.id,
            skuGlobal: produto.sku_global,
            nomeProduto: produto.nome_padrao,
            status: "error",
            error: "Nenhuma imagem encontrada",
            query,
          });
          continue;
        }

        // Tentar baixar cada imagem até conseguir uma válida
        let imagemUrl: string | null = null;
        let imagemBlob: Blob | null = null;

        for (const item of searchData.items) {
          try {
            const imageResponse = await fetch(item.link, {
              headers: {
                "User-Agent": "Mozilla/5.0",
              },
            });

            if (!imageResponse.ok) continue;

            const contentType = imageResponse.headers.get("content-type");
            if (
              !contentType ||
              !["image/jpeg", "image/png", "image/webp"].includes(contentType)
            ) {
              continue;
            }

            const blob = await imageResponse.blob();

            // Validar tamanho (max 5MB)
            if (blob.size > 5 * 1024 * 1024) {
              console.log(`Imagem muito grande: ${blob.size} bytes`);
              continue;
            }

            imagemUrl = item.link;
            imagemBlob = blob;
            break;
          } catch (error) {
            console.error(`Erro ao baixar imagem: ${error}`);
            continue;
          }
        }

        if (!imagemUrl || !imagemBlob) {
          resultados.push({
            produtoId: produto.id,
            skuGlobal: produto.sku_global,
            nomeProduto: produto.nome_padrao,
            status: "error",
            error: "Não foi possível baixar nenhuma imagem válida",
            query,
          });
          continue;
        }

        // Upload para Storage
        const fileName = `${produto.sku_global}.jpg`;
        const filePath = `produtos-master/${fileName}`;

        const arrayBuffer = await imagemBlob.arrayBuffer();
        const { error: uploadError } = await supabase.storage
          .from("produtos-master-fotos")
          .upload(filePath, arrayBuffer, {
            contentType: "image/jpeg",
            upsert: true,
          });

        if (uploadError) {
          throw uploadError;
        }

        // Obter URL pública
        const { data: urlData } = supabase.storage
          .from("produtos-master-fotos")
          .getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl;

        // Calcular confiança baseada na posição do resultado
        const posicao = searchData.items.findIndex((item: any) => item.link === imagemUrl);
        const confianca = posicao === 0 ? 95 : posicao === 1 ? 85 : 75;

        resultados.push({
          produtoId: produto.id,
          skuGlobal: produto.sku_global,
          nomeProduto: produto.nome_padrao,
          imageUrl: publicUrl,
          imagemPath: filePath,
          confianca,
          query,
          status: "success",
        });

        console.log(`✅ Imagem processada: ${produto.nome_padrao}`);
      } catch (error: any) {
        console.error(`Erro ao processar ${produto.nome_padrao}:`, error);
        resultados.push({
          produtoId: produto.id,
          skuGlobal: produto.sku_global,
          nomeProduto: produto.nome_padrao,
          status: "error",
          error: error.message,
        });
      }

      // Rate limiting: aguardar 2 segundos entre buscas
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return new Response(
      JSON.stringify({
        success: true,
        processados: produtos?.length || 0,
        resultados,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Erro na função:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
