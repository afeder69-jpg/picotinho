import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TranscribeRequest {
  audioUrl: string;
  audioBase64?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🎤 Iniciando transcrição de áudio...');

    const { audioUrl, audioBase64 }: TranscribeRequest = await req.json();

    if (!audioUrl && !audioBase64) {
      return new Response(JSON.stringify({ error: 'audioUrl ou audioBase64 é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      console.error('❌ OPENAI_API_KEY não configurada');
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY não configurada' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let audioBlob: Blob;
    let filename = 'audio.ogg';

    if (audioUrl) {
      console.log('📥 Baixando áudio de:', audioUrl);
      
      // Obter credenciais do WhatsApp para download
      const instanceUrl = Deno.env.get('WHATSAPP_INSTANCE_URL');
      const apiToken = Deno.env.get('WHATSAPP_API_TOKEN');
      const accountSecret = Deno.env.get('WHATSAPP_ACCOUNT_SECRET');
      
      let downloadHeaders: Record<string, string> = {};
      
      // Se a URL é do Z-API, adicionar headers de autenticação
      if (audioUrl.includes('z-api') || audioUrl.includes('storage.googleapis.com')) {
        downloadHeaders = {
          'Client-Token': accountSecret || ''
        };
      }
      
      const audioResponse = await fetch(audioUrl, {
        headers: downloadHeaders
      });
      
      if (!audioResponse.ok) {
        console.error('❌ Erro ao baixar áudio:', audioResponse.status);
        return new Response(JSON.stringify({ error: 'Erro ao baixar áudio' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      audioBlob = await audioResponse.blob();
      console.log('✅ Áudio baixado:', audioBlob.size, 'bytes');
      
      // Detectar extensão da URL
      if (audioUrl.includes('.mp3')) filename = 'audio.mp3';
      else if (audioUrl.includes('.wav')) filename = 'audio.wav';
      else if (audioUrl.includes('.m4a')) filename = 'audio.m4a';
      else if (audioUrl.includes('.webm')) filename = 'audio.webm';
      
    } else if (audioBase64) {
      console.log('📦 Decodificando áudio base64...');
      const binaryString = atob(audioBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      audioBlob = new Blob([bytes], { type: 'audio/ogg' });
    } else {
      throw new Error('Nenhum áudio fornecido');
    }

    // Enviar para OpenAI Whisper
    console.log('🚀 Enviando para Whisper API...');
    
    const formData = new FormData();
    formData.append('file', audioBlob, filename);
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt'); // Português brasileiro
    formData.append('response_format', 'json');

    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: formData
    });

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text();
      console.error('❌ Erro do Whisper:', errorText);
      return new Response(JSON.stringify({ error: 'Erro na transcrição', details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const transcription = await whisperResponse.json();
    console.log('✅ Transcrição concluída:', transcription.text);

    return new Response(JSON.stringify({
      success: true,
      text: transcription.text,
      duration: transcription.duration
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('❌ Erro na transcrição:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

serve(handler);
