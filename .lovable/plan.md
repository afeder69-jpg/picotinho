

## 🔧 Plano: Correção da Extração de URL e Chave de Acesso

### 📋 Problema Identificado

Quando o usuário tira foto da URL impressa, o OCR (OpenAI Vision) está extraindo a URL com **caracteres corrompidos**:

**URL extraída com problemas:**
```
https://consultadfe.fazenda.rj.gov.br/nfce/consulta?chave=3326%201039%204680%1437%6501%9000%1962%5411%9036%5111
```

**Problemas encontrados:**
- Espaços (`%20`) inseridos incorretamente
- Caracteres de controle (`%14`) corrompendo a chave
- Parâmetro `chave=` não reconhecido pelo sistema (esperava `p=` ou `chNFe=`)
- Chave fragmentada impede extração dos 44 dígitos

---

### 🎯 Solução em 3 Partes

#### Parte 1: Melhorar Limpeza da URL na Edge Function

Adicionar lógica para limpar URLs com caracteres incorretos antes de retornar.

**Arquivo:** `supabase/functions/extract-url-from-photo/index.ts`

**Mudanças:**
- Remover espaços da URL
- Remover caracteres de controle (%00-%1F)
- Normalizar encoding de caracteres
- Tentar reconstruir chave de 44 dígitos fragmentada

```text
Antes de retornar a URL:
1. Decodificar URL encoding
2. Remover todos os caracteres não-URL válidos
3. Re-codificar se necessário
4. Verificar se URL ainda é válida
```

#### Parte 2: Adicionar Suporte ao Parâmetro `chave=`

A função `extrairChaveNFe` atualmente só reconhece os parâmetros `p=` e `chNFe=`, mas a URL do Guanabara usa `chave=`.

**Arquivo:** `src/lib/documentDetection.ts`

**Mudanças:**
- Adicionar `chave` à lista de parâmetros reconhecidos
- Adicionar limpeza de caracteres antes da extração

#### Parte 3: Melhorar Mensagens de Erro

As mensagens de erro atuais são confusas. Precisamos diferenciar:
- "URL não encontrada na imagem"
- "URL encontrada mas chave de acesso inválida"

**Arquivos:** 
- `src/components/QRCodeScannerWeb.tsx`
- `src/components/QRCodeScanner.tsx`
- `src/components/BottomNavigation.tsx`

---

### 📁 Arquivos a Modificar

| Arquivo | Tipo | Mudança |
|---------|------|---------|
| `supabase/functions/extract-url-from-photo/index.ts` | Modificar | Adicionar limpeza de URL após extração |
| `src/lib/documentDetection.ts` | Modificar | Adicionar parâmetro `chave=` e limpeza |
| `src/components/BottomNavigation.tsx` | Modificar | Melhorar mensagem de erro |

---

### 📐 Detalhes Técnicos

#### Nova Lógica de Limpeza de URL

```text
function limparUrlExtraida(url: string): string {
  1. Decodificar URL completamente
  2. Remover caracteres de controle (ASCII 0-31)
  3. Remover espaços extras
  4. Se contém parâmetro chave/p/chNFe:
     - Extrair valor
     - Manter apenas dígitos
     - Se tiver 44 dígitos, reconstruir URL limpa
  5. Re-codificar apenas caracteres especiais válidos
  return urlLimpa;
}
```

#### Nova Lógica de Extração de Chave

```text
function extrairChaveNFe(url: string): string | null {
  1. Decodificar URL
  2. Tentar parâmetros: p, chNFe, chave (NOVO!)
  3. Limpar valor do parâmetro (apenas dígitos)
  4. Se 44 dígitos → retornar
  5. Fallback: regex /(\d{44})/ na URL inteira
  6. Fallback 2: extrair TODOS os dígitos da URL
     - Se tiver exatamente 44 dígitos totais → retornar
  return null se nada funcionar
}
```

---

### ✅ Resultado Esperado

Após as correções:

1. **URL corrompida:** 
   ```
   https://...?chave=3326%201039%204680%1437...
   ```

2. **Após limpeza:**
   ```
   https://...?chave=33260139468014376501900019625411903651111
   ```

3. **Chave extraída com sucesso:** 
   ```
   33260139468014376501900019625411903651111 (44 dígitos)
   ```

4. **Nota processada normalmente**

---

### 🔍 Observação Importante

O problema original **não estava na extração da URL** (que funcionou), mas sim na **extração da chave de acesso** da URL malformada. A mensagem de erro que o usuário viu pode ter sido de uma tentativa anterior ou foi uma confusão de mensagens no fluxo.

Com estas correções, o sistema será muito mais robusto para lidar com:
- URLs com caracteres corrompidos pelo OCR
- Diferentes formatos de parâmetros (p, chNFe, chave)
- Chaves fragmentadas por espaços

