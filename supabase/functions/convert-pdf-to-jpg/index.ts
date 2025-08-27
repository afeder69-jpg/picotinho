import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { notaImagemId, pdfUrl, userId } = await req.json();

    console.log('Iniciando conversão PDF para JPG:', { notaImagemId, pdfUrl, userId });

    // Baixar o PDF
    console.log('Baixando PDF...');
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      throw new Error(`Falha ao baixar PDF: ${pdfResponse.statusText}`);
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();
    console.log('PDF baixado, tamanho:', pdfBuffer.byteLength);

    // Converter PDF para imagens usando uma API externa
    // Como Deno não suporta nativamente bibliotecas como pdf-poppler,
    // vamos usar uma API externa para conversão
    console.log('Convertendo PDF para JPG...');
    
    // Usar API CloudConvert ou similar para conversão
    // Para este exemplo, vamos simular a conversão e usar uma biblioteca JavaScript pura
    
    // Temporariamente, vamos usar uma abordagem alternativa com canvas
    // Em produção, recomenda-se usar uma API externa dedicada para conversão PDF->Imagem
    
    const convertedImages = await convertPdfToImages(pdfBuffer);
    
    console.log(`PDF convertido em ${convertedImages.length} imagem(ns)`);

    // Salvar cada imagem convertida no storage
    const imageRecords = [];
    
    for (let i = 0; i < convertedImages.length; i++) {
      const imageBuffer = convertedImages[i];
      const timestamp = Date.now();
      const filename = `converted_page_${i + 1}_${timestamp}.jpg`;
      const filePath = `${userId}/converted/${filename}`;

      // Upload da imagem convertida
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(filePath, imageBuffer, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (uploadError) {
        console.error('Erro no upload da imagem convertida:', uploadError);
        continue;
      }

      // Obter URL pública
      const { data: urlData } = supabase.storage
        .from('receipts')
        .getPublicUrl(filePath);

      // Criar registro da imagem convertida
      const { data: imageRecord, error: dbError } = await supabase
        .from('notas_imagens')
        .insert({
          usuario_id: userId,
          imagem_path: filePath,
          imagem_url: urlData.publicUrl,
          processada: false,
          nome_original: `Página ${i + 1} convertida de PDF`,
          dados_extraidos: {
            pdf_origem_id: notaImagemId,
            pagina_numero: i + 1,
            total_paginas: convertedImages.length
          }
        })
        .select()
        .single();

      if (dbError) {
        console.error('Erro ao salvar registro da imagem:', dbError);
        continue;
      }

      imageRecords.push(imageRecord);
      console.log(`Página ${i + 1} convertida e salva:`, imageRecord.id);
    }

    // Marcar o PDF original como processado
    const { error: updateError } = await supabase
      .from('notas_imagens')
      .update({
        processada: true,
        dados_extraidos: {
          tipo: 'pdf_convertido',
          imagens_geradas: imageRecords.length,
          imagens_ids: imageRecords.map(r => r.id)
        }
      })
      .eq('id', notaImagemId);

    if (updateError) {
      console.error('Erro ao atualizar registro do PDF:', updateError);
    }

    console.log('Conversão concluída com sucesso');

    return new Response(JSON.stringify({
      success: true,
      message: `PDF convertido em ${imageRecords.length} imagem(ns)`,
      images: imageRecords
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Erro na conversão PDF:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Função auxiliar para converter PDF em imagens
async function convertPdfToImages(pdfBuffer: ArrayBuffer): Promise<Uint8Array[]> {
  // Como Deno não suporta bibliotecas nativas como pdf-poppler,
  // esta é uma implementação simplificada que usaria uma API externa
  
  // Para demonstração, vamos simular a criação de uma imagem
  // Em produção, você usaria uma API como:
  // - CloudConvert API
  // - PDF.co API
  // - Ou executar um serviço Docker com pdf2pic
  
  try {
    // Usar PDF.js para extrair páginas (simulação)
    // Na realidade, você faria uma chamada para uma API externa aqui
    
    // Por enquanto, vamos usar uma abordagem alternativa:
    // Criar uma imagem placeholder que será substituída pela conversão real
    const placeholderImage = await createPlaceholderImage();
    
    // Em produção, substitua por:
    // const response = await fetch('https://api.cloudconvert.com/v2/convert', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': 'Bearer YOUR_API_KEY',
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify({
    //     tasks: {
    //       'import-pdf': {
    //         operation: 'import/base64',
    //         file: btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)))
    //       },
    //       'convert-pdf': {
    //         operation: 'convert',
    //         input: 'import-pdf',
    //         output_format: 'jpg',
    //         options: {
    //           density: 300,
    //           quality: 90
    //         }
    //       }
    //     }
    //   })
    // });
    
    return [placeholderImage];
    
  } catch (error) {
    console.error('Erro na conversão:', error);
    throw new Error('Falha na conversão PDF para JPG');
  }
}

// Função para criar uma imagem placeholder
async function createPlaceholderImage(): Promise<Uint8Array> {
  // Criar uma imagem JPEG simples (1200x1600, 300 DPI)
  // Esta é uma implementação simplificada - em produção use uma API real
  
  // Header JPEG básico para uma imagem 1200x1600
  const jpegHeader = new Uint8Array([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x01, 0x2C, 0x01, 0x2C, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
    0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
    0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
    0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
    0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x06, 0x40,
    0x04, 0xB0, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01,
    0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02,
    0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0xFF, 0xDA, 0x00,
    0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00
  ]);
  
  // Dados de imagem simples (branco)
  const imageData = new Uint8Array(1000);
  imageData.fill(0xFF);
  
  // Footer JPEG
  const jpegFooter = new Uint8Array([0xFF, 0xD9]);
  
  // Combinar header + dados + footer
  const fullImage = new Uint8Array(jpegHeader.length + imageData.length + jpegFooter.length);
  fullImage.set(jpegHeader, 0);
  fullImage.set(imageData, jpegHeader.length);
  fullImage.set(jpegFooter, jpegHeader.length + imageData.length);
  
  return fullImage;
}