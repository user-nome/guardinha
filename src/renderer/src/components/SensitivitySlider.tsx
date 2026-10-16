import { useCallback, useRef } from 'react';
import type {
  JSX,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';

interface SensitivitySliderProps {
  value: number;
  min: number;
  max: number;
  label: string;
  onChange: (value: number) => void;
}

/**
 * O clique inicia um arraste relativo (não pula o cursor para o ponto
 * clicado) e o passo em pixels acompanha a faixa de valores, com piso de
 * 10 px. Teclado move 1 por seta e 10 por Page.
 */
const MIN_STEP_PX = 10;

const KEY_DELTAS: Record<string, number> = {
  ArrowRight: 1,
  ArrowUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1,
  PageUp: 10,
  PageDown: -10,
};

/** Arraste em curso: onde o ponteiro pegou, o valor de então e o passo em px. */
interface DragState {
  startX: number;
  startValue: number;
  stepPx: number;
}

export function SensitivitySlider({
  value,
  min,
  max,
  label,
  onChange,
}: SensitivitySliderProps): JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const stepPx = useCallback((): number => {
    const width = trackRef.current?.clientWidth ?? 480;
    const natural = width / Math.max(1, max - min);
    return Math.max(MIN_STEP_PX, natural);
  }, [max, min]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startValue: value, stepPx: stepPx() };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (drag === null) return;
    const moved = Math.round((event.clientX - drag.startX) / drag.stepPx);
    const next = Math.min(max, Math.max(min, drag.startValue + moved));
    if (next !== value) onChange(next);
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragRef.current === null) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    let next: number;
    if (event.key === 'Home') {
      next = min;
    } else if (event.key === 'End') {
      next = max;
    } else {
      const delta = KEY_DELTAS[event.key];
      if (delta === undefined) return;
      next = value + delta;
    }
    event.preventDefault();
    onChange(Math.min(max, Math.max(min, next)));
  };

  const percent = ((value - min) / Math.max(1, max - min)) * 100;

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onKeyDown={handleKeyDown}
      className="relative h-2 bg-slate-800 rounded-lg cursor-pointer touch-none select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
    >
      <div
        className="absolute inset-y-0 left-0 bg-emerald-500 rounded-lg"
        style={{ width: `${percent}%` }}
      />
      <div
        className="absolute top-1/2 w-4 h-4 -translate-y-1/2 -translate-x-1/2 bg-emerald-400 rounded-full shadow border-2 border-slate-900"
        style={{ left: `${percent}%` }}
      />
    </div>
  );
}
