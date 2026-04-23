import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search, AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";

/**
 * Aba "Masters Órfãos de Preço" — relatório administrativo obrigatório.
 * Lista pares (master órfão ↔ master irmão com preço) detectados pela
 * edge function detectar-masters-precos-orfaos. Pares com bloqueios
 * aparecem somente leitura (variantes reais não podem ser fundidas).
 */
export function MastersOrfaosPrecos() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [pares, setPares] = useState<any[]>([]);
  const [seguros, setSeguros] = useState(0);
  const [bloqueados, setBloqueados] = useState(0);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [consolidando, setConsolidando] = useState(false);

  async function carregar() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('detectar-masters-precos-orfaos');
      if (error) throw error;
      setPares(data?.pares || []);
      setSeguros(data?.seguros || 0);
      setBloqueados(data?.bloqueados || 0);
      setSelecionados(new Set());
      toast({ title: "Diagnóstico concluído", description: `${data?.total || 0} pares encontrados` });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message || String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function chavePar(p: any) {
    return `${p.master_orfao.id}|${p.master_com_precos.id}`;
  }

  function toggleSelecionado(p: any) {
    if (p.bloqueios.length > 0) return; // bloqueados não podem ser selecionados
    const k = chavePar(p);
    const novo = new Set(selecionados);
    if (novo.has(k)) novo.delete(k); else novo.add(k);
    setSelecionados(novo);
  }

  async function consolidarPar(p: any) {
    if (p.bloqueios.length > 0) return;
    if (!confirm(`Consolidar?\n\nManter: ${p.master_com_precos.nome_padrao}\nRemover: ${p.master_orfao.nome_padrao}`)) return;
    await executarConsolidacoes([p]);
  }

  async function consolidarSelecionados() {
    const lista = pares.filter(p => selecionados.has(chavePar(p)) && p.bloqueios.length === 0);
    if (lista.length === 0) return;
    if (!confirm(`Confirmar consolidação de ${lista.length} pares?`)) return;
    await executarConsolidacoes(lista);
  }

  async function executarConsolidacoes(lista: any[]) {
    setConsolidando(true);
    try {
      const grupos = lista.map(p => ({
        manter_id: p.master_com_precos.id,
        remover_ids: [p.master_orfao.id],
      }));
      const { error } = await supabase.functions.invoke('consolidar-masters-manual', { body: { grupos } });
      if (error) throw error;
      toast({ title: "Consolidação concluída", description: `${lista.length} par(es) consolidado(s)` });
      await carregar();
    } catch (e: any) {
      toast({ title: "Erro na consolidação", description: e.message || String(e), variant: "destructive" });
    } finally {
      setConsolidando(false);
    }
  }

  async function marcarVarianteDistinta(p: any) {
    if (!confirm(`Marcar como variantes distintas (não fundir)?\n\n${p.master_orfao.nome_padrao}\nvs\n${p.master_com_precos.nome_padrao}`)) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('masters_duplicatas_ignoradas').insert({
        produto_1_id: p.master_orfao.id,
        produto_2_id: p.master_com_precos.id,
        decidido_por: user?.id,
        observacao: 'Marcado como variante distinta via Masters Órfãos',
      });
      if (error) throw error;
      toast({ title: "Marcado como variante distinta" });
      await carregar();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message || String(e), variant: "destructive" });
    }
  }

  const paresSeguros = pares.filter(p => p.bloqueios.length === 0);
  const paresBloqueados = pares.filter(p => p.bloqueios.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={carregar} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {loading ? 'Analisando...' : 'Diagnóstico global'}
        </Button>
        {pares.length > 0 && (
          <>
            <Badge variant="default">{seguros} seguros</Badge>
            <Badge variant="destructive">{bloqueados} bloqueados</Badge>
            {selecionados.size > 0 && (
              <Button onClick={consolidarSelecionados} disabled={consolidando} variant="default" className="gap-2 ml-auto">
                {consolidando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Consolidar {selecionados.size} selecionado(s)
              </Button>
            )}
          </>
        )}
      </div>

      {pares.length === 0 && !loading && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Clique em "Diagnóstico global" para analisar masters órfãos de preço no sistema inteiro.
          </CardContent>
        </Card>
      )}

      {paresSeguros.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            Pares seguros ({paresSeguros.length})
          </h3>
          {paresSeguros.map(p => (
            <ParCard
              key={chavePar(p)}
              par={p}
              selecionado={selecionados.has(chavePar(p))}
              onToggle={() => toggleSelecionado(p)}
              onConsolidar={() => consolidarPar(p)}
              onIgnorar={() => marcarVarianteDistinta(p)}
              consolidando={consolidando}
            />
          ))}
        </div>
      )}

      {paresBloqueados.length > 0 && (
        <div className="space-y-3 mt-6">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-destructive-foreground" />
            Variantes — não fundir ({paresBloqueados.length})
          </h3>
          {paresBloqueados.map(p => (
            <ParCard
              key={chavePar(p)}
              par={p}
              bloqueado
              onIgnorar={() => marcarVarianteDistinta(p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ParCard({ par, selecionado, onToggle, onConsolidar, onIgnorar, consolidando, bloqueado }: any) {
  const o = par.master_orfao;
  const d = par.master_com_precos;
  return (
    <Card className={bloqueado ? 'border-destructive/40' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          {!bloqueado && (
            <Checkbox checked={!!selecionado} onCheckedChange={onToggle} className="mt-1" />
          )}
          <div className="flex-1 flex flex-wrap items-center gap-2">
            <CardTitle className="text-sm">Score: {par.score_similaridade}</CardTitle>
            {par.bloqueios.map((b: string) => (
              <Badge key={b} variant="destructive" className="gap-1">
                <AlertTriangle className="w-3 h-3" />{b}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="border rounded-md p-3 bg-muted/30">
            <Badge variant="outline" className="mb-2">Órfão (sem preços)</Badge>
            <div className="font-medium">{o.nome_padrao}</div>
            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
              <div>Marca: {o.marca || '—'} · Qtd: {o.qtd_valor ?? '—'} {o.unidade_base || ''}</div>
              <div>EAN: {o.codigo_barras || '—'} · Cat: {o.categoria || '—'}</div>
              <div>Vínculos: {o.total_vinculos_listas} listas · {o.total_vinculos_estoque} estoque · {o.total_notas || 0} notas</div>
            </div>
          </div>
          <div className="border rounded-md p-3 bg-primary/5">
            <Badge variant="default" className="mb-2">Com preços ({d.total_precos})</Badge>
            <div className="font-medium">{d.nome_padrao}</div>
            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
              <div>Marca: {d.marca || '—'} · Qtd: {d.qtd_valor ?? '—'} {d.unidade_base || ''}</div>
              <div>EAN: {d.codigo_barras || '—'} · Cat: {d.categoria || '—'}</div>
              <div>Vínculos: {d.total_vinculos_listas} listas · {d.total_vinculos_estoque} estoque · {d.total_notas || 0} notas</div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!bloqueado && (
            <Button size="sm" onClick={onConsolidar} disabled={consolidando} className="gap-1">
              <CheckCircle2 className="w-4 h-4" />Consolidar
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onIgnorar}>
            Marcar como variante distinta
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
