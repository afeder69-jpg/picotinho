import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

interface ProcessingBadgeProps {
  noteCount: number;
  startTime: number;
}

export const ProcessingBadge = ({ noteCount, startTime }: ProcessingBadgeProps) => {
  const [elapsedTime, setElapsedTime] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedTime(elapsed);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [startTime]);
  
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };
  
  return (
    <div className="fixed top-20 right-4 z-50 animate-in slide-in-from-top-2 duration-300">
      <div className="bg-blue-500 text-white rounded-full px-4 py-2 shadow-lg flex items-center gap-2 hover:scale-105 transition-transform">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <div className="flex flex-col text-xs">
          <span className="font-semibold">
            {noteCount} {noteCount === 1 ? 'nota' : 'notas'}
          </span>
          <span className="text-blue-100">
            {formatTime(elapsedTime)}
          </span>
        </div>
      </div>
    </div>
  );
};
