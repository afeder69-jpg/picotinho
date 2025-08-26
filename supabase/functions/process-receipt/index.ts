import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { receiptId, imageData, qrUrl } = await req.json();

    console.log('Processing receipt:', receiptId);

    // Upload screenshot to storage
    const screenshotPath = `receipts/${receiptId}/screenshot.png`;
    const imageBuffer = Uint8Array.from(atob(imageData.split(',')[1]), c => c.charCodeAt(0));
    
    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(screenshotPath, imageBuffer, {
        contentType: 'image/png',
        upsert: true
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw uploadError;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('receipts')
      .getPublicUrl(screenshotPath);

    // Process with OpenAI
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Você é um especialista em extrair dados de notas fiscais brasileiras. 
            Analise a imagem e extraia as seguintes informações em formato JSON:
            {
              "store_name": "nome do estabelecimento",
              "store_cnpj": "CNPJ (apenas números)",
              "total_amount": número total da compra,
              "purchase_date": "data da compra no formato YYYY-MM-DD",
              "items": [
                {
                  "name": "nome do produto",
                  "quantity": quantidade,
                  "unit_price": preço unitário,
                  "total_price": preço total do item,
                  "line_number": número da linha
                }
              ]
            }
            Se não conseguir identificar algum campo, use null. Para valores monetários, use apenas números.`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extraia os dados desta nota fiscal:'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageData
                }
              }
            ]
          }
        ],
        max_tokens: 2000
      }),
    });

    const openaiData = await openaiResponse.json();
    console.log('OpenAI response:', openaiData);

    if (!openaiData.choices?.[0]?.message?.content) {
      throw new Error('Failed to process receipt with OpenAI');
    }

    let extractedData;
    try {
      extractedData = JSON.parse(openaiData.choices[0].message.content);
    } catch (e) {
      console.error('Failed to parse OpenAI response:', e);
      throw new Error('Invalid response format from OpenAI');
    }

    // Update receipt in database
    const { error: updateError } = await supabase
      .from('receipts')
      .update({
        store_name: extractedData.store_name,
        store_cnpj: extractedData.store_cnpj,
        total_amount: extractedData.total_amount,
        purchase_date: extractedData.purchase_date,
        screenshot_url: publicUrl,
        screenshot_path: screenshotPath,
        processed_data: extractedData,
        status: 'processed',
        updated_at: new Date().toISOString()
      })
      .eq('id', receiptId);

    if (updateError) {
      console.error('Database update error:', updateError);
      throw updateError;
    }

    // Insert receipt items
    if (extractedData.items && extractedData.items.length > 0) {
      const items = extractedData.items.map((item: any) => ({
        receipt_id: receiptId,
        name: item.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        line_number: item.line_number
      }));

      const { error: itemsError } = await supabase
        .from('receipt_items')
        .insert(items);

      if (itemsError) {
        console.error('Items insert error:', itemsError);
        throw itemsError;
      }
    }

    console.log('Receipt processed successfully:', receiptId);

    return new Response(JSON.stringify({ 
      success: true, 
      receiptId,
      extractedData 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error processing receipt:', error);
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});