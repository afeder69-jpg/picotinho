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

    const { imagemId } = await req.json();

    if (!imagemId) {
      return new Response(
        JSON.stringify({ error: 'ID da imagem é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔍 Processando nota fiscal: ${imagemId}`);

    // Buscar nota existente
    const { data: notaImagem, error: notaError } = await supabase
      .from('notas_imagens')
      .select('*')
      .eq('id', imagemId)
      .single();

    if (notaError || !notaImagem) {
      throw new Error(`Nota não encontrada: ${notaError?.message}`);
    }

    if (!notaImagem.dados_extraidos) {
      throw new Error('Nota ainda não foi processada pela IA');
    }

    // Extrair dados da nota uma única vez
    const extractedData = notaImagem.dados_extraidos as any;
    
    // ✅ SIMPLIFICADO: Confiar na IA-1 para validação de duplicidade
    // Se a nota chegou aqui, ela é inédita e deve ser processada normalmente
    console.log(`🚀 Processando nota inédita validada pela IA-1: ${imagemId}`);
    console.log('✅ Dados extraídos carregados - iniciando inserção direta no estoque');

    // Verificar se há produtos para processar
    const listaItens = extractedData.produtos || extractedData.itens;
    if (!listaItens || !Array.isArray(listaItens) || listaItens.length === 0) {
      throw new Error('Nota não contém produtos válidos para processar');
    }

    // 🏪 APLICAR NORMALIZAÇÃO DO ESTABELECIMENTO LOGO NO INÍCIO
    const nomeOriginalEstabelecimento = extractedData?.supermercado?.nome || 
                                      extractedData?.estabelecimento?.nome || 
                                      extractedData?.emitente?.nome;
    
    if (nomeOriginalEstabelecimento && typeof nomeOriginalEstabelecimento === 'string') {
      console.log(`🏪 Normalizando estabelecimento: "${nomeOriginalEstabelecimento}"`);
      
      const { data: nomeNormalizado, error: normError } = await supabase.rpc('normalizar_nome_estabelecimento', {
        nome_input: nomeOriginalEstabelecimento
      });
      
      if (normError) {
        console.error('❌ Erro na normalização:', normError);
      }
      
      const estabelecimentoNormalizado = nomeNormalizado || nomeOriginalEstabelecimento.toUpperCase();
      
      // Aplicar normalização em todos os locais possíveis nos dados extraídos
      if (extractedData.supermercado) {
        extractedData.supermercado.nome = estabelecimentoNormalizado;
      }
      if (extractedData.estabelecimento) {
        extractedData.estabelecimento.nome = estabelecimentoNormalizado;
      }
      if (extractedData.emitente) {
        extractedData.emitente.nome = estabelecimentoNormalizado;
      }
      
      // 💾 Salvar dados normalizados de volta na tabela notas_imagens
        const { error: updateError } = await supabase
          .from('notas_imagens')
          .update({ 
            dados_extraidos: extractedData,
            updated_at: new Date().toISOString()
          })
          .eq('id', imagemId);
      
      if (updateError) {
        console.error('❌ Erro ao salvar dados normalizados:', updateError);
      } else {
        console.log(`✅ Estabelecimento normalizado: "${nomeOriginalEstabelecimento}" → "${estabelecimentoNormalizado}"`);
      }
    } else {
      console.log('⚠️ Nome do estabelecimento não encontrado ou inválido');
    }

    // ✅ GRAVADOR CEGO: Inserir apenas os itens da nota atual no estoque
    console.log(`📦 Iniciando inserção dos ${listaItens.length} itens da nota no estoque...`);

    // ✅ GRAVADOR CEGO: SIMPLESMENTE INSERIR TUDO SEM VALIDAÇÃO QUE BLOQUEIA
    if (listaItens && Array.isArray(listaItens)) {
      console.log(`📦 GRAVADOR CEGO - Inserindo ${listaItens.length} itens da IA-2 exatamente como foram extraídos...`);
      
      let itensProcessados = 0;
      let itensComErro = 0;
      
      for (let index = 0; index < listaItens.length; index++) {
        const item = listaItens[index];
        try {
          // ✅ GRAVADOR CEGO - EXTRAIR DADOS EXATOS DA IA-2
          const nomeExato = item.nome || item.descricao;
          const quantidadeExata = item.quantidade;
          const precoUnitarioExato = item.valor_unitario || item.precoUnitario;
          const categoriaExata = item.categoria || 'outros';
          const unidadeExata = item.unidade || 'UN';

          if (!nomeExato || nomeExato.trim() === '') {
            continue; // Pular itens sem nome
          }

          // ✅ INSERIR PRODUTO EXATAMENTE COMO A IA-2 ENTREGOU - SEM VALIDAÇÕES QUE IMPEDEM
          const { error: insertError } = await supabase
            .from('estoque_app')
            .insert({
              user_id: notaImagem.usuario_id,
              produto_nome: nomeExato,
              categoria: categoriaExata || 'outros',
              quantidade: quantidadeExata,
              unidade_medida: unidadeExata,
              preco_unitario_ultimo: precoUnitarioExato,
              origem: 'nota_fiscal'
            });

          if (insertError) {
            console.error(`❌ ERRO ao inserir item ${index + 1}:`, insertError);
            itensComErro++;
          } else {
            console.log(`✅ Item ${index + 1} inserido: ${nomeExato} - ${quantidadeExata} ${unidadeExata} - R$ ${precoUnitarioExato}`);
            itensProcessados++;
          }

        } catch (error) {
          console.error(`❌ Erro ao processar item ${index + 1}:`, error);
          itensComErro++;
        }
      }

      console.log(`✅ GRAVADOR CEGO FINALIZADO: ${itensProcessados} itens inseridos, ${itensComErro} erros`);
    }

    // ✅ Marcar nota como processada
    if (!notaImagem.processada) {
      const { error: updateError } = await supabase
        .from('notas_imagens')
        .update({
          processada: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', imagemId);

      if (updateError) {
        console.error('❌ Erro ao atualizar nota:', updateError);
      } else {
        console.log('✅ Nota marcada como processada com sucesso');
      }
    }

    console.log('✅ Processamento completo da nota fiscal!');

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Nota fiscal processada e estoque atualizado com sucesso!'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro geral:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});