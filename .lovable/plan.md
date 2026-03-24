

## Conversao de embalagem para unidade base — Fase 1 (IMPLEMENTADO)

### O que foi feito

1. **Tabela `regras_conversao_embalagem`** criada com RLS restrita a `service_role`
   - 6 regras iniciais: ovos C/30, C/20, C/12, C/6, dúzia, meia dúzia
   - Padrões de exclusão para evitar falsos positivos (MASSA, MACARRAO, PASCOA, CHOCOLATE)
   - Suporte a EAN pattern para matching futuro por código de barras

2. **Lógica de detecção refatorada** em 5 edge functions:
   - `process-receipt-full` — detecção + campos de rastreabilidade no estoque
   - `backfill-precos-usuario` — detecção para recálculo de preços
   - `preco-atual-usuario` — detecção para preços por área
   - `calcular-custo-receita` — detecção para custo de receitas
   - `processar-normalizacao-global` — detecção para normalização

3. **Prioridade EAN > Nome**: Duas passadas — primeiro testa EAN, depois nome
4. **Rastreabilidade**: Campos `tipo_embalagem`, `qtd_valor`, `qtd_base`, `unidade_base`, `preco_por_unidade_base` preenchidos na inserção do estoque
5. **Sem conversão em caso de dúvida**: Se nenhuma regra bater, comportamento normal inalterado
