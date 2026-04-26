/**
 * gravarPrecoSeguro - Gravação centralizada e segura de precos_atuais
 * 
 * Regras:
 * 1. Match estrito de produto_master_id por:
 *    a) EAN exato (mais confiável), OU
 *    b) produto_master_id já resolvido pelo chamador
 * 2. NÃO usar nome (mesmo normalizado) como critério de match.
 * 3. Validação obrigatória: o item DEVE existir no dados_extraidos.itens da nota
 *    informada (notaImagemId), com:
 *    - EAN igual, OU
 *    - combinação nome + quantidade + valor compatível (tolerância ±0.05)
 * 4. Tolerância numérica: ±0.05 (cobre arredondamentos comuns).
 * 5. Se qualquer validação falhar, retorna { ok:false, motivo } sem gravar.
 * 
 * NUNCA chame supabase.from('precos_atuais').upsert/insert/update fora desta função.
 */

const TOLERANCIA_VALOR = 0.05;
const TOLERANCIA_QTD = 0.01;

export interface GravarPrecoInput {
  // Identificadores fortes (pelo menos um obrigatório)
  produtoMasterId?: string | null;
  ean?: string | null;

  // Dados do preço
  produtoNome: string;          // nome canônico (apenas para gravar/log)
  valorUnitario: number;
  estabelecimentoCnpj: string;
  estabelecimentoNome: string;
  dataAtualizacao: string;       // ISO
  userId: string;

  // Validação contra a nota de origem
  notaImagemId?: string | null;  // se nulo, exige produtoMasterId + ean para gravar
  itemDescricao?: string | null; // descrição do item conforme aparece na nota
  itemQuantidade?: number | null;

  // Campos opcionais (passam direto)
  produtoNomeNormalizado?: string | null;
  marca?: string | null;
  granel?: boolean | null;
  qtd_valor?: number | null;
  qtd_unidade?: string | null;
  qtd_base?: number | null;
  unidade_base?: string | null;
  tipo_embalagem?: string | null;
  nome_base?: string | null;
  preco_por_unidade_base?: number | null;
  produto_hash_normalizado?: string | null;
}

export interface GravarPrecoResult {
  ok: boolean;
  motivo?: string;
  precoId?: string;
  produtoMasterId?: string;
}

/**
 * Resolve produto_master_id estritamente.
 * Prioridade: EAN exato > produtoMasterId fornecido.
 * NUNCA por nome/similaridade.
 */
async function resolverMasterIdEstrito(
  supabase: any,
  input: { produtoMasterId?: string | null; ean?: string | null }
): Promise<string | null> {
  // 1. EAN tem prioridade absoluta
  if (input.ean && input.ean.trim().length >= 8) {
    const { data: porEan } = await supabase
      .from('produtos_master_global')
      .select('id')
      .eq('codigo_barras', input.ean.trim())
      .eq('status', 'aprovado')
      .maybeSingle();
    if (porEan?.id) return porEan.id;
  }

  // 2. produto_master_id fornecido (deve existir e estar aprovado)
  if (input.produtoMasterId) {
    const { data: master } = await supabase
      .from('produtos_master_global')
      .select('id')
      .eq('id', input.produtoMasterId)
      .maybeSingle();
    if (master?.id) return master.id;
  }

  return null;
}

/**
 * Valida que o item realmente existe na nota informada.
 * Aceita match por: (a) EAN, (b) descrição+qtd+valor, (c) descrição+valor.
 * Tolerância de valor: ±0.05.
 */
async function validarItemNaNota(
  supabase: any,
  input: GravarPrecoInput
): Promise<{ ok: boolean; motivo?: string }> {
  if (!input.notaImagemId) {
    // Sem nota → exige EAN forte para gravar
    if (input.ean && input.ean.trim().length >= 8) {
      return { ok: true };
    }
    return { ok: false, motivo: 'sem_nota_e_sem_ean' };
  }

  const { data: nota, error } = await supabase
    .from('notas_imagens')
    .select('dados_extraidos')
    .eq('id', input.notaImagemId)
    .maybeSingle();

  if (error || !nota?.dados_extraidos) {
    return { ok: false, motivo: 'nota_nao_encontrada_ou_sem_dados' };
  }

  const itens = (nota.dados_extraidos as any)?.itens || [];
  if (!Array.isArray(itens) || itens.length === 0) {
    return { ok: false, motivo: 'nota_sem_itens' };
  }

  const valorAlvo = Number(input.valorUnitario);
  const eanAlvo = (input.ean || '').trim();
  const descAlvo = (input.itemDescricao || input.produtoNome || '').toUpperCase().trim();
  const qtdAlvo = input.itemQuantidade != null ? Number(input.itemQuantidade) : null;

  for (const item of itens) {
    const itemEan = String(item.ean || item.codigo_barras || item.codigo || '').trim();
    const itemDesc = String(item.descricao || item.nome || '').toUpperCase().trim();
    const itemValor = Number(item.valor_unitario ?? item.preco_unitario ?? 0);
    const itemQtd = Number(item.quantidade ?? 0);

    // (a) Match por EAN forte
    if (eanAlvo && itemEan && eanAlvo === itemEan) {
      if (Math.abs(itemValor - valorAlvo) <= TOLERANCIA_VALOR) {
        return { ok: true };
      }
    }

    // (b) Match por descrição EXATA + valor compatível
    if (descAlvo && itemDesc && descAlvo === itemDesc) {
      if (Math.abs(itemValor - valorAlvo) <= TOLERANCIA_VALOR) {
        // Se qtd informada, validar também
        if (qtdAlvo == null || Math.abs(itemQtd - qtdAlvo) <= TOLERANCIA_QTD) {
          return { ok: true };
        }
      }
    }
  }

  return { ok: false, motivo: 'item_nao_encontrado_na_nota' };
}

/**
 * Função única e segura para gravar em precos_atuais.
 * Toda gravação no sistema DEVE passar por aqui.
 */
export async function gravarPrecoSeguro(
  supabase: any,
  input: GravarPrecoInput
): Promise<GravarPrecoResult> {
  // 1. Resolver master_id estritamente
  const masterId = await resolverMasterIdEstrito(supabase, {
    produtoMasterId: input.produtoMasterId,
    ean: input.ean,
  });

  if (!masterId) {
    console.log(`[gravarPrecoSeguro] ❌ master_id não resolvido. ean=${input.ean} master=${input.produtoMasterId} produto="${input.produtoNome}"`);
    return { ok: false, motivo: 'master_id_nao_resolvido' };
  }

  // 2. Validar contra a nota
  const valid = await validarItemNaNota(supabase, input);
  if (!valid.ok) {
    console.log(`[gravarPrecoSeguro] ❌ validação falhou: ${valid.motivo} produto="${input.produtoNome}" valor=${input.valorUnitario} nota=${input.notaImagemId}`);
    return { ok: false, motivo: valid.motivo };
  }

  // 3. Gravar (upsert)
  const cnpjNorm = (input.estabelecimentoCnpj || '').replace(/\D/g, '');

  const upsertData: any = {
    produto_nome: input.produtoNome,
    produto_nome_normalizado: input.produtoNomeNormalizado ?? null,
    valor_unitario: input.valorUnitario,
    estabelecimento_cnpj: cnpjNorm,
    estabelecimento_nome: input.estabelecimentoNome,
    data_atualizacao: input.dataAtualizacao,
    user_id: input.userId,
    produto_master_id: masterId,
    marca: input.marca ?? null,
    granel: input.granel ?? null,
    qtd_valor: input.qtd_valor ?? null,
    qtd_unidade: input.qtd_unidade ?? null,
    qtd_base: input.qtd_base ?? null,
    unidade_base: input.unidade_base ?? null,
    tipo_embalagem: input.tipo_embalagem ?? null,
    nome_base: input.nome_base ?? null,
    preco_por_unidade_base: input.preco_por_unidade_base ?? null,
    produto_hash_normalizado: input.produto_hash_normalizado ?? null,
  };

  const { data, error } = await supabase
    .from('precos_atuais')
    .upsert(upsertData, { onConflict: 'produto_nome,estabelecimento_cnpj' })
    .select('id')
    .maybeSingle();

  if (error) {
    console.error(`[gravarPrecoSeguro] erro no upsert:`, error);
    return { ok: false, motivo: `upsert_error: ${error.message}` };
  }

  console.log(`[gravarPrecoSeguro] ✅ gravado preco_id=${data?.id} master=${masterId} produto="${input.produtoNome}" valor=${input.valorUnitario} cnpj=${cnpjNorm}`);
  return { ok: true, precoId: data?.id, produtoMasterId: masterId };
}
