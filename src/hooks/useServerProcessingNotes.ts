import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  PROCESSING_INDICATOR_WINDOW_MINUTES,
  PROCESSING_INDICATOR_POLL_MS,
} from "@/lib/constants";

export interface ServerProcessingState {
  count: number;
  oldestStartedAt: number | null;
  hasErrors: boolean;
}

/**
 * Hook que observa o servidor (notas_imagens) como fonte de verdade do
 * indicador GLOBAL de processamento. Combina:
 *   1) query inicial ao montar
 *   2) realtime subscription (UPDATE/INSERT) por usuario_id
 *   3) polling de segurança a cada PROCESSING_INDICATOR_POLL_MS
 *
 * Janela: PROCESSING_INDICATOR_WINDOW_MINUTES (centralizada em lib/constants).
 */
export const useServerProcessingNotes = (): ServerProcessingState => {
  const { user } = useAuth();
  const [state, setState] = useState<ServerProcessingState>({
    count: 0,
    oldestStartedAt: null,
    hasErrors: false,
  });
  const isMountedRef = useRef(true);

  const fetchState = useCallback(async () => {
    if (!user?.id) {
      if (isMountedRef.current) {
        setState({ count: 0, oldestStartedAt: null, hasErrors: false });
      }
      return;
    }
    const since = new Date(
      Date.now() - PROCESSING_INDICATOR_WINDOW_MINUTES * 60 * 1000
    ).toISOString();

    const { data, error } = await supabase
      .from("notas_imagens")
      .select("id, status_processamento, created_at, erro_mensagem")
      .eq("usuario_id", user.id)
      .in("status_processamento", ["aguardando_estoque", "processando"])
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) {
      console.warn("[useServerProcessingNotes] erro ao buscar:", error.message);
      return;
    }
    if (!isMountedRef.current) return;

    const rows = data ?? [];
    setState({
      count: rows.length,
      oldestStartedAt: rows.length > 0 ? new Date(rows[0].created_at).getTime() : null,
      hasErrors: rows.some((r) => !!r.erro_mensagem),
    });
  }, [user?.id]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchState();

    if (!user?.id) {
      return () => {
        isMountedRef.current = false;
      };
    }

    // Realtime: qualquer mudança em notas_imagens do usuário força reconciliação.
    const channel = supabase
      .channel(`global-processing-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notas_imagens",
          filter: `usuario_id=eq.${user.id}`,
        },
        () => fetchState()
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notas_imagens",
          filter: `usuario_id=eq.${user.id}`,
        },
        () => fetchState()
      )
      .subscribe();

    // Polling de segurança (caso realtime caia)
    const interval = setInterval(fetchState, PROCESSING_INDICATOR_POLL_MS);

    // Re-sincroniza ao voltar foco da aba/app
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchState();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", fetchState);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", fetchState);
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchState]);

  return state;
};
