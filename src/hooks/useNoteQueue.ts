import { useState, useCallback, useRef, useEffect } from 'react';

export type NoteQueueStatus = 'aguardando' | 'processando' | 'processada' | 'erro';

export interface NoteQueueItem {
  queueItemId: string;
  url: string;
  chaveAcesso: string;
  tipoDocumento: string | null;
  status: NoteQueueStatus;
  errorMessage?: string;
  addedAt: number;
}

export interface QueueStats {
  aguardando: number;
  processando: number;
  processadas: number;
  erros: number;
  total: number;
  allDone: boolean;
}

interface UseNoteQueueOptions {
  processNote: (url: string, chaveAcesso: string, tipoDocumento: string | null, queueItemId: string) => void;
  autoDismissMs?: number;
}

export const useNoteQueue = ({ processNote, autoDismissMs = 5000 }: UseNoteQueueOptions) => {
  const [queue, setQueue] = useState<NoteQueueItem[]>([]);
  const [visible, setVisible] = useState(false);
  const processNoteRef = useRef(processNote);
  const dismissTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Keep ref in sync
  useEffect(() => {
    processNoteRef.current = processNote;
  }, [processNote]);

  const stats: QueueStats = {
    aguardando: queue.filter(i => i.status === 'aguardando').length,
    processando: queue.filter(i => i.status === 'processando').length,
    processadas: queue.filter(i => i.status === 'processada').length,
    erros: queue.filter(i => i.status === 'erro').length,
    total: queue.length,
    allDone: queue.length > 0 && queue.every(i => i.status === 'processada' || i.status === 'erro'),
  };

  // Auto-dismiss after all done
  useEffect(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }

    if (stats.allDone && queue.length > 0) {
      dismissTimerRef.current = setTimeout(() => {
        setQueue([]);
        setVisible(false);
      }, autoDismissMs);
    }

    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [stats.allDone, queue.length, autoDismissMs]);

  const processNext = useCallback((currentQueue: NoteQueueItem[]) => {
    const hasProcessing = currentQueue.some(i => i.status === 'processando');
    if (hasProcessing) return currentQueue;

    const nextIdx = currentQueue.findIndex(i => i.status === 'aguardando');
    if (nextIdx === -1) return currentQueue;

    const next = currentQueue[nextIdx];
    console.log(`🔵 [QUEUE] Disparando próxima nota: ${next.queueItemId}`);
    
    // Call processNote asynchronously
    setTimeout(() => {
      processNoteRef.current(next.url, next.chaveAcesso, next.tipoDocumento, next.queueItemId);
    }, 0);

    return currentQueue.map((item, idx) =>
      idx === nextIdx ? { ...item, status: 'processando' as const } : item
    );
  }, []);

  const enqueue = useCallback((url: string, chaveAcesso: string, tipoDocumento: string | null) => {
    const queueItemId = `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    console.log(`🔵 [QUEUE] Enfileirando nota: ${queueItemId}`);

    setVisible(true);

    setQueue(prev => {
      const newItem: NoteQueueItem = {
        queueItemId,
        url,
        chaveAcesso,
        tipoDocumento,
        status: 'aguardando',
        addedAt: Date.now(),
      };
      const updated = [...prev, newItem];
      return processNext(updated);
    });

    return queueItemId;
  }, [processNext]);

  const markDone = useCallback((queueItemId: string) => {
    console.log(`✅ [QUEUE] Nota concluída: ${queueItemId}`);
    setQueue(prev => {
      const updated = prev.map(item =>
        item.queueItemId === queueItemId ? { ...item, status: 'processada' as const } : item
      );
      return processNext(updated);
    });
  }, [processNext]);

  const markError = useCallback((queueItemId: string, errorMessage?: string) => {
    console.log(`❌ [QUEUE] Nota com erro: ${queueItemId}`, errorMessage);
    setQueue(prev => {
      const updated = prev.map(item =>
        item.queueItemId === queueItemId ? { ...item, status: 'erro' as const, errorMessage } : item
      );
      return processNext(updated);
    });
  }, [processNext]);

  return {
    enqueue,
    markDone,
    markError,
    queue,
    stats,
    visible,
  };
};
