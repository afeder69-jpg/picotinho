import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { useServerProcessingNotes } from "@/hooks/useServerProcessingNotes";

/**
 * Indicador GLOBAL de processamento, renderizado no nível do BrowserRouter.
 * Visível em todas as rotas (z-50), exceto quando o scanner de QR está ATIVO
 * (controlado pelo evento 'scanner-active' disparado por BottomNavigation).
 */
export const GlobalProcessingIndicator = () => {
  const { count, oldestStartedAt, hasErrors } = useServerProcessingNotes();
  const [scannerActive, setScannerActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Escuta o estado do scanner (única exceção em que o indicador some)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail;
      setScannerActive(!!detail);
    };
    window.addEventListener("scanner-active", handler as EventListener);
    return () => window.removeEventListener("scanner-active", handler as EventListener);
  }, []);

  // Timer simples para mostrar tempo decorrido
  useEffect(() => {
    if (!oldestStartedAt || count === 0) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.floor((Date.now() - oldestStartedAt) / 1000));
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [oldestStartedAt, count]);

  if (count === 0) return null;
  if (scannerActive) return null;

  const formatTime = (s: number) => {
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
  };

  const Icon = hasErrors ? AlertCircle : Loader2;
  const bg = hasErrors ? "bg-amber-500" : "bg-blue-500";

  return (
    <div className="fixed top-20 right-4 z-50 animate-in slide-in-from-top-2 duration-300">
      <div
        className={`${bg} text-white rounded-2xl px-4 py-2.5 shadow-lg flex items-center gap-2.5 max-w-[260px]`}
      >
        <Icon className={`w-4 h-4 flex-shrink-0 ${!hasErrors ? "animate-spin" : ""}`} />
        <div className="flex flex-col text-xs leading-tight">
          <span className="font-semibold">
            {count} {count === 1 ? "nota processando" : "notas processando"}
          </span>
          <span className="text-white/70">{formatTime(elapsed)}</span>
        </div>
      </div>
    </div>
  );
};
