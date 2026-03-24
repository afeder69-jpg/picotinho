

## Conversao de embalagem para unidade base — Fase 1 (IMPLEMENTADO)

### O que foi feito

1. **Tabela `regras_conversao_embalagem`** criada com RLS restrita a `service_role`
   - 16 regras: C/30, C/20, C/12, C/6, dúzia, meia dúzia + CARTELA, BANDEJA, NN UN
   - Padrões de exclusão para evitar falsos positivos (MASSA, MACARRAO, PASCOA, CHOCOLATE)
   - Suporte a EAN pattern para matching futuro por código de barras

2. **Bug fix crítico**: `process-receipt-full` agora multiplica `item.quantidade × embalagemInfo.quantity`
   - Antes: compra de 3 bandejas de 20 ovos → 20 ovos (errado)
   - Depois: 3 × 20 = 60 ovos, preço = valorTotal / 60 (correto)

3. **Dados históricos corrigidos**: 2 registros no estoque_app atualizados
   - Megabox: preço corrigido de R$18.60 → R$0.62/un
   - Assaí: qty corrigida de 20 → 60, preço de R$2.20 → R$0.73/un

4. **Prioridade EAN > Nome**: Duas passadas — primeiro testa EAN, depois nome
5. **Rastreabilidade**: Campos `tipo_embalagem`, `qtd_valor`, `qtd_base`, `unidade_base`, `preco_por_unidade_base` preenchidos
6. **Sem conversão em caso de dúvida**: Se nenhuma regra bater, comportamento normal inalterado
