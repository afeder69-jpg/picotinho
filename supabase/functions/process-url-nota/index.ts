/**
 * 🔄 FLUXO AUTOMÁTICO DE PROCESSAMENTO DE NOTAS FISCAIS
 * 
 * Este edge function é o PONTO DE ENTRADA do processamento automático de notas.
 * 
 * FLUXO COMPLETO (100% AUTOMÁTICO):
 * 1. QR Code escaneado → handleQRScanSuccess (BottomNavigation.tsx)
 * 2. → process-url-nota (ESTE ARQUIVO) - extrai dados e roteia
 * 3. → process-nfe-serpro OU process-nfce-infosimples OU extract-receipt-image
 * 4. → Salva dados_extraidos em notas_imagens
 * 5. → Frontend detecta via realtime (BottomNavigation.tsx)
 * 6. → processarNotaAutomaticamente() gera PDF e valida
 * 7. → validate-receipt verifica duplicatas
 * 8. → process-receipt-full processa estoque com normalização
 * 
 * ⚠️ NÃO HÁ CONFIRMAÇÃO MANUAL DO USUÁRIO
 * Todo o processo é automático após o scan do QR Code.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Verifica se um registro existente é um "fantasma" reaproveitável.
 * Critérios cumulativos (TODOS devem ser atendidos):
 * 1. Mesmo usuario_id
 * 2. processada = false
 * 3. Sem itens em dados_extraidos (array vazio ou inexistente)
 * 4. Sem valor_total em dados_extraidos
 * 5. Sem estabelecimento em dados_extraidos
 * 6. Sem processing_started_at ativo
 * 7. updated_at mais antigo que 5 minutos
 */
function isGhostRecord(record: any, currentUserId: string): boolean {
  if (record.usuario_id !== currentUserId) return false;
  if (record.processada !== false) return false;

  const dados = record.dados_extraidos;

  // Verificar itens
  const itens = dados?.itens;
  if (itens && Array.isArray(itens) && itens.length > 0) return false;

  // Verificar valor_total
  if (dados?.valor_total != null) return false;

  // Verificar estabelecimento (é um objeto na estrutura real)
  if (dados?.estabelecimento != null) return false;

  // Verificar se está em processamento ativo
  if (record.processing_started_at != null) return false;

  // Verificar idade: updated_at deve ter mais de 5 minutos
  const updatedAt = new Date(record.updated_at);
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  if (updatedAt > fiveMinutesAgo) return false;

  return true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { url, userId, chaveAcesso, tipoDocumento } = await req.json();

    if (!url || !userId) {
      throw new Error('URL e userId são obrigatórios');
    }

    console.log('🌐 Processando URL da nota:', {
      userId,
      url,
      tipoDocumento,
      chaveAcesso: chaveAcesso ? `${chaveAcesso.substring(0, 4)}...${chaveAcesso.substring(40)}` : 'não fornecida',
      timestamp: new Date().toISOString()
    });

    const extrairChaveDaUrl = (valor: string) => {
      try {
        const urlObj = new URL(valor);
        const params = urlObj.searchParams.get('p') || urlObj.searchParams.get('chNFe') || urlObj.searchParams.get('chave');
        if (params) {
          return params.split('|')[0].replace(/\D/g, '');
        }
      } catch (_) {
        // Ignorar e seguir para regex
      }

      const match = valor.match(/(\d{44})/);
      return match?.[1] ?? null;
    };

    const chave = (chaveAcesso || extrairChaveDaUrl(url) || '').replace(/\D/g, '');

    if (chave.length !== 44) {
      throw new Error('Não foi possível extrair uma chave de acesso válida com 44 dígitos');
    }

    const uf = chave.substring(0, 2);
    const modelo = chave.substring(20, 22);
    const tipoDetectado = modelo === '55' ? 'NFe' : modelo === '65' ? 'NFCe' : null;

    if (!tipoDetectado) {
      throw new Error(`Modelo de documento inválido na chave de acesso: ${modelo}. Use uma chave válida de NF-e (55) ou NFC-e (65)`);
    }

    console.log('🔑 Chave de acesso extraída:', `${chave.substring(0, 4)}...${chave.substring(40)}`);
    console.log(`📍 UF: ${uf}, Modelo: ${modelo} (${tipoDetectado})`);

    // 🔒 VERIFICAÇÃO ANTECIPADA: chave já existe em nota ativa?
    const { data: existing, error: checkError } = await supabase
      .from('notas_imagens')
      .select('id, usuario_id, processada, dados_extraidos, processing_started_at, updated_at')
      .eq('chave_acesso', chave)
      .neq('excluida', true)
      .limit(1);

    if (checkError) {
      console.error('⚠️ Erro ao verificar duplicidade:', checkError);
      // Em caso de erro na verificação, segue o fluxo normal (o índice único protege)
    } else if (existing && existing.length > 0) {
      const existingRecord = existing[0];

      // Verificar se é um fantasma reaproveitável
      if (isGhostRecord(existingRecord, userId)) {
        console.log('👻 Registro fantasma detectado, removendo para reprocessamento:', existingRecord.id);
        const { error: deleteError } = await supabase
          .from('notas_imagens')
          .delete()
          .eq('id', existingRecord.id);
        
        if (deleteError) {
          console.error('⚠️ Erro ao remover fantasma:', deleteError);
          // Se não conseguiu deletar, bloqueia como duplicata
          return new Response(
            JSON.stringify({ 
              error: 'NOTA_DUPLICADA',
              message: 'Essa nota fiscal já foi lançada no Picotinho e não pode ser enviada novamente.'
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 409 
            }
          );
        }
        console.log('✅ Fantasma removido, prosseguindo com novo processamento');
      } else {
        // Nota legítima — bloquear
        console.log('🚫 Chave de acesso já existe no sistema:', chave.substring(0, 4) + '...');
        return new Response(
          JSON.stringify({ 
            error: 'NOTA_DUPLICADA',
            message: 'Essa nota fiscal já foi lançada no Picotinho e não pode ser enviada novamente.'
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 409 
          }
        );
      }
    }

    const notaId = crypto.randomUUID();

    const { error: insertError } = await supabase
      .from('notas_imagens')
      .insert({
        id: notaId,
        usuario_id: userId,
        imagem_path: 'qrcode://url',
        imagem_url: url,
        processada: false,
        chave_acesso: chave,
        dados_extraidos: {
          chave_acesso: chave,
          uf_emitente: uf,
          modelo_documento: modelo,
          tipo_documento: tipoDetectado,
          url_original: url,
          metodo_captura: 'qrcode_url_direct',
          timestamp: new Date().toISOString()
        }
      });

    if (insertError) {
      console.error('❌ Erro ao criar nota:', insertError);
      if (insertError.message?.includes('idx_notas_imagens_chave_acesso_unique') || 
          insertError.code === '23505') {
        console.log('🚫 Race condition detectada - chave duplicada no INSERT');
        return new Response(
          JSON.stringify({ 
            error: 'NOTA_DUPLICADA',
            message: 'Essa nota fiscal já foi lançada no Picotinho e não pode ser enviada novamente.'
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 409 
          }
        );
      }
      throw insertError;
    }

    console.log('✅ Nota criada com sucesso:', notaId);

    let extracaoSucesso = false;

    if (modelo === '55') {
      console.log('📄 [NFE] Processando via InfoSimples...');

      const { data: nfeData, error: nfeError } = await supabase.functions.invoke('process-nfe-infosimples', {
        body: {
          chaveAcesso: chave,
          userId,
          notaImagemId: notaId
        }
      });

      if (nfeError) {
        console.error('⚠️ Erro ao processar NFe via InfoSimples (falha definitiva - única via):', nfeError);
      } else {
        console.log('✅ NFe processada via InfoSimples:', nfeData);
        extracaoSucesso = true;
      }
    } else if (modelo === '65' && uf === '33') {
      console.log('🎫 [NFCE-RJ] Processando via InfoSimples...');

      const { data: nfceData, error: nfceError } = await supabase.functions.invoke('process-nfce-infosimples', {
        body: {
          chaveAcesso: chave,
          userId,
          notaImagemId: notaId
        }
      });

      if (nfceError) {
        console.error('⚠️ Erro ao processar NFCe via InfoSimples:', nfceError);
        console.log('🔄 Tentando fallback via extração HTML...');

        const { data: extractData, error: extractError } = await supabase.functions.invoke('extract-receipt-image', {
          body: {
            notaImagemId: notaId,
            userId
          }
        });

        if (extractError) {
          console.error('⚠️ Erro no fallback HTML (falha definitiva - ambas vias falharam):', extractError);
        } else {
          console.log('✅ Fallback concluído:', extractData);
          extracaoSucesso = true;
        }
      } else {
        console.log('✅ NFCe-RJ processada via InfoSimples:', nfceData);
        extracaoSucesso = true;
      }
    } else if (modelo === '65') {
      console.log(`🎫 [NFCE-${uf}] Processando via extração HTML (UF não suportada pelo InfoSimples)...`);

      const { data: extractData, error: extractError } = await supabase.functions.invoke('extract-receipt-image', {
        body: {
          notaImagemId: notaId,
          userId
        }
      });

      if (extractError) {
        console.error('⚠️ Erro ao extrair NFCe (falha definitiva - única via):', extractError);
      } else {
        console.log('✅ NFCe extraída:', extractData);
        extracaoSucesso = true;
      }
    }

    // Se TODAS as vias de extração falharam: marcar como excluída e retornar erro
    if (!extracaoSucesso) {
      console.log('🧹 Falha definitiva de extração. Marcando nota como excluída para não poluir a tela:', notaId);
      const { error: cleanupError } = await supabase
        .from('notas_imagens')
        .update({ excluida: true, updated_at: new Date().toISOString() })
        .eq('id', notaId);

      if (cleanupError) {
        console.error('⚠️ Erro ao marcar nota como excluída no cleanup:', cleanupError);
      }

      return new Response(
        JSON.stringify({
          error: 'EXTRACAO_FALHOU',
          message: 'Não foi possível extrair os dados desta nota fiscal. Tente novamente.'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      );
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        notaId,
        message: 'URL processada e extração iniciada'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('❌ Erro ao processar URL:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'Erro ao processar URL da nota fiscal'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
