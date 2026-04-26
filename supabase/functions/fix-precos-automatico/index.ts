import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireMaster, authErrorResponse, corsHeaders } from "../_shared/auth.ts";

/**
 * ⛔ DESATIVADO — Esta função era a causa raiz da contaminação de preços em precos_atuais.
 * Usava `String.includes` em produto_nome para tentar "achar" preço em notas, propagando
 * preços de um item (ex.: CEBOLA R$ 3,85) para múltiplos masters não relacionados
 * (ex.: PÃO DE ALHO, ALHO SEM CASCA).
 *
 * Substituída por: gravarPrecoSeguro (supabase/functions/_shared/precos.ts), que exige
 * match estrito por EAN ou produto_master_id e validação contra dados_extraidos.itens.
 *
 * Mantida como stub para preservar contrato de invocação. Sempre retorna 410.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try { await requireMaster(req); } catch (e) { return authErrorResponse(e); }

  console.warn('⛔ fix-precos-automatico DESATIVADO — substituído por gravarPrecoSeguro');

  return new Response(
    JSON.stringify({
      success: false,
      deprecated: true,
      message: 'fix-precos-automatico está DESATIVADO. Causava contaminação de preços por substring matching. Use o fluxo padrão de ingestão (process-receipt-full → update-precos-atuais → gravarPrecoSeguro).',
      produtosCorrigidos: 0,
      erros: 0,
    }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
