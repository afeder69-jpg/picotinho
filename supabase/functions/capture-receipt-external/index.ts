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

async function convertHtmlToImage(html: string): Promise<string> {
  try {
    // Para converter HTML para imagem no servidor, usaremos um serviço de conversão
    // Por simplicidade, vamos simular uma conversão e usar base64 do HTML como placeholder
    
    // Em produção real, você usaria bibliotecas como puppeteer ou similar
    // Aqui vamos criar um base64 placeholder que representa o HTML capturado
    const htmlData = new TextEncoder().encode(html);
    const base64Html = btoa(String.fromCharCode(...htmlData));
    
    // Simular uma imagem PNG base64 (placeholder)
    const placeholderImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    
    return placeholderImage;
  } catch (error) {
    console.error('Erro ao converter HTML para imagem:', error);
    throw error;
  }
}

async function uploadImageToStorage(imageData: string, userId: string): Promise<{ path: string; url: string }> {
  try {
    // Converter base64 para blob
    const base64Data = imageData.split(',')[1];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/png' });
    
    const fileName = `nota-externa-${Date.now()}.png`;
    const filePath = `${userId}/${fileName}`;
    
    // Upload para o Supabase Storage
    const { data, error } = await supabase.storage
      .from('receipts')
      .upload(filePath, blob);
    
    if (error) throw error;
    
    // Obter URL pública
    const { data: urlData } = supabase.storage
      .from('receipts')
      .getPublicUrl(filePath);
    
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
    
    // 2. Converter HTML para imagem (placeholder por enquanto)
    const imageData = await convertHtmlToImage(html);
    
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
          html_capturado: html.substring(0, 10000), // Primeiros 10k caracteres
          url_original: receiptUrl,
          metodo_captura: 'external_browser',
          timestamp: new Date().toISOString()
        }
      })
      .select()
      .single();
    
    if (dbError) throw dbError;
    
    // 5. Processar com IA em segundo plano
    supabase.functions.invoke('process-receipt-full', {
      body: {
        notaImagemId: notaImagem.id,
        imageUrl: imageUrl,
        qrUrl: receiptUrl,
        htmlContent: html
      }
    }).catch(error => {
      console.error('Erro no processamento em segundo plano:', error);
    });
    
    console.log('Captura externa concluída com sucesso:', notaImagem.id);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        notaImagemId: notaImagem.id,
        imageUrl: imageUrl,
        message: 'Nota fiscal capturada e sendo processada'
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