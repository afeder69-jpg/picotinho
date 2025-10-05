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
    const { produtoIds, customQueries } = await req.json();

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

    // Buscar produtos - se houver customQueries, permite buscar produtos que já têm imagem
    const hasCustomQueries = customQueries && Object.keys(customQueries).length > 0;
    
    let query = supabase
      .from("produtos_master_global")
      .select("*")
      .in("id", produtoIds);
    
    // Apenas filtrar por imagem nula se NÃO for busca customizada
    if (!hasCustomQueries) {
      query = query.is("imagem_url", null);
    }
    
    const { data: produtos, error: produtosError } = await query;

    if (produtosError) throw produtosError;

    const resultados = [];

    for (const produto of produtos || []) {
      try {
        // Construir query de busca
        // Se há uma query customizada para este produto, usar ela
        const customQuery = customQueries?.[produto.id];
        const isCustomSearch = !!customQuery;
        
        const query = customQuery || [
          produto.marca,
          produto.nome_base,
          produto.qtd_valor && produto.qtd_unidade
            ? `${produto.qtd_valor}${produto.qtd_unidade}`
            : null,
        ].filter(Boolean).join(" ");

        console.log(`🔍 Buscando imagem para: ${query}`);
        console.log(`${customQuery ? '🎯 Query customizada' : '📋 Query padrão'}`);
        console.log(`📡 Parâmetros: imgSize=MEDIUM, num=3`);
        
        // Se for busca customizada, deletar imagem antiga primeiro
        if (isCustomSearch) {
          const oldFilePath = `produtos-master/${produto.sku_global}.jpg`;
          console.log(`🗑️ Deletando imagem antiga: ${oldFilePath}`);
          
          await supabase.storage
            .from("produtos-master-fotos")
            .remove([oldFilePath]);
        }

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

        // Coletar TODAS as imagens válidas (até 3)
        const imagensValidas: Array<{
          url: string;
          blob: Blob;
          titulo: string;
          contexto: string;
        }> = [];

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

            imagensValidas.push({
              url: item.link,
              blob: blob,
              titulo: item.title || '',
              contexto: item.snippet || ''
            });

            // Coletar até 3 imagens
            if (imagensValidas.length >= 3) break;
            
          } catch (error) {
            console.error(`Erro ao baixar imagem: ${error}`);
            continue;
          }
        }

        if (imagensValidas.length === 0) {
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

        // Upload de TODAS as imagens válidas para o Storage
        const opcoesImagens = [];

        for (let i = 0; i < imagensValidas.length; i++) {
          const imagem = imagensValidas[i];
          const sufixo = i === 0 ? '' : `_opcao${i + 1}`;
          const fileName = `${produto.sku_global}${sufixo}.jpg`;
          const filePath = `produtos-master/${fileName}`;
          
          const arrayBuffer = await imagem.blob.arrayBuffer();
          const { error: uploadError } = await supabase.storage
            .from("produtos-master-fotos")
            .upload(filePath, arrayBuffer, {
              contentType: "image/jpeg",
              upsert: true,
            });

          if (uploadError) {
            console.error(`Erro ao fazer upload da opção ${i + 1}:`, uploadError);
            continue;
          }

          // Obter URL pública
          const { data: urlData } = supabase.storage
            .from("produtos-master-fotos")
            .getPublicUrl(filePath);

          opcoesImagens.push({
            imageUrl: urlData.publicUrl,
            imagemPath: filePath,
            titulo: imagem.titulo,
            contexto: imagem.contexto,
            posicao: i + 1,
            confianca: i === 0 ? 95 : i === 1 ? 85 : 75
          });
        }

        console.log(`✅ ${opcoesImagens.length} imagens processadas para: ${produto.nome_padrao}`);

        resultados.push({
          produtoId: produto.id,
          skuGlobal: produto.sku_global,
          nomeProduto: produto.nome_padrao,
          opcoesImagens,
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
