

## Plano: Ação manual assistida na aba "Sem match"

### Resumo

Adicionar botão "Vincular manualmente" em cada item da aba Sem match, com confirmação individual via AlertDialog, usando uma nova ação `absorver_manual` na Edge Function existente que registra a decisão como manual e cria sinônimo com fonte diferenciada.

### O que muda

**1. Edge Function `detectar-pendentes-absorviveis` — nova ação `absorver_manual`**

Recebe: `{ acao: 'absorver_manual', candidato_id, master_id }`

Executa (item único, nunca lote):
- Trava 1: candidato ainda `pendente`
- Trava 2: master ainda `ativo`
- Atualiza candidato → `status: 'manual_aprovado'`, `sugestao_produto_master: master_id`
- Cria sinônimo com `fonte: 'decisao_manual'`, `confianca: 0.9`
- Log em `normalizacao_decisoes_log` com `decisao: 'vinculo_manual'` e `sugestao_ia: { motivo: 'Decisão manual do usuário', bloqueios_ignorados: [...] }`
- Retorna sucesso ou erro com motivo

**2. UI na aba Sem match (`NormalizacaoGlobal.tsx`)**

Em cada item que tenha `master_id` e `master_nome_padrao`:
- Botão pequeno "Vincular" (ícone link)
- Ao clicar, abre AlertDialog de confirmação mostrando:
  - Texto original do pendente
  - Nome do master destino
  - Bloqueios que foram ignorados
  - Texto: "Esta é uma decisão manual. O sistema registrará que você aprovou este vínculo ignorando os bloqueios automáticos."
- Ao confirmar, chama a Edge Function com `acao: 'absorver_manual'`
- Sucesso: remove o item da lista localmente, mostra toast
- Erro: mostra toast com motivo

**3. Estado local**
- `vinculandoManual: string | null` — ID do candidato em processo
- `confirmacaoManual: { candidato_id, texto_original, master_id, master_nome, bloqueios } | null` — dados para o AlertDialog

### O que NAO muda

- Regras automáticas de inequívocos e sugestões
- Ação `absorver` existente (lote)
- RPC SQL
- Nenhuma tabela nova, nenhum trigger novo

### Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `supabase/functions/detectar-pendentes-absorviveis/index.ts` | Nova branch `acao === 'absorver_manual'` (~40 linhas) |
| `src/pages/admin/NormalizacaoGlobal.tsx` | Botão + AlertDialog + handler na aba sem_match |

### Diferenciação no log e sinônimo

| Campo | Absorção automática | Vínculo manual |
|---|---|---|
| `decisao` | `absorcao_pendente` | `vinculo_manual` |
| `fonte` (sinônimo) | `absorcao_pendente` | `decisao_manual` |
| `confianca` (sinônimo) | `1.0` | `0.9` |
| `motivo` no log | Camada + score | "Decisão manual" + bloqueios ignorados |

