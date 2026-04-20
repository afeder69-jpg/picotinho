import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Animação de feixe de leitura na entrada da Home.
 * - Origem: botão central com [data-qr-scan-button="true"] (seletor estável)
 * - Destino: ponto sobre o QR desenhado no mascote (parametrizado abaixo)
 * - Roda uma única vez por sessão; respeita prefers-reduced-motion
 * - Overlay fixed, pointer-events-none (não bloqueia nada)
 */

// 🎯 Ajuste fino do ponto de chegada sobre o QR do mascote.
// Valores em fração (0..1) relativos à imagem do Picotini.
// Aumente QR_TARGET_X para mover à direita; QR_TARGET_Y para mover para baixo.
const QR_TARGET_X = 0.72; // 72% da largura da imagem (canto inferior-direito)
const QR_TARGET_Y = 0.72; // 72% da altura da imagem
// Tamanho do quadrado de varredura sobre o QR
const SCAN_BOX_SIZE = 36; // px

// Chave de sessão para garantir execução única por sessão
const SESSION_KEY = "home-beam-played";

interface HomeScanBeamProps {
  targetRef: RefObject<HTMLImageElement>;
}

interface Coords {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const HomeScanBeam = ({ targetRef }: HomeScanBeamProps) => {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [phase, setPhase] = useState<"beam" | "scan" | null>(null);
  const cleanupRef = useRef<number[]>([]);

  useEffect(() => {
    // Respeitar prefers-reduced-motion
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    // Executar uma única vez por sessão
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;

    const startTimer = window.setTimeout(() => {
      const btn = document.querySelector<HTMLElement>(
        '[data-qr-scan-button="true"]'
      );
      const img = targetRef.current;
      if (!btn || !img) return;

      // Aguardar imagem carregada para medidas corretas
      const measure = () => {
        const b = btn.getBoundingClientRect();
        const i = img.getBoundingClientRect();
        if (b.width === 0 || i.width === 0) return;
        setCoords({
          x1: b.left + b.width / 2,
          y1: b.top + b.height / 2,
          x2: i.left + i.width * QR_TARGET_X,
          y2: i.top + i.height * QR_TARGET_Y,
        });
        sessionStorage.setItem(SESSION_KEY, "1");
        setPhase("beam");

        // Após o feixe subir, inicia varredura
        const t1 = window.setTimeout(() => setPhase("scan"), 700);
        // Encerra animação completa
        const t2 = window.setTimeout(() => {
          setPhase(null);
          setCoords(null);
        }, 1700);
        cleanupRef.current.push(t1, t2);
      };

      if (img.complete) {
        measure();
      } else {
        const onLoad = () => measure();
        img.addEventListener("load", onLoad, { once: true });
        cleanupRef.current.push(
          window.setTimeout(() => img.removeEventListener("load", onLoad), 3000)
        );
      }
    }, 250);

    cleanupRef.current.push(startTimer);
    return () => {
      cleanupRef.current.forEach((id) => clearTimeout(id));
      cleanupRef.current = [];
    };
  }, [targetRef]);

  if (!coords || !phase) return null;

  // Cálculos do feixe (linha do botão até o QR)
  const dx = coords.x2 - coords.x1;
  const dy = coords.y2 - coords.y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  return (
    <div
      className="fixed inset-0 pointer-events-none z-40"
      aria-hidden="true"
    >
      {/* Feixe: linha com gradiente do botão até o QR */}
      <div
        style={{
          position: "absolute",
          left: coords.x1,
          top: coords.y1,
          width: length,
          height: 3,
          transform: `rotate(${angle}deg)`,
          transformOrigin: "0 50%",
          background:
            "linear-gradient(90deg, hsl(var(--primary) / 0) 0%, hsl(var(--primary) / 0.9) 60%, hsl(var(--primary)) 100%)",
          boxShadow: "0 0 8px hsl(var(--primary) / 0.7)",
          borderRadius: 9999,
          opacity: phase === "beam" ? 1 : 0,
          animation:
            phase === "beam"
              ? "beam-grow 0.6s ease-out forwards"
              : "beam-fade 0.4s ease-out forwards",
        }}
      />

      {/* Caixa de varredura sobre o QR */}
      {phase === "scan" && (
        <div
          style={{
            position: "absolute",
            left: coords.x2 - SCAN_BOX_SIZE / 2,
            top: coords.y2 - SCAN_BOX_SIZE / 2,
            width: SCAN_BOX_SIZE,
            height: SCAN_BOX_SIZE,
            borderRadius: 6,
            boxShadow:
              "0 0 0 2px hsl(var(--primary) / 0.7), 0 0 16px hsl(var(--primary) / 0.6)",
            overflow: "hidden",
            animation: "scan-pulse 1s ease-out forwards",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              height: 2,
              background:
                "linear-gradient(90deg, transparent, hsl(var(--primary)), transparent)",
              boxShadow: "0 0 6px hsl(var(--primary))",
              animation: "scan-line 0.7s ease-in-out forwards",
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes beam-grow {
          0% { transform: rotate(${angle}deg) scaleX(0); opacity: 0; }
          30% { opacity: 1; }
          100% { transform: rotate(${angle}deg) scaleX(1); opacity: 1; }
        }
        @keyframes beam-fade {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes scan-line {
          0% { top: 0; }
          100% { top: 100%; }
        }
        @keyframes scan-pulse {
          0% { transform: scale(0.85); opacity: 0; }
          30% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.1); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default HomeScanBeam;
