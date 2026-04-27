// supabase/functions/process-receipt-full/index.ts
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

// ================== CONFIG CORS ==================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ================== FEATURE FLAGS ==================
// 🎚️ Feature flag: Usar IA para normalização (Gemini via Lovable AI Gateway)
const USE_AI_NORMALIZATION = Deno.env.get('USE_AI_NORMALIZATION') !== 'false'; // ✅ Ativado por padrão
console.log(`🤖 USE_AI_NORMALIZATION: ${USE_AI_NORMALIZATION}`);

// ================== HELPERS ==================
function nowIso() {
  return new Date().toISOString();
}

// Normalizar unidades para o padrão Picotinho: Un, Kg, Lt
function normalizarUnidadeMedida(unidade: string): string {
  if (!unidade) return 'Un';
  
  const unidadeLimpa = unidade.trim().toUpperCase();
  
  // Mapeamento para padrão Picotinho
  const mapeamento: { [key: string]: string } = {
    'PC': 'Un',
    'UNIDADE': 'Un',
    'UN': 'Un',
    'UND': 'Un',
    'PEÇA': 'Un',
    'PECA': 'Un',
    'G': 'Kg',
    'GRAMAS': 'Kg',
    'GRAMA': 'Kg',
    'KG': 'Kg',
    'QUILO': 'Kg',
    'KILO': 'Kg',
    'ML': 'Lt',
    'MILILITRO': 'Lt',
    'MILILITROS': 'Lt',
    'L': 'Lt',
    'LT': 'Lt',
    'LITRO': 'Lt',
    'LITROS': 'Lt'
  };
  
  return mapeamento[unidadeLimpa] || unidadeLimpa;
}

// 🥚 Interfaces e função para detecção de embalagem via tabela de regras
interface RegraConversao {
  produto_pattern: string;
  produto_exclusao_pattern: string | null;
  ean_pattern: string | null;
  tipo_embalagem: string;
  qtd_por_embalagem: number;
  unidade_consumo: string;
  prioridade: number;
}

interface ResultadoEmbalagem {
  isMultiUnit: boolean;
  quantity: number;
  unitPrice: number;
  tipo_embalagem: string | null;
  unidade_consumo: string;
}

function detectarQuantidadeEmbalagem(
  nomeProduto: string, 
  precoTotal: number,
  regras: RegraConversao[],
  eanProduto?: string | null
): ResultadoEmbalagem {
  const nomeUpper = nomeProduto.toUpperCase();
  const fallback: ResultadoEmbalagem = { isMultiUnit: false, quantity: 1, unitPrice: precoTotal, tipo_embalagem: null, unidade_consumo: 'UN' };

  if (!regras || regras.length === 0) return fallback;

  // Passada 1: EAN tem prioridade
  if (eanProduto) {
    for (const regra of regras) {
      if (!regra.ean_pattern) continue;
      try {
        if (!new RegExp(regra.ean_pattern, 'i').test(eanProduto)) continue;
        // Testar exclusão por nome
        if (regra.produto_exclusao_pattern && new RegExp(regra.produto_exclusao_pattern, 'i').test(nomeUpper)) continue;
        const qty = regra.qtd_por_embalagem;
        if (qty > 1 && qty <= 100) {
          console.log(`🥚 EMBALAGEM (EAN): "${nomeProduto}" → ${qty} ${regra.unidade_consumo} (${regra.tipo_embalagem})`);
          return { isMultiUnit: true, quantity: qty, unitPrice: precoTotal / qty, tipo_embalagem: regra.tipo_embalagem, unidade_consumo: regra.unidade_consumo };
        }
      } catch (e) { console.warn('Regex EAN inválido:', regra.ean_pattern, e); }
    }
  }

  // Passada 2: Match por nome do produto
  for (const regra of regras) {
    try {
      if (!new RegExp(regra.produto_pattern, 'i').test(nomeUpper)) continue;
      if (regra.produto_exclusao_pattern && new RegExp(regra.produto_exclusao_pattern, 'i').test(nomeUpper)) continue;
      const qty = regra.qtd_por_embalagem;
      if (qty > 1 && qty <= 100) {
        console.log(`🥚 EMBALAGEM (NOME): "${nomeProduto}" → ${qty} ${regra.unidade_consumo} (${regra.tipo_embalagem})`);
        return { isMultiUnit: true, quantity: qty, unitPrice: precoTotal / qty, tipo_embalagem: regra.tipo_embalagem, unidade_consumo: regra.unidade_consumo };
      }
    } catch (e) { console.warn('Regex nome inválido:', regra.produto_pattern, e); }
  }

  return fallback;
}

  // 🔢 Limpar e validar EAN/GTIN (somente dígitos, rejeitar inválidos)
  function limparEAN(valor: any): string | null {
    if (!valor || typeof valor !== 'string') return null;
    const limpo = valor.trim().replace(/\D/g, '');
    if (!limpo || limpo.length < 8) return null;
    // Rejeitar valores inválidos conhecidos
    const invalidos = ['0', '00000000', '0000000000000', 'SEM GTIN', 'SEM EAN'];
    if (invalidos.includes(valor.trim().toUpperCase()) || /^0+$/.test(limpo)) return null;
    return limpo;
  }

  // 🔢 Forma canônica de EAN (sem zeros à esquerda) — usada para comparação
  // Ex.: "07622210878946" → "7622210878946"
  function canonicalEAN(ean: string | null | undefined): string | null {
    if (!ean) return null;
    const limpo = String(ean).replace(/\D/g, '').replace(/^0+/, '');
    if (!limpo || limpo.length < 7) return null;
    return limpo;
  }

  // 🔢 Gera variantes equivalentes para casar EANs gravados em formatos diferentes
  // Cobre: forma canônica (sem zeros à esquerda) + padding para 8/12/13/14 dígitos
  function eanVariants(ean: string | null | undefined): string[] {
    const canon = canonicalEAN(ean);
    if (!canon) return [];
    const set = new Set<string>([canon]);
    for (const len of [8, 12, 13, 14]) {
      if (canon.length <= len) set.add(canon.padStart(len, '0'));
    }
    return Array.from(set);
  }

  // 🧹 Limpar sufixos de GRANEL e unidades do nome antes do matching
  function limparUnidadesMedida(nome: string): string {
    return nome
      .replace(/\s+(kg|g|ml|l)\s+GRANEL$/gi, '') // Remove "kg GRANEL", "g GRANEL" no final
      .replace(/\s+GRANEL$/gi, '') // Remove "GRANEL" sozinho no final
      .replace(/\s+\d*UN(IDADE)?S?$/gi, '') // Remove "1UN", "2UN", "UNIDADE" no final
      .replace(/\s+\d*(kg|un|lt|ml|g|l)$/gi, '') // Remove unidades no final
      .replace(/\s+(kg|un|lt|ml|g|l)\s+/gi, ' ') // Remove unidades no meio do texto
      .replace(/\s+/g, ' ') // Remove espaços duplos
      .trim();
  }

// 🔧 Normalizar nome do produto para matching consistente (usado em estoque)
function normalizarNomeProdutoEstoque(nome: string): string {
  // 1. Lowercase e trim básico
  let normalizado = nome
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
  
  // 2. Remover acentos (Unicode normalization)
  normalizado = normalizado
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  
  // 3. Remover palavras descritivas comuns
  const palavrasRemover = [
    'kg', 'granel', 'unidade', 'un', 'super', 'extra',
    'tradicional', 'classico', 'trad', 'trad.', 'gra.', 'gra',
    'quilograma', 'quilogramas'
  ];
  
  for (const palavra of palavrasRemover) {
    const regex = new RegExp(`\\b${palavra}\\b`, 'gi');
    normalizado = normalizado.replace(regex, '');
  }
  
  // 4. Remover pontuação exceto ponto entre números
  normalizado = normalizado.replace(/[^a-z0-9\s.]/g, ' ');
  
  // 5. Limpar espaços múltiplos novamente
  normalizado = normalizado.replace(/\s+/g, ' ').trim();
  
  return normalizado;
}

// 🧹 NOVA FUNÇÃO: Limpar abreviações comuns antes do matching
function limparAbreviacoes(texto: string): string {
  if (!texto) return '';
  
  let limpo = texto.toUpperCase();
  
  // Lista de abreviações comuns para remover
  const abreviacoes = [
    /\bS\/LAC\.?\b/gi,     // S/LAC, S/LAC.
    /\bS\/ LAC\.?\b/gi,    // S/ LAC
    /\bSEM LACTOSE\b/gi,
    /\bUHT\b/gi,
    /\bTRAD\.?\b/gi,       // TRAD, TRAD.
    /\bTRADICIONAL\b/gi,
    /\bINT\.?\b/gi,        // INT, INT.
    /\bINTEGRAL\b/gi,
    /\bS\/ACUCAR\b/gi,     // S/ACUCAR
    /\bS\/ ACUCAR\b/gi,
    /\bDIET\b/gi,
    /\bLIGHT\b/gi,
    /\bZERO\b/gi,
    /\bS\/SAL\b/gi,        // S/SAL
    /\bC\/SAL\b/gi,        // C/SAL
    /\bC\/ SAL\b/gi
  ];
  
  // Remover cada abreviação
  for (const abrev of abreviacoes) {
    limpo = limpo.replace(abrev, ' ');
  }
  
  // Normalizar espaços múltiplos
  limpo = limpo.replace(/\s+/g, ' ').trim();
  
  return limpo;
}

// ================== FUNÇÕES AUXILIARES DE NORMALIZAÇÃO ROBUSTA ==================

/**
 * Normaliza texto para matching robusto
 * Remove acentos, pontuações, espaços extras
 */
function normalizarTextoParaMatching(texto: string): string {
  if (!texto) return '';
  
  let normalizado = texto
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // Remove acentos
  
  // 🔥 Substituir TODAS as pontuações e barras por espaços
  normalizado = normalizado.replace(/[.,\/-]/g, ' ');
  
  // Normalizar espaços múltiplos
  normalizado = normalizado.replace(/\s+/g, ' ').trim();
  
  return normalizado;
}

// 🔥 NOVA FUNÇÃO: Normalizar ordem de tokens para evitar falhas por ordem diferente
function normalizarOrdemTokens(texto: string): string {
  if (!texto) return '';
  
  // Separar em tokens
  const tokens = texto.split(' ').filter(t => t.length > 0);
  
  // Categorizar tokens
  const numeros: string[] = [];
  const marcas: string[] = [];
  const palavras: string[] = [];
  
  for (const token of tokens) {
    // Números com unidade (25G, 200ML, 1KG, etc)
    if (/^\d+[A-Z]*$/.test(token)) {
      numeros.push(token);
    }
    // Marcas conhecidas (verifica se token contém ou é contido por alguma marca)
    else if (MARCAS_CONHECIDAS.some(m => token.includes(m) || m.includes(token))) {
      marcas.push(token);
    }
    // Palavras gerais
    else {
      palavras.push(token);
    }
  }
  
  // Ordenar cada categoria alfabeticamente
  numeros.sort();
  marcas.sort();
  palavras.sort();
  
  // Juntar na ordem: palavras + marcas + números
  return [...palavras, ...marcas, ...numeros].join(' ');
}

/**
 * Calcula similaridade Levenshtein entre dois textos
 * Retorna porcentagem (0-100)
 */
function calcularSimilaridadeLevenshtein(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));
  
  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + substitutionCost
      );
    }
  }
  
  const distance = matrix[len2][len1];
  const maxLen = Math.max(len1, len2);
  return ((maxLen - distance) / maxLen) * 100;
}

// 🏷️ LISTA GLOBAL DE MARCAS CONHECIDAS
const MARCAS_CONHECIDAS = [
  'ITALAC', 'ROYAL', 'KREMINAS', 'TIROLEZ', 'NESTLE', 'COCA-COLA',
  'FANTA', 'YPSILON', 'YPE', 'OMO', 'COMFORT', 'SADIA', 'SEARA',
  'QUALY', 'DANONE', 'PARMALAT', 'PIRACANJUBA', 'VIGOR',
  'ELEGÊ', 'ELEGE', 'WICKBOLD', 'PULLMAN', 'PLUSVITA',
  'AURORA', 'PERDIGAO', 'BRF', 'JBS', 'FRIBOI', 'SWIFT',
  'ARIEL', 'TIDE', 'DOWNY', 'BRILHANTE', 'COLGATE',
  'ORAL', 'SORRISO', 'CLOSE', 'SENSODYNE', 'LISTERINE',
  'PREDILECTA', 'IMBIARA', 'CAETES', 'DOFORNO'
];

/**
 * Extrai marca do nome do produto
 */
function extrairMarca(texto: string): string | null {
  const textoUpper = texto.toUpperCase();
  
  for (const marca of MARCAS_CONHECIDAS) {
    if (textoUpper.includes(marca)) {
      return marca;
    }
  }
  
  return null;
}

/**
 * Verifica se texto contém marca conhecida
 */
function temMarcaConhecida(texto: string): boolean {
  const textoUpper = texto.toUpperCase();
  return MARCAS_CONHECIDAS.some(marca => textoUpper.includes(marca));
}

/**
 * Extrai peso/volume do nome do produto
 */
function extrairPesoVolume(texto: string): { valor: number; unidade: string } | null {
  const textoUpper = texto.toUpperCase();
  
  // Padrões: 200G, 200 G, 200ML, 500 ML, 1KG, 1 KG, 1L, 1 L
  const padroes = [
    /(\d+)\s*(G|GR|GRAMAS?)\b/,
    /(\d+)\s*(ML|MILILITROS?)\b/,
    /(\d+)\s*(KG|KILOS?|QUILOS?)\b/,
    /(\d+)\s*(L|LITROS?)\b/
  ];
  
  for (const padrao of padroes) {
    const match = textoUpper.match(padrao);
    if (match) {
      const valor = parseInt(match[1]);
      let unidade = match[2];
      
      // Normalizar unidade
      if (unidade.startsWith('G')) unidade = 'G';
      else if (unidade.startsWith('ML')) unidade = 'ML';
      else if (unidade.startsWith('K')) unidade = 'KG';
      else if (unidade.startsWith('L') && !unidade.startsWith('ML')) unidade = 'L';
      
      return { valor, unidade };
    }
  }
  
  return null;
}

// ================== NORMALIZAÇÃO MASTER - FASE 2 ==================

// 🤖 Interface para resultado de normalização com IA
interface NormalizacaoSugerida {
  sku_global: string;
  nome_padrao: string;
  categoria: string;
  nome_base: string;
  marca: string | null;
  tipo_embalagem: string | null;
  qtd_valor: number | null;
  qtd_unidade: string | null;
  qtd_base: number | null;
  unidade_base: string | null;
  categoria_unidade: string | null;
  granel: boolean;
  confianca: number;
  razao: string;
  produto_master_id: string | null;
}

/**
 * 🤖 NORMALIZAÇÃO COM IA (Gemini via Lovable AI Gateway)
 * Reutiliza a função de processar-normalizacao-global com melhorias
 */
async function normalizarComIA(
  textoOriginal: string,
  produtosSimilares: any[],
  apiKey: string,
  embalagemInfo?: { isMultiUnit: boolean; quantity: number }
): Promise<NormalizacaoSugerida> {
  console.log(`🤖 Analisando com Gemini: "${textoOriginal}"`);

  const promptExtra = embalagemInfo?.isMultiUnit 
    ? `

⚠️ ATENÇÃO ESPECIAL - PRODUTO MULTI-UNIDADE DETECTADO:
- Embalagem original continha ${embalagemInfo.quantity} unidades
- Você DEVE normalizar como PRODUTO UNITÁRIO (1 unidade)
- qtd_valor: 1
- qtd_unidade: "UN"
- qtd_base: 1
- unidade_base: "un"
- categoria_unidade: "UNIDADE"
- granel: false
- Nome deve ser SINGULAR sem número de embalagem
  Exemplo: "OVOS BRANCOS" NÃO "OVOS BRANCOS 30 UN"
`
    : '';

  const prompt = `Você é um especialista em normalização de produtos de supermercado brasileiros.${promptExtra}

PRODUTO PARA NORMALIZAR: "${textoOriginal}"

PRODUTOS SIMILARES NO CATÁLOGO (para referência):
${produtosSimilares.map(p => `- ${p.nome_padrao} | SKU: ${p.sku_global} | ID: ${p.id}`).join('\n') || 'Nenhum produto similar encontrado'}

INSTRUÇÕES:

**🔍 PASSO 1 - VERIFICAR SE É VARIAÇÃO DE PRODUTO EXISTENTE:**

⚠️ CRITÉRIOS RIGOROSOS PARA CONSIDERAR COMO MESMO PRODUTO (usar produto_master_id):

Para usar um produto_master_id existente, TODOS os critérios abaixo devem ser atendidos:

1. ✅ MARCA: Deve ser EXATAMENTE a mesma ou sinônimo direto reconhecido
   - "NINHO" e "LEITE NINHO" ✅ são sinônimos
   - "ROYAL" e "APTI" ❌ são marcas DIFERENTES
   - "CREMINAS" e "ITALAC" ❌ são marcas DIFERENTES

2. ✅ NOME BASE: Deve ser o mesmo produto (permitir apenas variações ortográficas)
   - "CHEIRO VERDE" e "TEMPERO VERDE" ✅ são sinônimos conhecidos
   - "GELATINA" e "GELATINA" ✅ match exato
   - "MANTEIGA" e "MANTEIGA" ✅ match exato
   
3. ✅ ATRIBUTOS CRÍTICOS (quando aplicável) - DEVEM SER IDÊNTICOS:
   - SABOR: Deve ser o mesmo (Framboesa ≠ Morango, Chocolate ≠ Baunilha, Limão ≠ Laranja)
   - COR: Deve ser a mesma (Verde ≠ Azul, Branco ≠ Vermelho)
   - TIPO: Deve ser o mesmo (Integral ≠ Refinado, Com Sal ≠ Sem Sal, Com Lactose ≠ Sem Lactose)
   - CARACTERÍSTICA ESPECIAL: Deve ser a mesma (Light ≠ Normal, Zero ≠ Normal, Diet ≠ Normal)

4. ✅ PESO/VOLUME: Diferença máxima de 10%
   - 1L e 1.05L ✅ (5% de diferença)
   - 25g e 20g ❌ (20% de diferença - criar produto NOVO)
   - 500g e 1kg ❌ (100% de diferença - criar produto NOVO)
   - 200g e 180g ✅ (10% de diferença)

5. ✅ CONFIANÇA MÍNIMA: 95% (NÃO 80% - seja rigoroso!)

🚨 SE QUALQUER UM DESSES CRITÉRIOS FALHAR: Crie um produto NOVO (deixe "produto_master_id": null)

Exemplos de MATCH CORRETO (pode usar produto_master_id):
- "AÇÚCAR CRISTAL UNIÃO 1KG" ← → "ACUCAR CRISTAL UNIAO 1000G" ✅ (mesma marca, mesmo produto, 10% diferença)
- "LEITE NINHO 400G" ← → "LEITE EM PÓ NINHO 400G" ✅ (mesma marca, sinônimo conhecido, mesmo peso)
- "MANTEIGA COM SAL CREMINAS 500G" ← → "MANTEIGA C/ SAL CREMINAS 500G" ✅ (mesma marca, mesmo tipo, mesmo peso)

Exemplos de MATCH INCORRETO (criar produto NOVO - não usar produto_master_id):
- "GELATINA ROYAL FRAMBOESA 25G" ← → "GELATINA APTI MORANGO 20G" ❌ (marca diferente, sabor diferente, peso diferente)
- "MANTEIGA COM SAL 500G" ← → "MANTEIGA SEM SAL 500G" ❌ (atributo crítico diferente)
- "ARROZ INTEGRAL 1KG" ← → "ARROZ BRANCO 1KG" ❌ (tipo diferente)
- "CREME DE LEITE 200G" ← → "CREME DE LEITE SEM LACTOSE 200G" ❌ (atributo crítico diferente)
- "OVO BRANCO 30 UN" ← → "OVO VERMELHO 30 UN" ❌ (cor diferente)

**📝 PASSO 2 - SE NÃO FOR VARIAÇÃO, NORMALIZE COMO PRODUTO NOVO:**
1. Analise o nome do produto e extraia:
   - Nome base (ex: "Arroz", "Feijão", "Leite")
   - Marca (se identificável)
   - Tipo de embalagem (Pacote, Saco, Garrafa, Caixa, etc)
   - Quantidade (valor + unidade, ex: 5 + "kg")
   - Se é granel (vendido por peso/medida)

2. **ATENÇÃO ESPECIAL: UNIDADE BASE**
   - Se a unidade for L (litros): converta para ml (multiplique por 1000)
     Exemplo: 1.25L → qtd_base: 1250, unidade_base: "ml"
   - Se a unidade for kg (quilos): converta para g (multiplique por 1000)
     Exemplo: 0.6kg → qtd_base: 600, unidade_base: "g"
   - Se a unidade já for ml, g, ou unidade: mantenha como está
   - **PÃO FRANCÊS E SIMILARES:** Se não houver quantidade explícita mas o produto é tipicamente vendido por peso (pão francês, frutas, verduras), assuma 1kg = 1000g

3. Categorize a unidade:
   - "VOLUME" para líquidos (ml)
   - "PESO" para sólidos (g)
   - "UNIDADE" para itens vendidos por peça

4. Gere um SKU global único no formato: CATEGORIA-NOME_BASE-MARCA-QTDUNIDADE

5. Categorize em uma dessas categorias OFICIAIS do Picotinho (use EXATAMENTE como escrito):
   AÇOUGUE (com Ç), BEBIDAS, CONGELADOS, HIGIENE/FARMÁCIA, HORTIFRUTI, LATICÍNIOS/FRIOS, LIMPEZA, MERCEARIA, PADARIA, PET, OUTROS
   
   Exemplos por categoria:
   - MERCEARIA: Ketchup, molhos, temperos, massas, arroz, feijão, enlatados, conservas, óleos
   - LATICÍNIOS/FRIOS: Queijos, leite, iogurte, requeijão, manteiga, embutidos, presunto
   - HIGIENE/FARMÁCIA: Produtos de higiene pessoal, cosméticos, remédios, fraldas
   - AÇOUGUE: Carnes, frango, peixe, linguiça (sempre com Ç)
   - BEBIDAS: Refrigerantes, sucos, águas, energéticos, bebidas alcoólicas
   - HORTIFRUTI: Frutas, verduras, legumes
   - LIMPEZA: Produtos de limpeza doméstica
   - CONGELADOS: Alimentos congelados
   - PADARIA: Pães, bolos, tortas
   - PET: Produtos para animais
   - OUTROS: Quando não se encaixa em nenhuma categoria acima

6. Atribua uma confiança de 0-100 baseado em:
   - 90-100: Nome muito claro e estruturado (ou produto encontrado no catálogo)
   - 70-89: Nome razoável mas com alguma ambiguidade
   - 50-69: Nome confuso ou incompleto
   - 0-49: Nome muito vago ou problemático

RESPONDA APENAS COM JSON (sem markdown):
{
  "sku_global": "string",
  "nome_padrao": "string (nome normalizado limpo)",
  "categoria": "string",
  "nome_base": "string",
  "marca": "string ou null",
  "tipo_embalagem": "string ou null",
  "qtd_valor": number ou null,
  "qtd_unidade": "string ou null (L, kg, ml, g, un)",
  "qtd_base": number ou null (sempre em ml/g/unidade),
  "unidade_base": "string ou null (ml, g, un)",
  "categoria_unidade": "string ou null (VOLUME, PESO, UNIDADE)",
  "granel": boolean,
  "confianca": number (0-100),
  "razao": "string (explicação breve - mencione se encontrou no catálogo)",
  "produto_master_id": "string ou null (ID do produto similar encontrado)"
}`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { 
            role: 'system', 
            content: 'Você é um especialista em normalização de produtos. Sempre responda com JSON válido, sem markdown.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro na API Lovable AI: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const conteudo = data.choices[0].message.content;
    
    const jsonLimpo = conteudo
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    
    const resultado = JSON.parse(jsonLimpo);
    
    // 🔧 VALIDAR E CORRIGIR CATEGORIA (GARANTIR CATEGORIAS OFICIAIS DO PICOTINHO)
    const CATEGORIAS_VALIDAS = [
      'AÇOUGUE', 'BEBIDAS', 'CONGELADOS', 'HIGIENE/FARMÁCIA',
      'HORTIFRUTI', 'LATICÍNIOS/FRIOS', 'LIMPEZA', 'MERCEARIA',
      'PADARIA', 'PET', 'OUTROS'
    ];
    
    const CORRECOES_CATEGORIA: Record<string, string> = {
      'ALIMENTOS': 'MERCEARIA',
      'HIGIENE': 'HIGIENE/FARMÁCIA',
      'FARMACIA': 'HIGIENE/FARMÁCIA',
      'LATICÍNIOS': 'LATICÍNIOS/FRIOS',
      'LATICINIOS': 'LATICÍNIOS/FRIOS',
      'FRIOS': 'LATICÍNIOS/FRIOS',
      'ACOUGUE': 'AÇOUGUE',
      'ASOUGUE': 'AÇOUGUE',
      'CARNES': 'AÇOUGUE'
    };
    
    // Aplicar correção de categoria se necessário
    if (resultado.categoria) {
      const categoriaOriginal = resultado.categoria.toUpperCase();
      
      if (CORRECOES_CATEGORIA[categoriaOriginal]) {
        console.log(`🔧 Corrigindo categoria: ${categoriaOriginal} → ${CORRECOES_CATEGORIA[categoriaOriginal]}`);
        resultado.categoria = CORRECOES_CATEGORIA[categoriaOriginal];
      } else if (!CATEGORIAS_VALIDAS.includes(categoriaOriginal)) {
        console.log(`⚠️ Categoria inválida detectada: ${categoriaOriginal} → OUTROS`);
        resultado.categoria = 'OUTROS';
      } else {
        resultado.categoria = categoriaOriginal;
      }
      
      // Reconstruir SKU com categoria corrigida
      resultado.sku_global = `${resultado.categoria}-${resultado.nome_base.replace(/\s+/g, '_')}-${resultado.marca || 'GENERICO'}-${resultado.qtd_valor}${resultado.qtd_unidade}`;
    }
    
    // 🥚 FORÇAR CORREÇÃO PARA PRODUTOS MULTI-UNIDADE
    if (embalagemInfo?.isMultiUnit) {
      console.log(`🥚 Aplicando correção de multi-unidade para: ${resultado.nome_padrao}`);
      
      resultado.qtd_valor = 1;
      resultado.qtd_unidade = 'UN';
      resultado.qtd_base = 1;
      resultado.unidade_base = 'un';
      resultado.categoria_unidade = 'UNIDADE';
      resultado.granel = false;
      
      // Remover números e "UN" do nome padrao (ex: "OVOS BRANCOS 30 UN" → "OVOS BRANCOS")
      resultado.nome_padrao = resultado.nome_padrao
        .replace(/\bC\/\d+\b/i, '')
        .replace(/\b\d+\s*UN(IDADES)?\b/i, '')
        .replace(/\b\d+\s*OVO(S)?\b/i, '')
        .replace(/\bDZ\d+\b/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      resultado.nome_base = resultado.nome_base
        .replace(/\bC\/\d+\b/i, '')
        .replace(/\b\d+\s*UN(IDADES)?\b/i, '')
        .replace(/\b\d+\s*OVO(S)?\b/i, '')
        .replace(/\bDZ\d+\b/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Atualizar SKU para refletir produto unitário
      resultado.sku_global = `${resultado.categoria}-${resultado.nome_base.replace(/\s+/g, '_')}-${resultado.marca || 'GENERICO'}-1UN`;
      
      console.log(`🥚 Correção aplicada: "${resultado.nome_padrao}" (1 UN)`);
    }
    
    // 🔥 APLICAR UPPERCASE EM TODOS OS CAMPOS DE TEXTO
    resultado.nome_padrao = resultado.nome_padrao?.toUpperCase() || '';
    resultado.nome_base = resultado.nome_base?.toUpperCase() || '';
    resultado.marca = resultado.marca?.toUpperCase() || null;
    resultado.tipo_embalagem = resultado.tipo_embalagem?.toUpperCase() || null;
    
    console.log(`✅ IA retornou: ${resultado.nome_padrao} | Confiança: ${resultado.confianca}% | Master: ${resultado.produto_master_id ? 'SIM' : 'NÃO'}`);
    
    return resultado;
  } catch (error: any) {
    console.error(`❌ Erro ao normalizar com IA: ${error.message}`);
    throw error;
  }
}

// 🔥 Cache em memória para produtos master já buscados
const masterCache = new Map<string, any>();

// 🎚️ Feature flag: pode desabilitar busca master via env var
const ENABLE_MASTER_SEARCH = Deno.env.get('ENABLE_MASTER_SEARCH') !== 'false';

// 🔑 Extrair palavras-chave críticas (sabores, tipos, características)
function extrairPalavrasChave(texto: string): string[] {
  const palavrasChave: string[] = [];
  const textoUpper = texto.toUpperCase();
  
  // Sabores
  const sabores = ['UVA', 'MARACUJA', 'LIMAO', 'MORANGO', 'FRAMBOESA', 'ABACAXI', 
                   'LARANJA', 'PESSEGO', 'COCO', 'BANANA', 'MANGA', 'GOIABA',
                   'CHOCOLATE', 'BAUNILHA', 'CAFE', 'AMEIXA', 'CEREJA'];
  
  // Tipos de leite/iogurte
  const tipos = ['INTEGRAL', 'DESNATADO', 'SEMIDESNATADO', 'ZERO', 'LIGHT', 
                 'GREGO', 'NATURAL', 'TRADICIONAL'];
  
  // Características especiais
  const caracteristicas = ['SEM LACTOSE', 'SLAC', 'COM SAL', 'CSAL', 'SEM SAL', 
                          'SSAL', 'SEM ACUCAR', 'SACUCAR', 'DIET', 'FIT'];
  
  // Verificar sabores
  for (const sabor of sabores) {
    if (textoUpper.includes(sabor)) {
      palavrasChave.push(sabor);
    }
  }
  
  // Verificar tipos
  for (const tipo of tipos) {
    if (textoUpper.includes(tipo)) {
      palavrasChave.push(tipo);
    }
  }
  
  // Verificar características
  for (const carac of caracteristicas) {
    if (textoUpper.includes(carac)) {
      palavrasChave.push(carac);
    }
  }
  
  return palavrasChave;
}

// 📊 Calcular similaridade entre dois textos (Levenshtein distance simplificada)
function calcularSimilaridade(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix: number[][] = [];

  // Inicializar matriz
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Preencher matriz
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // Deleção
        matrix[i][j - 1] + 1,      // Inserção
        matrix[i - 1][j - 1] + cost // Substituição
      );
    }
  }

  // Calcular porcentagem de similaridade
  const maxLen = Math.max(len1, len2);
  const distance = matrix[len1][len2];
  return 1 - (distance / maxLen);
}

/**
 * 🔍 Busca produto master com fuzzy matching robusto
 * Usa mesma lógica do processar-normalizacao-global para 90%+ de acerto automático
 */
async function buscarProdutoMaster(
  produtoNome: string,
  categoria: string,
  supabase: any
): Promise<{ found: boolean; master: any | null }> {
  
  // 1️⃣ Verificar feature flag
  if (!ENABLE_MASTER_SEARCH) {
    return { found: false, master: null };
  }
  
  // 2️⃣ Verificar cache
  const cacheKey = `${produtoNome}|${categoria}`.toUpperCase();
  if (masterCache.has(cacheKey)) {
    const cached = masterCache.get(cacheKey);
    if (cached) {
      console.log(`🔥 Cache HIT: ${produtoNome} → ${cached.nome_padrao}`);
      return { found: true, master: cached };
    }
  }
  
  try {
    // 3️⃣ Normalizar texto para matching
    const textoOriginal = produtoNome;
    let textoParaMatching = normalizarTextoParaMatching(produtoNome);
    
    // 🧹 CRÍTICO: Limpar abreviações comuns antes do matching
    textoParaMatching = limparAbreviacoes(textoParaMatching);
    
    // 4️⃣ Extrair metadados
    const marcaExtraida = extrairMarca(produtoNome);
    const pesoExtraido = extrairPesoVolume(produtoNome);
    const temMarca = temMarcaConhecida(produtoNome);
    
    // 5️⃣ Estimar categoria (fallback se categoria vier errada)
    let categoriaEstimada = categoria.toUpperCase();
    const textoUpper = textoParaMatching;
    
    // 🧀 LATICÍNIOS/FRIOS - PRIORIDADE ALTA
    if (textoUpper.includes('MANTEIGA') || textoUpper.includes('MARGARINA')) {
      categoriaEstimada = 'LATICÍNIOS/FRIOS';
      console.log(`📍 Categoria corrigida: ${categoriaEstimada} (MANTEIGA/MARGARINA)`);
    } else if (textoUpper.includes('QUEIJO') || textoUpper.includes('PRESUNTO') || 
               textoUpper.includes('SALAME') || textoUpper.includes('MORTADELA') ||
               textoUpper.includes('IOGURTE') || textoUpper.includes('REQUEIJAO')) {
      categoriaEstimada = 'LATICÍNIOS/FRIOS';
      console.log(`📍 Categoria corrigida: ${categoriaEstimada} (FRIOS)`);
    }
    // 🥫 MERCEARIA
    else if (textoUpper.includes('CREME DE LEITE') || textoUpper.includes('LEITE CONDENSADO') ||
             textoUpper.includes('AVEIA') || textoUpper.includes('GELATINA') ||
             textoUpper.includes('FARINHA') || textoUpper.includes('ACUCAR')) {
      categoriaEstimada = 'MERCEARIA';
      console.log(`📍 Categoria corrigida: ${categoriaEstimada} (MERCEARIA)`);
    }
    // 🧼 LIMPEZA
    else if (textoUpper.includes('DETERGENTE') || textoUpper.includes('SABAO')) {
      categoriaEstimada = 'LIMPEZA';
    }
    // 🥤 BEBIDAS
    else if (textoUpper.includes('REFRIGERANTE') || textoUpper.includes('SUCO')) {
      categoriaEstimada = 'BEBIDAS';
    }
    // 🧴 HIGIENE
    else if (textoUpper.includes('SHAMPOO') || textoUpper.includes('SABONETE')) {
      categoriaEstimada = 'HIGIENE';
    }
    
    // 6️⃣ Buscar produtos similares usando RPC com timeout
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), 3000)
    );
    
    const searchPromise = supabase.rpc('buscar_produtos_similares', {
      texto_busca: textoParaMatching.split(' ').slice(0, 6).join(' '), // ✅ Incluir até 6 tokens (inclui sabores)
      categoria_filtro: categoriaEstimada,
      limite: 10,
      threshold: 0.3
    });
    
    const result = await Promise.race([searchPromise, timeoutPromise]) as any;
    let { data: similares, error } = result;
    
    // 🔄 FALLBACK MULTI-CATEGORIA: Se não encontrou na categoria estimada, tentar outras
    if (error || !similares || similares.length === 0) {
      console.log(`⚠️ Sem similares em ${categoriaEstimada}, tentando outras categorias...`);
      
      const categoriasPrincipais = ['MERCEARIA', 'LATICÍNIOS/FRIOS', 'BEBIDAS', 'LIMPEZA', 'HIGIENE/FARMÁCIA', 'AÇOUGUE', 'HORTIFRUTI', 'PADARIA', 'CONGELADOS', 'PET'];
      
      for (const catAlternativa of categoriasPrincipais) {
        if (catAlternativa === categoriaEstimada) continue; // Já tentamos
        
        const { data: similaresAlt, error: errorAlt } = await supabase.rpc('buscar_produtos_similares', {
          texto_busca: textoParaMatching.split(' ').slice(0, 6).join(' '), // ✅ Incluir até 6 tokens
          categoria_filtro: catAlternativa,
          limite: 10,
          threshold: 0.3
        });
        
        if (!errorAlt && similaresAlt && similaresAlt.length > 0) {
          console.log(`✅ Encontrado em categoria alternativa: ${catAlternativa}`);
          similares = similaresAlt;
          categoriaEstimada = catAlternativa; // Atualizar categoria para logs
          break;
        }
      }
      
      // Se ainda não encontrou, desistir
      if (!similares || similares.length === 0) {
        console.log(`❌ Sem similares em nenhuma categoria para: ${produtoNome}`);
        masterCache.set(cacheKey, null);
        return { found: false, master: null };
      }
    }
    
    // 7️⃣ Aplicar fuzzy matching Levenshtein
    console.log(`\n🔍 Buscando master: "${textoOriginal}"`);
    if (marcaExtraida) console.log(`   Marca: ${marcaExtraida}`);
    if (pesoExtraido) console.log(`   Peso: ${pesoExtraido.valor}${pesoExtraido.unidade}`);
    if (temMarca) console.log(`   🏷️ Contém marca conhecida - threshold reduzido para 70%`);
    
    for (const candidato of similares.slice(0, 5)) {
      let masterNormalizado = normalizarTextoParaMatching(candidato.nome_padrao);
      
      // 🧹 CRÍTICO: Limpar abreviações do master também
      masterNormalizado = limparAbreviacoes(masterNormalizado);
      
      // 🔥 Aplicar normalização de ordem de tokens para evitar falhas por ordem diferente
      const candidatoOrdenado = normalizarOrdemTokens(textoParaMatching);
      const masterOrdenado = normalizarOrdemTokens(masterNormalizado);
      
      const similaridade = calcularSimilaridadeLevenshtein(candidatoOrdenado, masterOrdenado);
      
      // 🔑 CRÍTICO: Verificar se palavras-chave críticas batem
      const palavrasChaveCandidato = extrairPalavrasChave(textoParaMatching);
      const palavrasChaveMaster = extrairPalavrasChave(masterNormalizado);
      
      // Se candidato tem palavra-chave específica (sabor, tipo), master DEVE ter a MESMA
      if (palavrasChaveCandidato.length > 0) {
        const palavrasChaveComuns = palavrasChaveCandidato.filter(p => 
          palavrasChaveMaster.includes(p)
        );
        
        // Se não há NENHUMA palavra-chave em comum, rejeitar match
        if (palavrasChaveComuns.length === 0) {
          console.log(`   ⚠️ Rejeitar: palavras-chave não batem (candidato: [${palavrasChaveCandidato.join(', ')}] vs master: [${palavrasChaveMaster.join(', ')}])`);
          continue; // Próximo candidato
        }
        
        console.log(`   ✅ Palavras-chave batem: [${palavrasChaveComuns.join(', ')}]`);
      }
      
      // Verificar marca
      const marcaBate = !marcaExtraida || 
                       !candidato.marca || 
                       candidato.marca.toUpperCase().includes(marcaExtraida) ||
                       marcaExtraida.includes(candidato.marca.toUpperCase());
      
      // Verificar peso
      let pesoBate = true;
      if (pesoExtraido && candidato.qtd_valor) {
        const diferencaPeso = Math.abs(candidato.qtd_valor - pesoExtraido.valor);
        pesoBate = diferencaPeso < 10;
      }
      
      // 🎯 THRESHOLD DINÂMICO baseado em marca e variante
      const temVariante = palavrasChaveCandidato.length > 0;
      
      let threshold = 80; // Padrão
      if (temMarca && !temVariante) {
        // Marca conhecida SEM variante específica - mais permissivo para typos
        threshold = 70;
        console.log(`   🏷️ Marca conhecida sem variante - threshold: 70%`);
      } else if (temMarca && temVariante) {
        // Marca conhecida COM variante (sabor, tipo) - mais rigoroso
        threshold = 85;
        console.log(`   🏷️ Marca conhecida COM variante - threshold: 85%`);
      } else if (marcaBate && pesoBate) {
        // Marca e peso batem
        threshold = 75;
        console.log(`   🏷️ Marca e peso batem - threshold: 75%`);
      }
      
      console.log(`   Original: "${textoOriginal}" vs "${candidato.nome_padrao}"`);
      console.log(`   Limpo: "${textoParaMatching}" vs "${masterNormalizado}"`);
      console.log(`   Ordenado: "${candidatoOrdenado}" vs "${masterOrdenado}"`);
      console.log(`   Similaridade: ${similaridade.toFixed(1)}% (threshold: ${threshold}%, marca: ${marcaBate}, peso: ${pesoBate}, temMarca: ${temMarca})`);
      
      if (similaridade >= threshold) {
        console.log(`   ✅ MATCH! ${candidato.nome_padrao} [${candidato.sku_global}]`);
        masterCache.set(cacheKey, candidato);
        return { found: true, master: candidato };
      }
    }
    
    // Não encontrou
    console.log(`   ❌ Nenhum match acima do threshold`);
    masterCache.set(cacheKey, null);
    return { found: false, master: null };
    
  } catch (error: any) {
    // 8️⃣ FALLBACK: Em caso de erro/timeout, continuar sem master
    if (error.message === 'Timeout') {
      console.warn(`⏱️ Timeout ao buscar master para "${produtoNome}" - continuando sem normalização`);
    } else {
      console.warn(`⚠️ Erro ao buscar master para "${produtoNome}": ${error.message}`);
    }
    masterCache.set(cacheKey, null);
    return { found: false, master: null };
  }
}

// ================== RECATEGORIZAÇÃO DINÂMICA ==================
// ⚠️ ESPELHADO de recategorizar-produtos-inteligente/index.ts
// Qualquer ajuste na lógica de categorização DEVE ser refletido nos dois pontos
// para evitar divergência entre ingestão de nota e recategorização master.

// Normalizar texto: lowercase, sem acentos
function normalizeTextForCateg(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Tokenizar texto em palavras
function tokenizeForCateg(text: string): string[] {
  return normalizeTextForCateg(text).split(/\s+/).filter(t => t.length > 0);
}

// Verificar se keyword faz match no nome do produto (por token exato, NÃO substring)
function keywordMatchesProductForCateg(keyword: string, productName: string): boolean {
  const keywordTokens = tokenizeForCateg(keyword);
  const productTokens = tokenizeForCateg(productName);
  
  if (keywordTokens.length === 1) {
    return productTokens.some(token => token === keywordTokens[0]);
  }
  
  // Keyword multi-palavra: verificar sequência contígua de tokens
  for (let i = 0; i <= productTokens.length - keywordTokens.length; i++) {
    let match = true;
    for (let j = 0; j < keywordTokens.length; j++) {
      if (productTokens[i + j] !== keywordTokens[j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  
  return false;
}

// 🔄 Aplicar regras de recategorização com lógica determinística por especificidade
// Mesma lógica de recategorizar-produtos-inteligente: coleta TODAS as regras,
// ordena por especificidade (tokens), escopo (global > específica), e desempate alfabético.
async function aplicarRegrasRecategorizacao(
  produtoNome: string,
  categoriaAtual: string,
  regrasCache: any[] | null,
  contador?: { value: number }
): Promise<string> {
  try {
    // Se não há regras em cache, aplicar fallback
    if (!regrasCache || regrasCache.length === 0) {
      // Fallback obrigatório: nunca retornar vazio/nulo
      if (!categoriaAtual || categoriaAtual.trim() === '') return 'outros';
      return categoriaAtual;
    }

    const categoriaUpper = (categoriaAtual || '').toUpperCase();

    // Coletar TODAS as regras que casam com o produto
    interface RegraMatch {
      regra: any;
      maxTokens: number;
      isGlobal: boolean;
      descricao: string;
    }

    const matches: RegraMatch[] = [];

    for (const regra of regrasCache) {
      let maxTokensForMatch = 0;
      let hasMatch = false;

      for (const kw of regra.keywords) {
        if (keywordMatchesProductForCateg(kw, produtoNome)) {
          hasMatch = true;
          const tokens = tokenizeForCateg(kw).length;
          if (tokens > maxTokensForMatch) maxTokensForMatch = tokens;
        }
      }

      if (!hasMatch) continue;

      // Verificar restrição de categoria origem (se existir)
      const isGlobal = !regra.categorias_origem || regra.categorias_origem.length === 0;
      if (!isGlobal) {
        const origemMatch = regra.categorias_origem.some((cat: string) =>
          categoriaUpper === cat.toUpperCase()
        );
        if (!origemMatch) continue;
      }

      matches.push({
        regra,
        maxTokens: maxTokensForMatch,
        isGlobal,
        descricao: regra.descricao || '',
      });
    }

    if (matches.length === 0) {
      // Nenhuma regra casou — garantir fallback
      if (!categoriaAtual || categoriaAtual.trim() === '') return 'outros';
      return categoriaAtual;
    }

    // Ordenar por especificidade determinística:
    // 1) mais tokens vence, 2) global vence específica, 3) descrição alfabética
    matches.sort((a, b) => {
      if (b.maxTokens !== a.maxTokens) return b.maxTokens - a.maxTokens;
      if (a.isGlobal !== b.isGlobal) return a.isGlobal ? -1 : 1;
      return a.descricao.localeCompare(b.descricao);
    });

    const regraVencedora = matches[0];

    if (matches.length > 1 && matches[0].regra.categoria_destino !== matches[1].regra.categoria_destino) {
      console.log(`🏆 Ingestão: "${produtoNome}" → regra "${regraVencedora.descricao}" (${regraVencedora.maxTokens} tokens) venceu sobre "${matches[1].descricao}" (${matches[1].maxTokens} tokens)`);
    }

    if (contador) contador.value++;
    const novaCategoria = regraVencedora.regra.categoria_destino.toLowerCase();
    console.log(`🔄 Recategorizado: "${produtoNome}" | ${categoriaAtual} → ${novaCategoria} | ${regraVencedora.descricao}`);
    
    return novaCategoria;
  } catch (error: any) {
    console.error(`⚠️ Erro ao aplicar regras: ${error.message}`);
    // Fallback: manter categoria original ou 'outros'
    if (!categoriaAtual || categoriaAtual.trim() === '') return 'outros';
    return categoriaAtual;
  }
}

// ================== EDGE FUNCTION ==================
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { notaId, imagemId, force } = body || {};
    
    // Aceitar tanto notaId quanto imagemId para compatibilidade
    const finalNotaId = notaId || imagemId;

    if (!finalNotaId) {
      return new Response(JSON.stringify({ success: false, error: "ID da nota é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`🏁 process-receipt-full START - nota_id=${finalNotaId}, force=${force || false}`);

    // 🔄 CARREGAR REGRAS DE RECATEGORIZAÇÃO (cache para performance)
    console.log('📋 Carregando regras de recategorização...');
    const { data: regrasRecategorizacao } = await supabase
      .from('regras_recategorizacao')
      .select('*')
      .eq('ativa', true);
    
    console.log(`✅ ${regrasRecategorizacao?.length || 0} regras ativas carregadas`);

    // 🥚 Carregar regras de conversão de embalagem (uma vez por execução)
    const { data: regrasConversao } = await supabase
      .from('regras_conversao_embalagem')
      .select('produto_pattern, produto_exclusao_pattern, ean_pattern, tipo_embalagem, qtd_por_embalagem, unidade_consumo, prioridade')
      .eq('ativo', true)
      .eq('tipo_conversao', 'fixa')
      .order('prioridade', { ascending: true });
    const regrasEmbalagem: RegraConversao[] = (regrasConversao || []) as RegraConversao[];
    console.log(`📦 Regras de conversão de embalagem carregadas: ${regrasEmbalagem.length}`);

    // Buscar nota com verificação de status processada
    const { data: nota, error: notaError } = await supabase
      .from("notas_imagens")
      .select("id, usuario_id, compra_id, dados_extraidos, processada, processing_started_at")
      .eq("id", finalNotaId)
      .single();

    if (notaError || !nota) {
      return new Response(JSON.stringify({ success: false, error: "Nota não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 🔒 CORREÇÃO #1: Verificar se há lock expirado (timeout de 5 minutos)
    // 🛡️ FRENTE A1: Reduzido de 5min → 90s.
    // Notas grandes paralelizam IA em chunks (ver Frente A3) e atualizam heartbeat (A2),
    // então locks legítimos não passam disso. Acelera recuperação de "zombie locks".
    const LOCK_TIMEOUT_MS = 90 * 1000; // 90 segundos
    if (nota.processing_started_at) {
      const lockAge = Date.now() - new Date(nota.processing_started_at).getTime();
      
      if (lockAge > LOCK_TIMEOUT_MS) {
        console.log(`⚠️ Lock expirado (${(lockAge/1000/60).toFixed(1)} min). Liberando...`);
        await supabase
          .from('notas_imagens')
          .update({ processing_started_at: null })
          .eq('id', finalNotaId);
      } else if (!force) {
        // Lock ainda válido, não processar
        console.log(`🔒 Nota em processamento há ${(lockAge/1000).toFixed(0)}s. Aguardando...`);
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Nota já está sendo processada por outra instância",
            already_processing: true,
            itens_inseridos: 0
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 🔒 LOCK ATÔMICO: Marcar nota como "em processamento"
    const agora = nowIso();
    const { data: lockData, error: lockError } = await supabase
      .from('notas_imagens')
      .update({ 
        processing_started_at: agora,
        updated_at: agora
      })
      .eq('id', finalNotaId)
      .is('processing_started_at', null) // ✅ Só atualiza se não estiver sendo processada
      .select()
      .single();

    if (lockError || !lockData) {
      console.log(`🔒 Nota ${finalNotaId} já está sendo processada por outra execução. Abortando...`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Nota já está sendo processada por outra instância",
          already_processing: true,
          itens_inseridos: 0
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ Lock de processamento adquirido para nota ${finalNotaId}`);

    // 🔄 RESETAR FLAG NORMALIZADA PARA PERMITIR RENORMALIZAÇÃO
    console.log('🔄 Resetando flag normalizada para permitir reprocessamento completo...');
    await supabase
      .from('notas_imagens')
      .update({ normalizada: false })
      .eq('id', finalNotaId);
    console.log('✅ Flag normalizada resetada - produtos serão renormalizados');

    try {
      // 💰 ATUALIZAÇÃO PREVENTIVA DE PREÇOS (ANTES DE QUALQUER CHECK)
      // Isso garante que preços sejam atualizados mesmo em re-validações
      console.log('💰 Iniciando atualização preventiva de preços atuais...');
      
      const dadosExtraidos = nota.dados_extraidos || {};
      
      // Extrair dados do estabelecimento
      const estabelecimentoCnpj = dadosExtraidos.cnpj || 
                                   dadosExtraidos.estabelecimento?.cnpj || 
                                   dadosExtraidos.supermercado?.cnpj || 
                                   dadosExtraidos.emitente?.cnpj || '';
      
      const estabelecimentoNome = dadosExtraidos.estabelecimento?.nome || 
                                   dadosExtraidos.supermercado?.nome || 
                                   dadosExtraidos.emitente?.nome || 
                                   dadosExtraidos.nome_estabelecimento || '';
      
      // ✅ CORREÇÃO: Buscar data/hora no formato novo primeiro
      let dataCompraAtual = dadosExtraidos.compra?.data_emissao || 
                            dadosExtraidos.data_emissao || 
                            dadosExtraidos.data ||
                            dadosExtraidos.emissao ||
                            new Date().toISOString().split('T')[0];
      
      let horaCompra = '00:00:00';
      
      // Parsear data e hora corretamente (formatos: "DD/MM/YYYY" ou "DD/MM/YYYY HH:MM:SS")
      if (dataCompraAtual && typeof dataCompraAtual === 'string') {
        const partes = dataCompraAtual.split(' ');
        const dataStr = partes[0];
        const horaStr = partes[1] || '00:00:00';
        
        // Converter DD/MM/YYYY para YYYY-MM-DD
        if (dataStr.includes('/')) {
          const [dia, mes, ano] = dataStr.split('/');
          dataCompraAtual = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
          horaCompra = horaStr;
        }
      }
      
      console.log(`📍 Estabelecimento: ${estabelecimentoNome} (${estabelecimentoCnpj})`);
      console.log(`📅 Data/Hora parseada: ${dataCompraAtual} ${horaCompra}`);
      
      // Buscar itens (priorizar produtos_consolidados do InfoSimples)
      const itensDaNota = dadosExtraidos.produtos || dadosExtraidos.produtos_consolidados || dadosExtraidos.itens || [];
      
      if (itensDaNota && itensDaNota.length > 0) {
        let precosAtualizados = 0;
        
        for (const item of itensDaNota) {
          const produtoNome = item.descricao || item.nome;
          const valorUnitario = parseFloat(item.valor_unitario_comercial || item.valor_unitario) || 0;
          const itemEan = item.ean || item.codigo_barras || item.codigo || null;
          const itemQuantidade = parseFloat(item.quantidade || 0) || null;
          const itemMasterId = item.produto_master_id || null;
          
          if (produtoNome && valorUnitario > 0) {
            try {
              const { error: erroPrecosAtuais } = await supabase.functions.invoke('update-precos-atuais', {
                body: {
                  compraId: finalNotaId,
                  produtoNome,
                  precoUnitario: valorUnitario,
                  estabelecimentoCnpj,
                  estabelecimentoNome,
                  dataCompra: dataCompraAtual,
                  horaCompra,
                  userId: nota.usuario_id,
                  notaImagemId: finalNotaId,
                  ean: itemEan,
                  itemQuantidade,
                  produtoMasterId: itemMasterId,
                }
              });

              if (!erroPrecosAtuais) {
                precosAtualizados++;
              }
            } catch (error) {
              console.error(`⚠️ Erro ao atualizar preço para ${produtoNome}:`, error);
            }
          }
        }
        
        console.log(`✅ Atualização preventiva concluída: ${precosAtualizados}/${itensDaNota.length} preços atualizados`);
      }
      
      // 🛡️ VERIFICAÇÃO ANTI-DUPLICAÇÃO INTELIGENTE
      if (nota.processada && !force) {
        // Verificar se já existem itens no estoque para esta nota
        const { data: estoqueExistente } = await supabase
          .from("estoque_app")
          .select("*")
          .eq("nota_id", finalNotaId)
          .eq("user_id", nota.usuario_id);
        
        // SÓ bloquear se realmente há itens no estoque (duplicação real)
        if (estoqueExistente && estoqueExistente.length > 0) {
          console.log(`⚠️ NOTA JÁ PROCESSADA COM ESTOQUE - Bloqueando re-processamento para nota ${finalNotaId} (${estoqueExistente.length} itens no estoque)`);
          
          const totalFinanceiro = estoqueExistente.reduce((acc: number, it: any) => 
            acc + (it.quantidade * it.preco_unitario_ultimo), 0);
          
          // Liberar lock antes de retornar
          await supabase
            .from("notas_imagens")
            .update({ processing_started_at: null })
            .eq("id", finalNotaId);
          
          return new Response(
            JSON.stringify({
              success: true,
              message: "Nota já foi processada anteriormente",
              nota_id: finalNotaId,
              itens_inseridos: estoqueExistente.length,
              total_financeiro: totalFinanceiro.toFixed(2),
              already_processed: true
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else {
          // Nota marcada como processada MAS sem itens no estoque = processamento incompleto
          console.log(`🔧 CORREÇÃO DE PROCESSAMENTO INCOMPLETO - Nota ${finalNotaId} estava marcada como processada mas sem itens no estoque. Processando...`);
        }
      }

      if (force) {
        console.log(`🔄 REPROCESSAMENTO FORÇADO - Reprocessando nota ${finalNotaId} por solicitação manual`);
      }

    // Buscar produtos dos 2 formatos possíveis
    let itens: any[] = [];
    
    // ✅ CORREÇÃO: Buscar data no formato novo primeiro (compra.data_emissao)
    const dataCompra = nota.dados_extraidos?.compra?.data_emissao || 
                       nota.dados_extraidos?.data_emissao ||
                       nota.dados_extraidos?.data ||
                       new Date().toISOString().split('T')[0];

    // FORMATO 1: InfoSimples (QR Code) - dados_extraidos.produtos
    if (nota.dados_extraidos?.produtos && Array.isArray(nota.dados_extraidos.produtos)) {
      console.log("✅ Usando formato InfoSimples (produtos)");
      itens = nota.dados_extraidos.produtos.map((item: any) => {
        const quantidade = parseFloat(item.quantidade_comercial || item.quantidade) || 0;
        const valorUnitario = parseFloat(item.valor_unitario_comercial || item.valor_unitario) || 
                             (parseFloat(item.normalizado_valor || item.valor) / quantidade) || 0;
        
        return {
          descricao: item.descricao || item.nome,
          categoria: (item.categoria || 'outros').toLowerCase(),
          quantidade,
          valor_unitario: valorUnitario,
          unidade: normalizarUnidadeMedida(item.unidade_comercial || item.unidade || 'UN'),
          data_compra: dataCompra,
          ean_comercial: limparEAN(item.codigo_barras || item.codigo_barras_comercial || item.ean_comercial) // ✅ EAN
        };
      });
      console.log(`📦 ${itens.length} produtos carregados do InfoSimples`);
    }
    // FORMATO 2: WhatsApp/Upload (PDF/Imagem) - PRIORIZAR `itens` (fonte original) sobre `produtos_consolidados`
    // Motivo: produtos_consolidados é gerado pelo próprio pipeline em pass anterior e pode usar chave preco_unitario.
    // A fonte `itens` preserva os preços originais da nota fiscal.
    else if (nota.dados_extraidos?.itens && Array.isArray(nota.dados_extraidos.itens) && nota.dados_extraidos.itens.length > 0) {
      console.log("✅ Usando formato WhatsApp/Upload (itens) — fonte original priorizada");
      itens = nota.dados_extraidos.itens.map((item: any) => {
        const quantidade = parseFloat(item.quantidade) || 0;
        // Aceitar valor_unitario OU preco_unitario (compatibilidade com produtos_consolidados regravados)
        const valorUnitario = parseFloat(item.valor_unitario ?? item.preco_unitario ?? item.valor_unitario_comercial) || 0;
        
        return {
          descricao: item.descricao || item.nome,
          categoria: (item.categoria || 'outros').toLowerCase(),
          quantidade,
          valor_unitario: valorUnitario,
          unidade: normalizarUnidadeMedida(item.unidade || 'UN'),
          data_compra: dataCompra,
          ean_comercial: limparEAN(item.codigo_barras || item.codigo_barras_comercial || item.ean_comercial) // ✅ EAN
        };
      });
      console.log(`📦 ${itens.length} produtos carregados do WhatsApp/Upload (itens)`);
    }
    // FORMATO 3: Fallback — produtos_consolidados (gerado por pass anterior)
    else if (nota.dados_extraidos?.produtos_consolidados && Array.isArray(nota.dados_extraidos.produtos_consolidados)) {
      console.log("✅ Usando formato InfoSimples (produtos_consolidados) — fallback");
      itens = nota.dados_extraidos.produtos_consolidados.map((item: any) => {
        const quantidade = parseFloat(item.quantidade) || 0;
        // Aceitar AMBAS as chaves: produtos_consolidados grava como `preco_unitario`,
        // mas formatos antigos podem ter `valor_unitario`.
        const valorUnitario = parseFloat(item.preco_unitario ?? item.valor_unitario ?? item.valor_unitario_comercial) || 0;
        
        return {
          descricao: item.descricao || item.nome,
          categoria: (item.categoria || 'outros').toLowerCase(),
          quantidade,
          valor_unitario: valorUnitario,
          unidade: normalizarUnidadeMedida(item.unidade || 'UN'),
          data_compra: dataCompra,
          ean_comercial: limparEAN(item.codigo_barras || item.codigo_barras_comercial || item.ean_comercial) // ✅ EAN
        };
      });
      console.log(`📦 ${itens.length} produtos carregados (consolidados)`);
    }
    else {
      console.error("❌ Nenhum produto encontrado em dados_extraidos");
      console.error("📦 dados_extraidos completo:", JSON.stringify(nota.dados_extraidos, null, 2));
    }

    if (!itens || itens.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "Nenhum item encontrado na nota" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limpar estoque anterior dessa nota com transaction safety
    console.log(`🧹 [DEBUG] Deletando produtos antigos da nota ${finalNotaId}...`);
    const { data: deletedProducts, error: deleteError } = await supabase
      .from("estoque_app")
      .delete()
      .eq("nota_id", finalNotaId)
      .eq("user_id", nota.usuario_id)
      .select(); // ✅ Retornar produtos deletados para auditoria
    
    if (deleteError) {
      console.error("❌ Erro ao limpar estoque anterior:", deleteError);
      // Não falhar por isso, apenas logar
    } else {
      console.log(`🗑️ [DEBUG] ${deletedProducts?.length || 0} produtos deletados do estoque anterior:`, deletedProducts?.map(p => p.produto_nome));
    }

    // Consolidar itens duplicados antes de inserir no estoque
    const produtosConsolidados = new Map<string, any>();
    let produtosRecategorizados = 0; // Contador de recategorizações
    
    for (const item of itens) {
      const key = item.descricao; // usar descrição como chave para consolidar
      
      // 🥚 TRATAMENTO ESPECIAL: Detectar quantidade em embalagem
      const valorTotal = item.quantidade * item.valor_unitario;
      const embalagemInfo = detectarQuantidadeEmbalagem(item.descricao, valorTotal, regrasEmbalagem, item.ean_comercial || null);
      
      // Quantidade e preço final considerando embalagem
      // Bug fix: multiplicar item.quantidade (nº de embalagens) × unidades por embalagem
      const quantidadeFinal = embalagemInfo.isMultiUnit ? (item.quantidade * embalagemInfo.quantity) : item.quantidade;
      const precoUnitarioFinal = embalagemInfo.isMultiUnit ? (valorTotal / quantidadeFinal) : item.valor_unitario;
      
      if (produtosConsolidados.has(key)) {
        // Item já existe, consolidar com preço médio ponderado
        const itemExistente = produtosConsolidados.get(key);
        
        // ✅ Calcular valor total ANTES de adicionar novo item
        const valorTotalAnterior = itemExistente.quantidade * itemExistente.preco_unitario_ultimo;
        
        // ✅ Calcular valor total do NOVO item
        const valorTotalNovo = quantidadeFinal * precoUnitarioFinal;
        
        // ✅ Somar quantidades
        itemExistente.quantidade += quantidadeFinal;
        
        // ✅ Calcular preço médio ponderado
        itemExistente.preco_unitario_ultimo = (valorTotalAnterior + valorTotalNovo) / itemExistente.quantidade;
        
        console.log(`📦 Consolidado: ${key} | Qtd: ${itemExistente.quantidade} | Preço médio: R$ ${itemExistente.preco_unitario_ultimo.toFixed(2)}`);
      } else {
        // Novo item
        const contadorRecategorizacao = { value: produtosRecategorizados };
        const categoriaFinal = await aplicarRegrasRecategorizacao(
          item.descricao,
          (item.categoria || 'outros'),
          regrasRecategorizacao,
          contadorRecategorizacao
        );
        produtosRecategorizados = contadorRecategorizacao.value;
        
        produtosConsolidados.set(key, {
          user_id: nota.usuario_id,
          nota_id: nota.id,
          produto_nome: item.descricao,
          categoria: categoriaFinal,
          quantidade: quantidadeFinal,
          unidade_medida: embalagemInfo.isMultiUnit ? 'Un' : normalizarUnidadeMedida(item.unidade || 'unidade'),
          preco_unitario_ultimo: precoUnitarioFinal,
          compra_id: nota.compra_id,
          origem: "nota_fiscal",
          imagem_url: null,
          ean_comercial: item.ean_comercial || null,
          // Campos de rastreabilidade da embalagem
          tipo_embalagem: embalagemInfo.tipo_embalagem || null,
          qtd_valor: embalagemInfo.isMultiUnit ? item.quantidade : null,
          qtd_base: embalagemInfo.isMultiUnit ? embalagemInfo.quantity : null,
          unidade_base: embalagemInfo.isMultiUnit ? embalagemInfo.unidade_consumo.toLowerCase() : null,
          preco_por_unidade_base: embalagemInfo.isMultiUnit ? precoUnitarioFinal : null,
        });
      }
    }

    // Converter Map para Array
    const produtosEstoque = Array.from(produtosConsolidados.values());
    
    console.log(`📦 [DEBUG] Consolidação concluída:`);
    console.log(`   - Itens originais na nota: ${itens.length}`);
    console.log(`   - Produtos únicos consolidados: ${produtosEstoque.length}`);
    console.log(`   - Produtos recategorizados: ${produtosRecategorizados} (${((produtosRecategorizados/produtosEstoque.length)*100).toFixed(1)}%)`);
    console.log(`📋 [DEBUG] Lista de produtos consolidados:`, produtosEstoque.map(p => `${p.produto_nome} (${p.quantidade} ${p.unidade_medida})`));
    
    // 🔒 CORREÇÃO #2: Salvar dados_extraidos ANTES de inserir no estoque (segurança contra perda de dados)
    console.log('💾 Salvando dados extraídos antes de processar estoque...');
    const { error: saveError } = await supabase
      .from('notas_imagens')
      .update({
        dados_extraidos: {
          ...nota.dados_extraidos,
          produtos_consolidados: produtosEstoque.map(p => ({
            nome: p.produto_nome,
            categoria: p.categoria.toLowerCase(),
            quantidade: p.quantidade,
            preco_unitario: p.preco_unitario_ultimo,
            unidade: p.unidade_medida
          })),
          total_itens: produtosEstoque.length
        }
      })
      .eq('id', finalNotaId);

    if (saveError) {
      console.error('⚠️ Erro ao salvar dados extraídos:', saveError);
      // Não falhar, apenas logar (dado é uma precaução)
    } else {
      console.log('✅ Dados extraídos salvos com sucesso');
    }
    
    // 🔍 FASE 2: BUSCAR PRODUTO MASTER PARA CADA ITEM
    // 🛡️ FRENTE A2+A3: paralelização em chunks + heartbeat para evitar timeout em notas grandes.
    console.log('🔍 Iniciando busca de produtos master...');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    let masterEncontrados = 0;
    let masterNaoEncontrados = 0;
    let iaNormalizacoes = 0;
    let fuzzyNormalizacoes = 0;
    let eanNormalizacoes = 0; // ✅ Contador de matches por EAN

    // Helper: processa UM produto (extraído do corpo do for original).
    const processarProdutoNormalizacao = async (produto: any) => {
      try {
        // Limpar unidades de medida do nome para melhor matching
        const nomeLimpo = limparUnidadesMedida(produto.produto_nome);
        
        // 🥚 Detectar embalagem multi-unidade
        const valorTotal = produto.quantidade * produto.preco_unitario_ultimo;
        const embalagemInfo = detectarQuantidadeEmbalagem(produto.produto_nome, valorTotal, regrasEmbalagem, produto.ean_comercial || null);
        
        let resultado: { found: boolean; master: any | null } | null = null;
        
        // 🔢 ESTRATÉGIA 0: Busca por EAN_Comercial (PRIORIDADE MÁXIMA - antes da IA)
        if (produto.ean_comercial) {
          try {
            const variantesEan = eanVariants(produto.ean_comercial);
            console.log(`🔢 Tentando match por EAN: ${produto.ean_comercial} (variantes: ${variantesEan.join(',')}) para "${produto.produto_nome}"`);
            const { data: masterPorEan, error: eanError } = await supabase
              .from('produtos_master_global')
              .select('*')
              .in('codigo_barras', variantesEan);

            // Deduplicar por id (caso o mesmo master apareça por mais de uma variante)
            const mastersUnicos = masterPorEan
              ? Array.from(new Map(masterPorEan.map((m: any) => [m.id, m])).values())
              : [];

            if (!eanError && mastersUnicos.length === 1) {
              // ✅ Match único por EAN — confiança total (ignora ordem de palavras)
              resultado = { found: true, master: mastersUnicos[0] };
              eanNormalizacoes++;
              console.log(`✅ EAN MATCH: "${produto.produto_nome}" → ${mastersUnicos[0].nome_padrao} (EAN: ${produto.ean_comercial})`);
            } else if (mastersUnicos.length > 1) {
              // ⚠️ Múltiplos masters com mesmo EAN — inconsistência, seguir para IA
              console.warn(`⚠️ EAN ${produto.ean_comercial} encontrado em ${mastersUnicos.length} masters distintos — seguindo para IA (revisão manual recomendada)`);
            } else {
              console.log(`ℹ️ EAN ${produto.ean_comercial} não encontrado no cadastro master — seguindo para IA/fuzzy`);
            }
          } catch (eanErr: any) {
            console.error(`⚠️ Erro na busca por EAN: ${eanErr.message}`);
          }
        }
        
        // 🔎 ESTRATÉGIA 0.5: Sinônimos conhecidos + nome normalizado (antes da IA)
        if (!resultado) {
          try {
            // Helper para remover acentos
            const removerAcentos = (texto: string): string => 
              texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
            
            const nomeNormalizado05 = removerAcentos(nomeLimpo);
            console.log(`🔎 Estratégia 0.5: buscando sinônimo/nome normalizado para "${nomeNormalizado05}"`);
            
            // Passo 1: Buscar sinônimo aprovado exato
            const { data: sinonimos, error: sinErr } = await supabase
              .from('produtos_sinonimos_globais')
              .select('produto_master_id, texto_variacao')
              .not('aprovado_em', 'is', null)
              .not('produto_master_id', 'is', null);
            
            if (!sinErr && sinonimos && sinonimos.length > 0) {
              // Filtrar por match normalizado (sem acentos, case-insensitive)
              const matchesSinonimo = sinonimos.filter(s => 
                removerAcentos(s.texto_variacao) === nomeNormalizado05
              );
              
              if (matchesSinonimo.length === 1) {
                // Match único inequívoco por sinônimo
                const { data: masterSinonimo } = await supabase
                  .from('produtos_master_global')
                  .select('*')
                  .eq('id', matchesSinonimo[0].produto_master_id)
                  .eq('ativo', true)
                  .single();
                
                if (masterSinonimo) {
                  resultado = { found: true, master: masterSinonimo };
                  eanNormalizacoes; // Reusing counter group — logged separately below
                  console.log(`✅ SINÔNIMO MATCH: "${nomeLimpo}" → ${masterSinonimo.nome_padrao} (sinônimo: "${matchesSinonimo[0].texto_variacao}")`);
                }
              } else if (matchesSinonimo.length > 1) {
                console.log(`⚠️ Estratégia 0.5: ${matchesSinonimo.length} sinônimos encontrados para "${nomeNormalizado05}" — ambíguo, seguindo para IA`);
              }
            }
            
            // Passo 2: Se não encontrou sinônimo, buscar por nome normalizado no master
            if (!resultado) {
              const { data: mastersPorNome, error: masterErr } = await supabase
                .from('produtos_master_global')
                .select('*')
                .eq('ativo', true);
              
              if (!masterErr && mastersPorNome) {
                const matchesMaster = mastersPorNome.filter(m => 
                  removerAcentos(m.nome_padrao || '') === nomeNormalizado05
                );
                
                if (matchesMaster.length === 1) {
                  resultado = { found: true, master: matchesMaster[0] };
                  console.log(`✅ NOME NORMALIZADO MATCH: "${nomeLimpo}" → ${matchesMaster[0].nome_padrao}`);
                } else if (matchesMaster.length > 1) {
                  console.log(`⚠️ Estratégia 0.5: ${matchesMaster.length} masters com mesmo nome normalizado "${nomeNormalizado05}" — ambíguo, seguindo para IA`);
                } else {
                  console.log(`ℹ️ Estratégia 0.5: nenhum match para "${nomeNormalizado05}" — seguindo para IA/fuzzy`);
                }
              }
            }
          } catch (e05: any) {
            console.error(`⚠️ Erro na Estratégia 0.5: ${e05.message}`);
          }
        }
        
        // 🤖 ESTRATÉGIA 1: Normalização com IA (se ativado e chave disponível)
        if (USE_AI_NORMALIZATION && lovableApiKey) {
          try {
            console.log(`🤖 Tentando normalização com IA: ${produto.produto_nome}`);
            
            // Buscar candidatos similares para enviar à IA
            const textoParaMatching = normalizarTextoParaMatching(nomeLimpo);
            const { data: similares } = await supabase.rpc('buscar_produtos_similares', {
              texto_busca: textoParaMatching.split(' ').slice(0, 6).join(' '),
              categoria_filtro: produto.categoria.toUpperCase(),
              limite: 5,
              threshold: 0.3
            });
            
            const normalizacaoIA = await normalizarComIA(
              produto.produto_nome,
              similares || [],
              lovableApiKey,
              embalagemInfo
            );
            
            // ✅ IA encontrou match com master existente
            if (normalizacaoIA.produto_master_id && normalizacaoIA.confianca >= 85) {
              // Buscar dados completos do master
              const { data: masterCompleto } = await supabase
                .from('produtos_master_global')
                .select('*')
                .eq('id', normalizacaoIA.produto_master_id)
                .single();
              
              if (masterCompleto) {
                resultado = { found: true, master: masterCompleto };
                iaNormalizacoes++;
                console.log(`✅ IA encontrou master: ${masterCompleto.nome_padrao} (confiança: ${normalizacaoIA.confianca}%)`);
              }
            }
            // ⚠️ IA sugere produto novo (sem master)
            else {
              console.log(`⚠️ IA não encontrou master adequado (confiança: ${normalizacaoIA.confianca}%)`);
              // Deixar resultado null para fallback
            }
          } catch (iaError: any) {
            console.error(`⚠️ Erro na normalização com IA: ${iaError.message}`);
            // Continuar para fallback fuzzy matching
          }
        }
        
        // 🔄 ESTRATÉGIA 2: Fallback para Fuzzy Matching (se IA falhou ou desativada)
        if (!resultado) {
          console.log(`🔍 Usando fallback fuzzy matching: ${produto.produto_nome}`);
          resultado = await buscarProdutoMaster(
            nomeLimpo,
            produto.categoria,
            supabase
          );
          
          if (resultado.found) {
            fuzzyNormalizacoes++;
          }
        }
        
        // ✅ Atualizar produto com dados normalizados (de EAN, IA ou fuzzy)
        if (resultado?.found && resultado.master) {
          produto.sku_global = resultado.master.sku_global;
          produto.produto_master_id = resultado.master.id;
          produto.produto_nome = resultado.master.nome_padrao; // Nome normalizado
          produto.marca = resultado.master.marca;
          produto.categoria = resultado.master.categoria.toLowerCase();
          produto.produto_nome_normalizado = resultado.master.nome_padrao;
          produto.nome_base = resultado.master.nome_base;
          produto.imagem_url = resultado.master.imagem_url;
          masterEncontrados++;
          
          // ✅ Persistência segura do EAN no master (se o master ainda não tem codigo_barras)
          if (produto.ean_comercial && !resultado.master.codigo_barras) {
            try {
              const eanCanon = canonicalEAN(produto.ean_comercial);
              const variantesEan = eanVariants(produto.ean_comercial);
              // Verificar se esse EAN (em qualquer variante) já não está em outro master
              const { data: eanExistente } = await supabase
                .from('produtos_master_global')
                .select('id')
                .in('codigo_barras', variantesEan)
                .neq('id', resultado.master.id)
                .limit(1);

              if (eanCanon && (!eanExistente || eanExistente.length === 0)) {
                // Seguro gravar — EAN não existe em outro master. Grava forma canônica.
                await supabase
                  .from('produtos_master_global')
                  .update({ codigo_barras: eanCanon })
                  .eq('id', resultado.master.id);
                console.log(`🔢 EAN ${eanCanon} salvo no master ${resultado.master.id}`);
              } else if (eanExistente && eanExistente.length > 0) {
                console.warn(`⚠️ EAN ${produto.ean_comercial} já existe em outro master (${eanExistente[0].id}) — não gravado`);
              }
            } catch (eanSaveErr: any) {
              console.error(`⚠️ Erro ao salvar EAN no master: ${eanSaveErr.message}`);
            }
          }
          
          
          // 📝 AUTO-REGISTRO DE SINÔNIMO após vínculo seguro
          try {
            const removerAcentosSin = (texto: string): string => 
              texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
            
            const nomeOriginalNorm = removerAcentosSin(nomeLimpo);
            const nomeMasterNorm = removerAcentosSin(resultado.master.nome_padrao || '');
            
            // Só registrar sinônimo se os nomes normalizados forem realmente diferentes
            if (nomeOriginalNorm && nomeMasterNorm && nomeOriginalNorm !== nomeMasterNorm && nomeOriginalNorm.length > 2) {
              const { error: sinInsertErr } = await supabase
                .from('produtos_sinonimos_globais')
                .insert({
                  produto_master_id: resultado.master.id,
                  texto_variacao: nomeLimpo.toUpperCase().trim(),
                  fonte: 'auto_ingestao',
                  confianca: 90,
                  aprovado_em: new Date().toISOString()
                })
                // Idempotente: não duplicar sinônimos já existentes
                .select()
                .maybeSingle();
              
              if (!sinInsertErr) {
                console.log(`📝 Sinônimo registrado: "${nomeLimpo}" → "${resultado.master.nome_padrao}"`);
              }
              // Silenciar erro de conflito (sinônimo já existe)
            }
          } catch (sinErr: any) {
            // Não bloquear o fluxo por falha no registro de sinônimo
            console.log(`ℹ️ Sinônimo não registrado para "${nomeLimpo}": ${sinErr.message}`);
          }
          
          console.log(`✅ Normalizado: ${produto.produto_nome} (SKU: ${produto.sku_global})`);
        } else {
          // ⚠️ Master não encontrado - CRIAR produto_nome_normalizado mesmo assim
          produto.produto_nome_normalizado = normalizarNomeProdutoEstoque(produto.produto_nome);
          masterNaoEncontrados++;
          console.log(`⚠️ Sem master: ${produto.produto_nome} (normalizado: ${produto.produto_nome_normalizado}) - aguardando aprovação`);
        }
      } catch (error: any) {
        // 🛡️ FALLBACK: Erro ao buscar master, continuar sem ele
        console.error(`❌ Erro ao buscar master para ${produto.produto_nome}:`, error.message);
        masterNaoEncontrados++;
      }
    }; // fim do helper processarProdutoNormalizacao

    // 🛡️ FRENTE A3: paralelização em chunks de 5 (reduz tempo total ~5x para notas grandes).
    // Mantém a lógica intacta — apenas executa N produtos simultaneamente em vez de 1.
    // 🛡️ FRENTE A2: heartbeat — atualiza processing_started_at a cada chunk, garantindo
    // que o lock não vença enquanto o trabalho está realmente em andamento.
    const CHUNK_SIZE_NORMALIZACAO = 5;
    for (let i = 0; i < produtosEstoque.length; i += CHUNK_SIZE_NORMALIZACAO) {
      const chunk = produtosEstoque.slice(i, i + CHUNK_SIZE_NORMALIZACAO);
      const chunkNum = Math.floor(i / CHUNK_SIZE_NORMALIZACAO) + 1;
      const totalChunks = Math.ceil(produtosEstoque.length / CHUNK_SIZE_NORMALIZACAO);
      console.log(`🔁 [NORMALIZAÇÃO] Chunk ${chunkNum}/${totalChunks} (${chunk.length} itens)`);

      // Heartbeat: renova o lock antes do chunk (best-effort, não bloqueia se falhar)
      try {
        await supabase
          .from('notas_imagens')
          .update({ processing_started_at: new Date().toISOString() })
          .eq('id', finalNotaId);
      } catch (hbErr) {
        console.warn('⚠️ [HEARTBEAT] falha (não crítico):', hbErr);
      }

      await Promise.allSettled(chunk.map((p) => processarProdutoNormalizacao(p)));
    }

    console.log(`📊 Busca de master concluída: ${masterEncontrados} normalizados (${((masterEncontrados/produtosEstoque.length)*100).toFixed(1)}%), ${masterNaoEncontrados} sem master`);
    
    if (masterEncontrados > 0) {
      console.log(`🎉 Taxa de normalização automática: ${((masterEncontrados/produtosEstoque.length)*100).toFixed(1)}%`);
      console.log(`   🔢 Normalizações por EAN: ${eanNormalizacoes}`);
      console.log(`   🤖 Normalizações com IA: ${iaNormalizacoes}`);
      console.log(`   🔍 Normalizações com Fuzzy: ${fuzzyNormalizacoes}`);
    }
    
    // 🧹 LIMPEZA DE CANDIDATOS ÓRFÃOS ANTES DE VINCULAR
    console.log('🧹 Limpando candidatos órfãos da nota anterior...');
    const { data: candidatosAntigos } = await supabase
      .from('produtos_candidatos_normalizacao')
      .select('id, texto_original')
      .eq('nota_imagem_id', finalNotaId);
    
    if (candidatosAntigos && candidatosAntigos.length > 0) {
      // Verificar quais candidatos não têm mais produto correspondente no estoque atual
      const nomesAtuais = produtosEstoque.map(p => p.produto_nome);
      const candidatosOrfaos = candidatosAntigos.filter(c => 
        !nomesAtuais.includes(c.texto_original)
      );
      
      if (candidatosOrfaos.length > 0) {
        const idsOrfaos = candidatosOrfaos.map(c => c.id);
        await supabase
          .from('produtos_candidatos_normalizacao')
          .delete()
          .in('id', idsOrfaos);
        console.log(`🗑️ ${candidatosOrfaos.length} candidatos órfãos removidos`);
      }
    }
    
    // 🔗 FASE 2.5: VINCULAR PRODUTOS SEM MASTER A CANDIDATOS EXISTENTES
    // Para produtos que não encontraram master, buscar se já existe candidato de normalização
    console.log('🔗 Buscando candidatos de normalização existentes para produtos sem master...');
    let candidatosVinculados = 0;
    
    for (const produto of produtosEstoque) {
      // Só processar produtos sem master
      if (!produto.produto_master_id) {
        try {
          // Buscar candidato existente para esta nota + produto
          const { data: candidatos, error } = await supabase
            .from('produtos_candidatos_normalizacao')
            .select('id, status')
            .eq('nota_imagem_id', finalNotaId)
            .eq('texto_original', produto.produto_nome)
            .limit(1);
          
          if (!error && candidatos && candidatos.length > 0) {
            const candidato = candidatos[0];
            // Vincular ao candidato (será usado na inserção)
            produto.produto_candidato_id = candidato.id;
            candidatosVinculados++;
            console.log(`✅ Produto "${produto.produto_nome}" vinculado ao candidato ${candidato.id} (status: ${candidato.status})`);
          }
        } catch (err) {
          console.error(`⚠️ Erro ao buscar candidato para "${produto.produto_nome}":`, err);
          // Não falhar, apenas logar
        }
      }
    }
    
    if (candidatosVinculados > 0) {
      console.log(`🔗 ${candidatosVinculados} produtos vinculados a candidatos existentes`);
    }

    // ============================================================
    // 🛡️ FASE 2.55: BLINDAGEM CONTRA CRIAÇÃO DE MASTERS DUPLICADOS
    // ------------------------------------------------------------
    // Antes de criar um novo candidato (que eventualmente pode virar
    // um master novo), tentamos um último reuso por IRMÃO ESTRITO:
    // mesma MARCA + mesmo NOME_BASE + mesma QTD_VALOR + mesma UNIDADE_BASE,
    // com tokens de variante coincidentes.
    //
    // Tolerância: TOKENS_DESCRITIVOS_REDUNDANTES (lista MÍNIMA, conservadora)
    // contém termos descritivos não-discriminantes que NÃO devem quebrar o
    // reuso quando aparecem em só um dos lados (ex.: "SÊMOLA" em macarrão,
    // "TRADICIONAL", "COMUM"). Esta lista NÃO inclui tokens de variante real
    // (ZERO, DIET, FETUCCINE, etc.). Só ampliar após validação manual de
    // pares concretos no relatório de Masters Órfãos.
    //
    // Auditoria: quando o pré-check NÃO reusa mas existe um candidato
    // similar com score 0.80–0.95 (zona cinzenta), registra em
    // normalizacoes_log para revisão posterior.
    // ============================================================
    const TOKENS_DESCRITIVOS_REDUNDANTES = new Set([
      // Tokens descritivos puramente redundantes — NÃO discriminam variantes.
      // Mantenha esta lista MÍNIMA. Só adicione após validação manual.
      'SEMOLA',       // "macarrão de sêmola" vs "macarrão" = mesmo produto
      'TRADICIONAL',  // sufixo descritivo padrão
      'COMUM',        // "arroz comum" vs "arroz" = mesmo produto
      'ORIGINAL',     // sufixo descritivo padrão
    ]);

    const _normalizarBlindagem = (s: string): string =>
      (s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

    const _tokensVarianteFortes = (s: string): Set<string> => {
      // Reaproveita o mesmo set TOKENS_VARIANTE usado no fallback de comparação.
      // Como esta função é local, redefinimos o set aqui para evitar dependências.
      const VAR = new Set([
        'ZERO','DIET','LIGHT','INTEGRAL','DESNATADO','SEMIDESNATADO','INTEGRA',
        'ORGANICO','ORGANICA','MULTIUSO','BACTERICIDA','NEUTRO','NEUTRA',
        'AMACIANTE','CONCENTRADO','COCA','GUARANA','UVA','LARANJA','LIMAO',
        'MORANGO','CHOCOLATE','BAUNILHA','COCO','AMENDOIM','MENTA','PERU',
        'FRANGO','BOVINO','SUINO','PEIXE','ACO','INOX','PLASTICO','VIDRO',
        'ROSE','ROSA','BRANCO','TINTO','CALABRESA','PORTUGUESA','MUSSARELA',
        'MARGUERITA','PARBOILIZADO','AGULHINHA','ARBORIO','EXTRAFORTE',
      ]);
      const out = new Set<string>();
      for (const t of _normalizarBlindagem(s).split(' ')) if (VAR.has(t)) out.add(t);
      return out;
    };

    const _setsIguais = <T,>(a: Set<T>, b: Set<T>): boolean => {
      if (a.size !== b.size) return false;
      for (const v of a) if (!b.has(v)) return false;
      return true;
    };

    let masterReusadoBlindagem = 0;
    for (const produto of produtosEstoque) {
      if (produto.produto_master_id || produto.produto_candidato_id) continue;
      // Só roda se temos pistas suficientes
      const marca = (produto.marca || '').toString().trim();
      const nomeBase = (produto.nome_base || '').toString().trim();
      const qtd = produto.qtd_valor;
      const un = (produto.unidade_base || '').toString().trim();
      if (!marca || !nomeBase) continue;

      try {
        let q = supabase
          .from('produtos_master_global')
          .select('id, sku_global, nome_padrao, nome_base, marca, qtd_valor, unidade_base, codigo_barras, categoria, imagem_url')
          .eq('status', 'ativo')
          .ilike('marca', marca)
          .ilike('nome_base', nomeBase);
        if (qtd != null) q = q.eq('qtd_valor', qtd);
        if (un) q = q.eq('unidade_base', un);

        const { data: candidatosMaster } = await q.limit(20);
        if (!candidatosMaster || candidatosMaster.length === 0) continue;

        // Tokens de variante do produto da nota (usa nome do produto)
        const varProduto = _tokensVarianteFortes(produto.produto_nome || '');

        // Filtro estrito: variantes idênticas + EAN compatível (se ambos têm)
        let melhor: any = null;
        let melhorScore = 0;
        for (const m of candidatosMaster) {
          const varMaster = _tokensVarianteFortes(m.nome_padrao || '');
          if (!_setsIguais(varProduto, varMaster)) continue;
          if (produto.ean_comercial && m.codigo_barras &&
              canonicalEAN(produto.ean_comercial) !== canonicalEAN(m.codigo_barras)) continue;

          // Score por overlap de tokens não-descritivos
          const tokA = new Set(_normalizarBlindagem(produto.produto_nome || '').split(' ')
            .filter(t => t.length > 2 && !TOKENS_DESCRITIVOS_REDUNDANTES.has(t)));
          const tokB = new Set(_normalizarBlindagem(m.nome_padrao || '').split(' ')
            .filter(t => t.length > 2 && !TOKENS_DESCRITIVOS_REDUNDANTES.has(t)));
          let inter = 0;
          for (const t of tokA) if (tokB.has(t)) inter++;
          const denom = Math.max(tokA.size, tokB.size, 1);
          const score = inter / denom;

          if (score > melhorScore) { melhorScore = score; melhor = m; }
        }

        // Aceita reuso só com score alto (≥ 0.7) — conservador
        if (melhor && melhorScore >= 0.7) {
          produto.produto_master_id = melhor.id;
          produto.sku_global = melhor.sku_global;
          produto.produto_nome = melhor.nome_padrao;
          produto.marca = melhor.marca;
          produto.categoria = (melhor.categoria || produto.categoria || '').toString().toLowerCase();
          produto.produto_nome_normalizado = melhor.nome_padrao;
          produto.nome_base = melhor.nome_base;
          produto.imagem_url = melhor.imagem_url;
          masterReusadoBlindagem++;
          masterEncontrados++;
          masterNaoEncontrados = Math.max(0, masterNaoEncontrados - 1);
          console.log(`🛡️ [BLINDAGEM] Reuso de master existente: "${produto.produto_nome}" → ${melhor.id} (score=${melhorScore.toFixed(2)})`);
        } else if (melhor && melhorScore >= 0.4 && melhorScore < 0.7) {
          // Zona cinzenta: registra para auditoria, NÃO reusa
          try {
            await supabase.from('normalizacoes_log').insert({
              acao: 'master_criado_zona_cinzenta',
              texto_origem: produto.produto_nome,
              produto_id: melhor.id,
              score_agregado: melhorScore,
              metadata: {
                candidato_master_id: melhor.id,
                candidato_nome: melhor.nome_padrao,
                marca: marca,
                nome_base: nomeBase,
                qtd_valor: qtd,
                unidade_base: un,
              },
            });
          } catch (logErr) {
            console.warn('⚠️ [BLINDAGEM] falha ao logar zona cinzenta:', logErr);
          }
        }
      } catch (errBlind) {
        console.warn(`⚠️ [BLINDAGEM] falha no pré-check para "${produto.produto_nome}":`, errBlind);
      }
    }
    if (masterReusadoBlindagem > 0) {
      console.log(`🛡️ [BLINDAGEM] ${masterReusadoBlindagem} produtos reusaram master existente (evitou candidato novo)`);
    }

    // 🆕 FASE 2.6: CRIAR CANDIDATOS PARA PRODUTOS SEM MASTER E SEM CANDIDATO
    // Para produtos sem master e sem candidato existente, criar novo candidato
    console.log('🤖 Criando candidatos de normalização para produtos sem master...');
    let candidatosCriados = 0;

    
    for (const produto of produtosEstoque) {
      // Só processar produtos sem master E sem candidato vinculado
      if (!produto.produto_master_id && !produto.produto_candidato_id) {
        try {
          console.log(`📝 Criando candidato para: ${produto.produto_nome}`);
          
          // ✅ CORREÇÃO 3: Padronizar hash para garantir match com processar-normalizacao-global
          const hashPadronizado = `${finalNotaId}_${produto.produto_nome.trim().toUpperCase()}`;
          
          // Criar candidato de normalização
          const { data: candidato, error: candidatoError } = await supabase
            .from('produtos_candidatos_normalizacao')
            .insert({
              texto_original: produto.produto_nome,
              usuario_id: nota.usuario_id,
              nota_imagem_id: finalNotaId,
              nota_item_hash: hashPadronizado, // ✅ Hash padronizado
              status: 'pendente',
              confianca_ia: 0, // Será preenchido por processar-normalizacao-global
              categoria_sugerida: produto.categoria,
              marca_sugerida: produto.marca || null,
              nome_base_sugerido: produto.nome_base || produto.produto_nome
            })
            .select()
            .single();
          
          if (candidatoError) {
            console.error(`⚠️ Erro ao criar candidato para "${produto.produto_nome}":`, candidatoError.message);
            // Continuar processamento mesmo com erro (produto fica sem candidato temporariamente)
          } else if (candidato) {
            // Vincular o candidato ao produto
            produto.produto_candidato_id = candidato.id;
            candidatosCriados++;
            console.log(`✅ Candidato criado: ${candidato.id} para "${produto.produto_nome}"`);
          }
        } catch (err: any) {
          console.error(`❌ Exceção ao criar candidato para "${produto.produto_nome}":`, err.message);
          // Continuar processamento
        }
      }
    }
    
    console.log(`📊 Criação de candidatos concluída: ${candidatosCriados} novos candidatos`);
    
    if (candidatosCriados > 0) {
      console.log(`🎯 Total de produtos sem master: ${masterNaoEncontrados}`);
      console.log(`   - ${candidatosVinculados} vinculados a candidatos existentes`);
      console.log(`   - ${candidatosCriados} novos candidatos criados`);
      console.log(`   - ${masterNaoEncontrados - candidatosVinculados - candidatosCriados} sem candidato (erros)`);
    }
    
    // 🚨 DEBUG CRÍTICO: Verificar se os produtos problemáticos estão na lista
    const produtosProblematicos = ['GELATINA', 'SUCO', 'BANANA', 'MAMAO', 'MACA'];
    
    console.log('🔍 [AUDITORIA] Produtos consolidados antes da inserção:');
    produtosProblematicos.forEach(produtoTeste => {
      const encontrados = produtosEstoque.filter(p => p.produto_nome.toUpperCase().includes(produtoTeste));
      if (encontrados.length > 0) {
        console.log(`✅ [AUDITORIA] "${produtoTeste}": ${encontrados.length} ocorrência(s)`);
        encontrados.forEach((p, idx) => {
          console.log(`   [${idx + 1}] ${p.produto_nome} | Cat: ${p.categoria} | Qtd: ${p.quantidade} | R$ ${p.preco_unitario_ultimo.toFixed(2)}`);
        });
      } else {
        console.log(`⚠️ [AUDITORIA] "${produtoTeste}": NÃO ENCONTRADO`);
      }
    });
    
    // 🔒 CORREÇÃO #2.7: Adicionar índice sequencial único para detectar duplicatas
    const hashesInseridos = new Set<string>();
    const produtosDuplicados: string[] = [];
    
    produtosEstoque.forEach((produto, index) => {
      const hashProduto = `${produto.produto_nome}_${produto.quantidade}_${produto.preco_unitario_ultimo.toFixed(2)}`;
      
      if (hashesInseridos.has(hashProduto)) {
        produtosDuplicados.push(`[${index}] ${produto.produto_nome} (hash: ${hashProduto})`);
      } else {
        hashesInseridos.add(hashProduto);
      }
    });
    
    if (produtosDuplicados.length > 0) {
      console.error(`🚨 [AUDITORIA] DUPLICATAS DETECTADAS ANTES DA INSERÇÃO (${produtosDuplicados.length}):`);
      produtosDuplicados.forEach(dup => console.error(`   - ${dup}`));
    } else {
      console.log(`✅ [AUDITORIA] Nenhuma duplicata detectada antes da inserção`);
    }
    
    // Mostrar todos os produtos que vão ser inseridos
    console.log('📋 Lista completa para inserção:');
    produtosEstoque.forEach((produto, index) => {
      console.log(`${index + 1}. ${produto.produto_nome} | Cat: ${produto.categoria} | Qtd: ${produto.quantidade} | Preço: ${produto.preco_unitario_ultimo}`);
    });

    // Inserir no estoque com batch processing para alto volume
    if (produtosEstoque.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "Nenhum produto válido para inserir" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Para alto volume: processar em lotes de 50 itens por vez
    const BATCH_SIZE = 50;
    let totalInserted = 0;
    const allInserted: any[] = [];
    
    console.log(`📦 [DEBUG] Iniciando inserção em ${Math.ceil(produtosEstoque.length/BATCH_SIZE)} lotes...`);

    // 🛡️ FRENTE B2: sanitização defensiva — nenhum item pode ter preço negativo,
    // que violaria o constraint check_preco_positivo e abortaria a nota inteira.
    // Itens com preço inválido recebem 0 e são logados (não bloqueiam o restante).
    let itensSanitizadosB2 = 0;
    for (const p of produtosEstoque) {
      const preco = Number(p.preco_unitario_ultimo);
      if (!Number.isFinite(preco) || preco < 0) {
        console.warn(`⚠️ [B2] Preço inválido para "${p.produto_nome}" (R$ ${p.preco_unitario_ultimo}). Ajustado para 0.`);
        p.preco_unitario_ultimo = 0;
        if (p.preco_por_unidade_base != null) p.preco_por_unidade_base = 0;
        itensSanitizadosB2++;
      }
    }
    if (itensSanitizadosB2 > 0) {
      console.warn(`🛡️ [B2] ${itensSanitizadosB2} item(ns) tiveram preço sanitizado para 0 antes do INSERT.`);
    }

    for (let i = 0; i < produtosEstoque.length; i += BATCH_SIZE) {
      const batch = produtosEstoque.slice(i, i + BATCH_SIZE);
      const loteNumero = Math.floor(i/BATCH_SIZE) + 1;
      const totalLotes = Math.ceil(produtosEstoque.length/BATCH_SIZE);

      console.log(`📦 [LOTE ${loteNumero}/${totalLotes}] Inserindo ${batch.length} itens (${new Date().toISOString().split('T')[1].split('.')[0]})...`);
      console.log(`   Produtos: ${batch.map(p => p.produto_nome).join(', ')}`);

      const { data: batchInserted, error: batchError } = await supabase
        .from("estoque_app")
        .insert(batch)
        .select();
      
      if (batchError) {
        console.error(`❌ [LOTE ${loteNumero}/${totalLotes}] Erro:`, batchError);
        throw new Error(`Erro ao inserir lote: ${batchError.message}`);
      }
      
      if (batchInserted) {
        allInserted.push(...batchInserted);
        totalInserted += batchInserted.length;
        console.log(`✅ [LOTE ${loteNumero}/${totalLotes}] ${batchInserted.length} itens inseridos com sucesso (${new Date().toISOString().split('T')[1].split('.')[0]})`);
      }
    }
    
    const inserted = allInserted;

    console.log(`✅ [DEBUG] INSERÇÃO COMPLETA: ${totalInserted} itens inseridos em ${Math.ceil(produtosEstoque.length/BATCH_SIZE)} lotes`);
    console.log(`📋 [DEBUG] Produtos inseridos:`, inserted.map(p => p.produto_nome));
    
    // 🚨 [AUDITORIA FINAL] Verificar duplicatas pós-inserção
    const hashesInseridosPos = new Map<string, number>();
    inserted.forEach((produto) => {
      const hashProduto = `${produto.produto_nome}_${produto.quantidade}_${produto.preco_unitario_ultimo.toFixed(2)}`;
      const count = hashesInseridosPos.get(hashProduto) || 0;
      hashesInseridosPos.set(hashProduto, count + 1);
    });
    
    const duplicatasPos = Array.from(hashesInseridosPos.entries()).filter(([hash, count]) => count > 1);
    if (duplicatasPos.length > 0) {
      console.error(`🚨 [AUDITORIA FINAL] DUPLICATAS DETECTADAS PÓS-INSERÇÃO (${duplicatasPos.length}):`);
      duplicatasPos.forEach(([hash, count]) => {
        console.error(`   - ${hash}: ${count}x`);
      });
    } else {
      console.log(`✅ [AUDITORIA FINAL] Nenhuma duplicata detectada pós-inserção`);
    }
    
    // 🚨 CORREÇÃO #3: VALIDAÇÃO CRÍTICA com auto-correção - NÃO marcar como processada se houver discrepância
    const itensEsperados = produtosEstoque.length;
    const itensInseridos = totalInserted;
    
    if (itensInseridos !== itensEsperados) {
      console.error(`🚨 INCONSISTÊNCIA CRÍTICA: Esperado ${itensEsperados} itens, inserido ${itensInseridos}`);
      console.error('🚨 Produtos que deveriam ser inseridos:', produtosEstoque.map(p => p.produto_nome));
      console.error('🚨 Produtos efetivamente inseridos:', inserted.map(p => p.produto_nome));
      
      // ✅ NÃO MARCAR COMO PROCESSADA - Permitir reprocessamento automático
      await supabase
        .from('notas_imagens')
        .update({ 
          processing_started_at: null, // Liberar lock
          debug_texto: `Inserção parcial: ${itensInseridos}/${itensEsperados} itens. Reprocessamento necessário.`
        })
        .eq('id', finalNotaId);
      
      console.log('🔓 Lock liberado devido a inserção parcial. Nota disponível para reprocessamento.');
      
      return new Response(
        JSON.stringify({
          success: false,
          error: `Inserção incompleta: ${itensInseridos}/${itensEsperados} itens`,
          nota_id: finalNotaId,
          requires_reprocessing: true
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      console.log('✅ Validação OK: Todos os itens foram inseridos corretamente');
    }

    // Marcar nota como processada e liberar lock
    const { error: updateError } = await supabase
      .from("notas_imagens")
      .update({ 
        processada: true, 
        processing_started_at: null, // ✅ Liberar lock
        updated_at: nowIso() 
      })
      .eq("id", finalNotaId);
    
    if (updateError) {
      console.error("⚠️ Erro ao marcar nota como processada:", updateError);
      // Não falhar por isso, pois o estoque já foi inserido
    }
    
    console.log(`🔓 Lock de processamento liberado para nota ${finalNotaId}`);

    // 🤖 DISPARAR NORMALIZAÇÃO AUTOMÁTICA EM BACKGROUND
    console.log('🤖 Disparando normalização automática em background...');
    supabase.functions.invoke('processar-normalizacao-global', {
      body: { 
        nota_id: finalNotaId,
        auto_trigger: true 
      }
    }).then(({ data, error }) => {
      if (error) {
        console.error('⚠️ Erro ao disparar normalização automática:', error);
      } else {
        console.log('✅ Normalização automática disparada com sucesso:', data);
      }
    }).catch(err => {
      console.error('⚠️ Falha ao invocar normalização:', err);
    });

    const totalFinanceiro = inserted.reduce((acc: number, it: any) => acc + it.quantidade * it.preco_unitario_ultimo, 0);

    return new Response(
      JSON.stringify({
        success: true,
        nota_id: finalNotaId,
        itens_inseridos: inserted.length,
        produtos_recategorizados: produtosRecategorizados,
        total_financeiro: totalFinanceiro.toFixed(2),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("❌ Erro crítico:", error?.message || error);
    return new Response(JSON.stringify({ success: false, error: error?.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
