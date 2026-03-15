

# Plano: Listagem Global de Estabelecimentos Pendentes para Masters

## Situação Atual

A tela `NormalizacoesEstabelecimentos.tsx` lista apenas as **regras de normalização já criadas** da tabela `normalizacoes_estabelecimentos`. Ela **não mostra** os estabelecimentos brutos vindos das notas fiscais que ainda precisam ser normalizados.

A tabela `notas_imagens` tem RLS restrita a `usuario_id = auth.uid()`, impedindo ver dados de outros usuários mesmo sendo master.

## O Que Será Feito

### 1. Migration: Função SECURITY DEFINER

Criar `listar_estabelecimentos_pendentes()` que:
- Extrai estabelecimentos distintos (nome + CNPJ) de `notas_imagens.dados_extraidos` de **todos os usuários** (bypass RLS via SECURITY DEFINER)
- Por padrão, exclui estabelecimentos que já possuem regra ativa em `normalizacoes_estabelecimentos` (match por CNPJ ou nome)
- Aceita parâmetro `incluir_normalizados` para busca retornar todos
- Aceita parâmetro `termo_busca` para filtrar por nome ou CNPJ
- Retorna: nome, CNPJ, contagem de notas

### 2. Alteração no frontend (`NormalizacoesEstabelecimentos.tsx`)

**Listagem padrão (ao abrir):**
- Nova seção "Estabelecimentos Pendentes de Normalização" acima da lista de regras existentes
- Chama a função para obter estabelecimentos pendentes
- Mostra cada um com nome + CNPJ + quantidade de notas
- Botão "Normalizar" que abre o formulário existente pré-preenchido com nome_original e cnpj_original

**Busca:**
- Quando o campo de busca tem texto, busca também com `incluir_normalizados = true` + `termo_busca`
- Permite encontrar e criar/editar normalizações para qualquer estabelecimento

**Regras existentes:**
- Continuam listadas abaixo dos pendentes
- CRUD intacto

### Arquivos Modificados

| Arquivo | Alteração |
|---|---|
| Migration SQL (nova) | Função `listar_estabelecimentos_pendentes()` |
| `NormalizacoesEstabelecimentos.tsx` | Novo estado + chamada à função + seção de pendentes + pré-preenchimento do form |

### Garantias

- Nenhuma tabela alterada
- RLS de `notas_imagens` inalterada
- CRUD de normalizações intacto
- Edge functions inalteradas

