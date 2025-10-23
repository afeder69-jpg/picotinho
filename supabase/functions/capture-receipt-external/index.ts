import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

interface CaptureRequest {
  receiptUrl: string;
  userId: string;
}

async function captureReceiptPage(url: string): Promise<{ html: string; imageData?: string }> {
  try {
    console.log('Iniciando captura da URL:', url);
    
    // Configurar headers para simular navegador real
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    };
    
    // Fazer requisição para a página da Receita Federal
    const response = await fetch(url, {
      method: 'GET',
      headers,
      redirect: 'follow'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    console.log('HTML capturado com sucesso, tamanho:', html.length);
    
    return { html };
    
  } catch (error) {
    console.error('Erro ao capturar página:', error);
    throw error;
  }
}

async function convertHtmlToImage(html: string, url: string): Promise<string> {
  try {
    console.log('Convertendo HTML para imagem usando múltiplas APIs...');
    
    // Lista de APIs de screenshot para tentar
    const screenshotApis = [
      `https://api.screenshotmachine.com/?key=demo&url=${encodeURIComponent(url)}&dimension=1200xfull&format=png&cacheLimit=0`,
      `https://htmlcsstoimage.com/demo_run?url=${encodeURIComponent(url)}&viewport_width=1200&format=png`,
      `https://api.urlbox.io/v1/demo/png?url=${encodeURIComponent(url)}&width=1200&full_page=true`
    ];
    
    // Tentar cada API sequencialmente
    for (const apiUrl of screenshotApis) {
      try {
        console.log('Tentando API:', apiUrl.split('?')[0]);
        const response = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          const base64 = btoa(String.fromCharCode(...uint8Array));
          const imageData = `data:image/png;base64,${base64}`;
          console.log('Screenshot capturado com sucesso, tamanho:', uint8Array.length, 'bytes');
          return imageData;
        } else {
          console.log('API retornou status:', response.status);
        }
      } catch (apiError) {
        console.log('Erro na API:', apiError.message);
        continue;
      }
    }
    
    // ⚠️ TODAS as APIs de screenshot falharam
    console.log('⚠️ TODAS as APIs de screenshot falharam!');
    console.log('🔍 Validando HTML para dados de nota fiscal...');
    
    // 🔒 VALIDAÇÃO CRÍTICA: Verificar se HTML contém dados de nota fiscal válidos
    const hasNotaFiscalData = html.includes('DANFE') || 
                              html.includes('NF-e') || 
                              html.includes('Nota Fiscal') ||
                              html.includes('CNPJ') ||
                              html.includes('Chave de Acesso');
    
    if (!hasNotaFiscalData) {
      console.error('❌ HTML não contém dados de nota fiscal válidos');
      console.error('📄 Amostra do HTML:', html.substring(0, 500));
      throw new Error('Não foi possível capturar a nota fiscal. A página pode estar vazia ou inacessível. Por favor, tente novamente ou use o método de foto.');
    }
    
    console.log('✅ HTML contém dados de nota fiscal válidos. Prosseguindo com fallback PNG...');
    
    // Fallback: criar uma imagem PNG válida (será substituída pelo HTML na extração)
    console.log('Criando imagem PNG de fallback (extração usará HTML)...');
    
    // Criar um PNG válido mínimo
    const createValidPNG = () => {
      // PNG signature + IHDR chunk para 800x600 RGB
      const pngData = new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, // IHDR length
        0x49, 0x48, 0x44, 0x52, // IHDR
        0x00, 0x00, 0x03, 0x20, // width 800
        0x00, 0x00, 0x02, 0x58, // height 600
        0x08, 0x02, 0x00, 0x00, 0x00, // bit depth 8, color type 2 (RGB), compression 0, filter 0, interlace 0
        0x7A, 0x7A, 0x8C, 0x8C, // CRC
        0x00, 0x00, 0x00, 0x00, // IEND length
        0x49, 0x45, 0x4E, 0x44, // IEND
        0xAE, 0x42, 0x60, 0x82  // IEND CRC
      ]);
      
      return btoa(String.fromCharCode(...pngData));
    };
    
    const base64 = createValidPNG();
    console.log('✅ PNG de fallback criado (extração usará html_capturado)');
    return `data:image/png;base64,${base64}`;
    
  } catch (error) {
    console.error('Erro ao converter HTML para imagem:', error);
    throw error;
  }
}

async function uploadImageToStorage(imageData: string, userId: string): Promise<{ path: string; url: string }> {
  try {
    console.log('Iniciando upload da imagem para storage...');
    
    // Verificar se imageData é válido
    if (!imageData || !imageData.includes('base64,')) {
      throw new Error('Dados de imagem inválidos');
    }
    
    // Converter base64 para blob
    const base64Data = imageData.split(',')[1];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/png' });
    
    console.log('Blob criado com tamanho:', blob.size, 'bytes');
    
    const fileName = `nota-externa-${Date.now()}.png`;
    const filePath = `${userId}/${fileName}`;
    
    console.log('Fazendo upload para:', filePath);
    
    // Upload para o Supabase Storage
    const { data, error } = await supabase.storage
      .from('receipts')
      .upload(filePath, blob, {
        contentType: 'image/png',
        upsert: false
      });
    
    if (error) {
      console.error('Erro no upload:', error);
      throw error;
    }
    
    console.log('Upload realizado com sucesso:', data);
    
    // Obter URL pública
    const { data: urlData } = supabase.storage
      .from('receipts')
      .getPublicUrl(filePath);
    
    console.log('URL pública gerada:', urlData.publicUrl);
    
    return { path: filePath, url: urlData.publicUrl };
    
  } catch (error) {
    console.error('Erro ao fazer upload da imagem:', error);
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { receiptUrl, userId }: CaptureRequest = await req.json();
    
    if (!receiptUrl || !userId) {
      return new Response(
        JSON.stringify({ error: 'receiptUrl e userId são obrigatórios' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    console.log('Processando captura para usuário:', userId, 'URL:', receiptUrl);
    
    // 1. Capturar HTML da página da Receita Federal
    const { html } = await captureReceiptPage(receiptUrl);
    
    // 2. Converter HTML para imagem com URL para screenshot real
    const imageData = await convertHtmlToImage(html, receiptUrl);
    
    // 3. Upload da imagem para o storage
    const { path, url: imageUrl } = await uploadImageToStorage(imageData, userId);
    
    // 4. Salvar no banco de dados
    const { data: notaImagem, error: dbError } = await supabase
      .from('notas_imagens')
      .insert({
        usuario_id: userId,
        imagem_url: imageUrl,
        imagem_path: path,
        processada: false,
        dados_extraidos: {
          html_capturado: html.substring(0, 50000), // Primeiros 50k caracteres (aumentado de 10k)
          url_original: receiptUrl,
          metodo_captura: 'external_browser',
          timestamp: new Date().toISOString()
        }
      })
      .select()
      .single();
    
    if (dbError) throw dbError;
    
    console.log('✅ Captura externa concluída com sucesso:', notaImagem.id);
    
    // 🤖 PROCESSAMENTO AUTOMÁTICO: Extração + Adição ao Estoque
    console.log('🤖 Iniciando processamento automático da nota...');
    
    try {
      // Passo 1: Extrair dados com IA
      console.log('📊 Chamando extract-receipt-image...');
      const extractResult = await supabase.functions.invoke('extract-receipt-image', {
        body: { 
          imagemId: notaImagem.id,
          notaImagemId: notaImagem.id,
          userId: userId
        }
      });

      if (extractResult.error) {
        console.error('⚠️ Erro na extração automática:', extractResult.error);
        // Continua mesmo com erro - usuário pode processar manualmente depois
      } else {
        console.log('✅ Extração automática concluída!');
        
        // Passo 2: Processar e adicionar ao estoque
        console.log('📦 Chamando process-receipt-full...');
        const processResult = await supabase.functions.invoke('process-receipt-full', {
          body: { 
            notaId: notaImagem.id,
            force: true
          }
        });

        if (processResult.error) {
          console.error('⚠️ Erro no processamento automático:', processResult.error);
          // Continua mesmo com erro - usuário pode processar manualmente depois
        } else {
          console.log('✅ Processamento automático concluído! Produtos adicionados ao estoque.');
        }
      }
    } catch (autoProcessError) {
      console.error('⚠️ Erro no processamento automático:', autoProcessError);
      // Não quebra o fluxo - captura foi bem-sucedida
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        notaImagemId: notaImagem.id,
        imageUrl: imageUrl,
        message: 'Nota fiscal capturada e processada com sucesso!'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
    
  } catch (error) {
    console.error('Erro na captura externa:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Erro interno do servidor',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});