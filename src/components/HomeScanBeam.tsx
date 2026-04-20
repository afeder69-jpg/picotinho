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
// Diminua QR_TARGET_X para mover à esquerda; aumente QR_TARGET_Y para descer.
const QR_TARGET_X = 0.58; // fração horizontal da imagem (QR fica à esq. do %)
const QR_TARGET_Y = 0.70; // fração vertical da imagem
// Tamanho do quadrado de varredura sobre o QR
const SCAN_BOX_SIZE = 36; // px

// 🔁 Repetições da animação na entrada da Home
const REPEAT_COUNT = 2; // número de passadas
const REPEAT_GAP_MS = 350; // intervalo entre passadas

// 🎨 Cor do feixe (laser vermelho) — tokens HSL
const LASER_CORE = "0 100% 60%"; // vermelho vivo
const LASER_GLOW = "0 100% 50%";

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
  const [pulse, setPulse] = useState(0); // força remount a cada repetição
  const cleanupRef = useRef<number[]>([]);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;

    const SINGLE_BEAM_MS = 700;
    const SINGLE_SCAN_MS = 1000;
    const SINGLE_TOTAL = SINGLE_BEAM_MS + SINGLE_SCAN_MS; // 1700ms

    const runOnce = (index: number) => {
      const btn = document.querySelector<HTMLElement>(
        '[data-qr-scan-button="true"]'
      );
      const img = targetRef.current;
      if (!btn || !img) return;

      const measure = () => {
        const b = btn.getBoundingClientRect();
        const i = img.getBoundingClientRect();
        if (b.width === 0 || i.width === 0) return;
        setPulse(index);
        setCoords({
          x1: b.left + b.width / 2,
          y1: b.top + b.height / 2,
          x2: i.left + i.width * QR_TARGET_X,
          y2: i.top + i.height * QR_TARGET_Y,
        });
        setPhase("beam");

        const t1 = window.setTimeout(() => setPhase("scan"), SINGLE_BEAM_MS);
        const t2 = window.setTimeout(() => {
          setPhase(null);
          setCoords(null);
        }, SINGLE_TOTAL);
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
    };

    const startTimer = window.setTimeout(() => {
      sessionStorage.setItem(SESSION_KEY, "1");
      // Disparar N repetições com intervalo
      for (let i = 0; i < REPEAT_COUNT; i++) {
        const delay = i * (SINGLE_TOTAL + REPEAT_GAP_MS);
        const tid = window.setTimeout(() => runOnce(i), delay);
        cleanupRef.current.push(tid);
      }
    }, 250);

    cleanupRef.current.push(startTimer);
    return () => {
      cleanupRef.current.forEach((id) => clearTimeout(id));
      cleanupRef.current = [];
    };
  }, [targetRef]);

  if (!coords || !phase) return null;

  const dx = coords.x2 - coords.x1;
  const dy = coords.y2 - coords.y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  return (
    <div
      className="fixed inset-0 pointer-events-none z-40"
      aria-hidden="true"
    >
      {/* Feixe laser vermelho */}
      <div
        key={`beam-${pulse}`}
        style={{
          position: "absolute",
          left: coords.x1,
          top: coords.y1,
          width: length,
          height: 3,
          transform: `rotate(${angle}deg)`,
          transformOrigin: "0 50%",
          background: `linear-gradient(90deg, hsl(${LASER_CORE} / 0) 0%, hsl(${LASER_CORE} / 0.95) 55%, hsl(${LASER_CORE}) 100%)`,
          boxShadow: `0 0 6px hsl(${LASER_GLOW} / 0.85), 0 0 14px hsl(${LASER_GLOW} / 0.55)`,
          borderRadius: 9999,
          opacity: phase === "beam" ? 1 : 0,
          animation:
            phase === "beam"
              ? "beam-grow 0.6s ease-out forwards"
              : "beam-fade 0.4s ease-out forwards",
        }}
      />

      {phase === "scan" && (
        <div
          key={`scan-${pulse}`}
          style={{
            position: "absolute",
            left: coords.x2 - SCAN_BOX_SIZE / 2,
            top: coords.y2 - SCAN_BOX_SIZE / 2,
            width: SCAN_BOX_SIZE,
            height: SCAN_BOX_SIZE,
            borderRadius: 6,
            boxShadow: `0 0 0 2px hsl(${LASER_CORE} / 0.8), 0 0 16px hsl(${LASER_GLOW} / 0.7)`,
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
              background: `linear-gradient(90deg, transparent, hsl(${LASER_CORE}), transparent)`,
              boxShadow: `0 0 6px hsl(${LASER_GLOW})`,
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
