import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import type { QueueStats } from "@/hooks/useNoteQueue";

interface ProcessingBadgeProps {
  stats: QueueStats;
  startTime: number;
}

export const ProcessingBadge = ({ stats, startTime }: ProcessingBadgeProps) => {
  const [elapsedTime, setElapsedTime] = useState(0);
  
  useEffect(() => {
    if (stats.allDone) return;
    
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedTime(elapsed);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [startTime, stats.allDone]);
  
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  // Build status parts
  const parts: string[] = [];
  if (stats.processando > 0) parts.push(`${stats.processando} processando`);
  if (stats.aguardando > 0) parts.push(`${stats.aguardando} na fila`);
  if (stats.processadas > 0) parts.push(`${stats.processadas} ${stats.processadas === 1 ? 'processada' : 'processadas'}`);
  if (stats.erros > 0) parts.push(`${stats.erros} ${stats.erros === 1 ? 'erro' : 'erros'}`);

  const isAllDone = stats.allDone;
  const hasErrors = stats.erros > 0;

  const bgColor = isAllDone
    ? hasErrors ? 'bg-amber-500' : 'bg-green-500'
    : 'bg-blue-500';

  const Icon = isAllDone
    ? hasErrors ? AlertCircle : CheckCircle2
    : Loader2;

  return (
    <div className="fixed top-20 right-4 z-50 animate-in slide-in-from-top-2 duration-300">
      <div className={`${bgColor} text-white rounded-2xl px-4 py-2.5 shadow-lg flex items-center gap-2.5 hover:scale-105 transition-transform max-w-[260px]`}>
        <Icon className={`w-4 h-4 flex-shrink-0 ${!isAllDone ? 'animate-spin' : ''}`} />
        <div className="flex flex-col text-xs leading-tight">
          <span className="font-semibold">
            {parts.join(', ')}
          </span>
          {!isAllDone && (
            <span className="text-white/70">
              {formatTime(elapsedTime)}
            </span>
          )}
          {isAllDone && (
            <span className="text-white/70">
              Concluído!
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
