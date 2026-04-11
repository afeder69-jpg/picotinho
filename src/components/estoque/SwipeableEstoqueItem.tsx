import React, { useRef, useState, useCallback } from 'react';
import { Trash2, Edit3 } from 'lucide-react';

interface SwipeableEstoqueItemProps {
  children: React.ReactNode;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  disabled?: boolean;
}

const SWIPE_THRESHOLD = 80;
const DIRECTION_LOCK_DISTANCE = 10;

const SwipeableEstoqueItem: React.FC<SwipeableEstoqueItemProps> = ({
  children,
  onSwipeRight,
  onSwipeLeft,
  disabled = false,
}) => {
  const [translateX, setTranslateX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const directionLockedRef = useRef<'horizontal' | 'vertical' | null>(null);
  const hasFiredRef = useRef(false);

  const resetSwipe = useCallback(() => {
    setIsTransitioning(true);
    setTranslateX(0);
    setIsSwiping(false);
    directionLockedRef.current = null;
    hasFiredRef.current = false;
    setTimeout(() => setIsTransitioning(false), 300);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled || isTransitioning) return;
    const touch = e.touches[0];
    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    directionLockedRef.current = null;
    hasFiredRef.current = false;
    setIsTransitioning(false);
  }, [disabled, isTransitioning]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled || isTransitioning) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - startXRef.current;
    const deltaY = touch.clientY - startYRef.current;

    // Direction lock: decide once if this is horizontal or vertical
    if (!directionLockedRef.current) {
      const absDX = Math.abs(deltaX);
      const absDY = Math.abs(deltaY);
      if (absDX < DIRECTION_LOCK_DISTANCE && absDY < DIRECTION_LOCK_DISTANCE) return;
      
      if (absDX > absDY * 1.5) {
        directionLockedRef.current = 'horizontal';
      } else {
        directionLockedRef.current = 'vertical';
        return;
      }
    }

    if (directionLockedRef.current === 'vertical') return;

    // Prevent vertical scroll while swiping horizontally
    e.preventDefault();
    setIsSwiping(true);

    // Limit max swipe distance
    const clampedX = Math.max(-150, Math.min(150, deltaX));
    setTranslateX(clampedX);
  }, [disabled, isTransitioning]);

  const handleTouchEnd = useCallback(() => {
    if (disabled || directionLockedRef.current !== 'horizontal' || hasFiredRef.current) {
      resetSwipe();
      return;
    }

    if (translateX > SWIPE_THRESHOLD) {
      hasFiredRef.current = true;
      onSwipeRight();
    } else if (translateX < -SWIPE_THRESHOLD) {
      hasFiredRef.current = true;
      onSwipeLeft();
    }

    resetSwipe();
  }, [disabled, translateX, onSwipeRight, onSwipeLeft, resetSwipe]);

  const progress = Math.min(Math.abs(translateX) / SWIPE_THRESHOLD, 1);

  return (
    <div className="relative overflow-hidden">
      {/* Right swipe background (zerar) */}
      {translateX > 0 && (
        <div
          className="absolute inset-0 flex items-center pl-4 rounded-md"
          style={{
            backgroundColor: `hsl(0, ${60 + progress * 20}%, ${50 - progress * 10}%)`,
            opacity: 0.6 + progress * 0.4,
          }}
        >
          <div className="flex items-center gap-2 text-white">
            <Trash2 className="w-5 h-5" />
            <span className="text-sm font-medium">Zerar</span>
          </div>
        </div>
      )}

      {/* Left swipe background (editar) */}
      {translateX < 0 && (
        <div
          className="absolute inset-0 flex items-center justify-end pr-4 rounded-md"
          style={{
            backgroundColor: `hsl(217, ${60 + progress * 20}%, ${50 - progress * 10}%)`,
            opacity: 0.6 + progress * 0.4,
          }}
        >
          <div className="flex items-center gap-2 text-white">
            <span className="text-sm font-medium">Editar</span>
            <Edit3 className="w-5 h-5" />
          </div>
        </div>
      )}

      {/* Swipeable content */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isTransitioning ? 'transform 0.3s ease-out' : 'none',
          position: 'relative',
          zIndex: 1,
          backgroundColor: 'hsl(var(--background))',
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default SwipeableEstoqueItem;
