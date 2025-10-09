import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface AvaliacaoEstrelasProps {
  media: number;
  total: number;
  tamanho?: 'sm' | 'md' | 'lg';
  mostrarNumero?: boolean;
}

export function AvaliacaoEstrelas({ 
  media, 
  total, 
  tamanho = 'md',
  mostrarNumero = true 
}: AvaliacaoEstrelasProps) {
  const estrelas = Array.from({ length: 5 }, (_, i) => {
    const preenchimento = Math.min(Math.max(media - i, 0), 1);
    
    return (
      <div key={i} className="relative inline-block">
        {/* Estrela vazia (fundo) */}
        <Star className={cn(
          "text-gray-300",
          tamanho === 'sm' && "w-4 h-4",
          tamanho === 'md' && "w-5 h-5",
          tamanho === 'lg' && "w-6 h-6"
        )} />
        
        {/* Estrela preenchida (overlay) */}
        <Star 
          className={cn(
            "absolute inset-0 text-yellow-400",
            tamanho === 'sm' && "w-4 h-4",
            tamanho === 'md' && "w-5 h-5",
            tamanho === 'lg' && "w-6 h-6"
          )}
          style={{ 
            clipPath: `inset(0 ${100 - preenchimento * 100}% 0 0)` 
          }}
          fill="currentColor"
        />
      </div>
    );
  });

  return (
    <div className="flex items-center gap-2">
      <div className="flex">{estrelas}</div>
      {mostrarNumero && (
        <span className="text-sm text-muted-foreground">
          {media.toFixed(1)} ({total} {total === 1 ? 'avaliação' : 'avaliações'})
        </span>
      )}
    </div>
  );
}
