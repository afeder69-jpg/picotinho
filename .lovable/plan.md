

## Plano: Corrigir leitura do EAN via RPC segura

### Diagnóstico confirmado
- Produto "Multiuso Cremoso Original Cif 250ml" tem EAN `7891150022010` no `estoque_app`, vinculado ao `produto_candidato_id: 98460d69-...`
- A query direta falha porque o RLS do `estoque_app` restringe SELECT a `auth.uid() = user_id`
- Função `has_role` existe e já valida `revogado_em IS NULL`

### Alterações

**1. Migration SQL — criar função `buscar_ean_por_candidato`**

```sql
CREATE OR REPLACE FUNCTION public.buscar_ean_por_candidato(p_candidato_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'master') THEN
    RETURN NULL;
  END IF;
  RETURN (
    SELECT ean_comercial FROM estoque_app
    WHERE produto_candidato_id = p_candidato_id
      AND ean_comercial IS NOT NULL
    LIMIT 1
  );
END;
$$;
```

Segurança: apenas usuários com role `master` (não revogado) conseguem executar. Qualquer outro recebe `NULL`.

**2. `NormalizacaoGlobal.tsx` (linhas 872-886)** — trocar query direta por RPC

```typescript
const { data: ean } = await supabase
  .rpc('buscar_ean_por_candidato', { p_candidato_id: candidato.id });
if (ean) {
  setEditForm(prev => ({ ...prev, codigo_barras: ean }));
}
```

### O que NÃO muda
- Leitura do EAN para produtos master (já funciona direto)
- Salvamento do EAN na aprovação e edição
- Nenhuma outra funcionalidade

