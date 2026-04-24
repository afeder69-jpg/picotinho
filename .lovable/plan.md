

# Diagnóstico: bolinha vermelha indevida no Suco Goiaba Bela Ischia

## O que aconteceu na prática

O produto **SUCO GOIABA BELA ISCHIA CONCENTRADO 1L** existe no master desde 22/03 e tem 3 entradas no estoque do usuário, todas vinculadas corretamente ao master via EAN `7898063761739`:

| Nota emitida em | Estabelecimento | Preço |
|---|---|---|
| 22/04/2026 (ontem) | SUPERMARKET A.VASCONCELOS CG | R$ 11,43 |
| 08/04/2026 | SUPERMARKET A.VASCONCELOS CG | R$ 11,43 |
| 20/03/2026 | SUPERMARKET A.VASCONCELOS CG | R$ 11,43 |

Mas em `precos_atuais` há **apenas 1 registro** para o A.VASCONCELOS desse produto, com `data_atualizacao = 08/04/2026`. Hoje é 24/04 → diff = 16 dias → **bolinha vermelha** (a regra é >10 dias = vermelho, conforme `src/lib/recencia.ts`).

A nota de **22/04** não atualizou `precos_atuais.data_atualizacao` para a data dela, mesmo o item tendo entrado no estoque corretamente. Por isso a "data" exibida pela bolinha ficou congelada em 08/04.

## Causa raiz

Quando uma nota nova chega com **mesmo CNPJ + mesmo produto + mesmo preço** que já existe em `precos_atuais`, a edge function que atualiza `precos_atuais` faz `UPDATE` apenas se o **valor mudou**. Como o preço continuou R$ 11,43 (igual), o registro não foi tocado e a `data_atualizacao` permaneceu na data da nota anterior (08/04).

A consequência é exatamente o que você viu: o sistema mostra "preço de 16 dias atrás" para um produto que foi comprado ontem ao mesmo preço.

Isso é regra geral, não específica do Bela Ischia. Qualquer produto cujo preço se mantém estável entre notas vai acumular dias de "antiguidade" indevida na bolinha de recência.

## O que precisa ser corrigido

Atualizar `precos_atuais.data_atualizacao` **sempre** que uma nota nova confirma o mesmo CNPJ+produto+preço, mesmo que o valor não tenha mudado. A "data de atualização" deve refletir **a data da última nota que viu aquele preço**, não a data em que o preço mudou pela última vez.

## Plano de correção (mínimo e cirúrgico)

### Passo 1 — Identificar o ponto exato no pipeline
Verificar nas edge functions que escrevem em `precos_atuais` (provavelmente `process-receipt-full`, `update-precos-atuais` e/ou `recalcular-precos-notas`) o trecho de upsert. Hoje a lógica condicional ignora updates quando preço é igual.

### Passo 2 — Ajuste pontual da regra de upsert
Mudar a condição para:
- Se já existe registro para `(produto_master_id OR produto_nome) + estabelecimento_cnpj + user_id`:
  - Se a `data_atualizacao` da nota nova for **mais recente** que a registrada → atualizar `data_atualizacao` (e valor, se diferente).
  - Se for igual ou anterior → não tocar.
- Se não existe → inserir normal.

Sem mudar a chave de unicidade, sem mudar o `valor_unitario` quando ele realmente é o mesmo, sem alterar a lógica de "menor preço da área".

### Passo 3 — Backfill único para os registros já existentes
Uma query master-only que atualiza `precos_atuais.data_atualizacao` para a maior data de nota confirmada que casa com aquele `(cnpj + produto_master_id)` ou `(cnpj + produto_nome)`. Conservador: nunca decrementa data, só adianta para a data real mais recente.

### Passo 4 — Validação no caso Bela Ischia
Após o passo 3, o registro do A.VASCONCELOS deve passar a mostrar `data_atualizacao = 22/04`, e a bolinha do produto na sua lista deve voltar para verde (2 dias).

## O que NÃO será mexido

- Lógica de comparação de preços por mercado.
- Cálculo de "menor preço na área".
- Regra de cores da bolinha (`src/lib/recencia.ts`).
- Lógica de matching por EAN ou de normalização (já corrigida nas fases anteriores).
- Estrutura da tabela `precos_atuais`.

## Validação final esperada

- Bela Ischia volta para bolinha verde imediatamente após backfill.
- Próxima nota com preço repetido atualiza `data_atualizacao` corretamente.
- Nenhum preço é sobrescrito por dado mais antigo.
- Outros produtos que sofreriam do mesmo problema também são corrigidos pelo backfill.
- Sem regressão na comparação de mercados nem na lista de compras.

Aprova esse plano para eu aplicar?

