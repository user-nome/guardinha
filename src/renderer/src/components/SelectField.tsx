import { useEffect, useId, useRef, useState } from 'react';
import type { JSX, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';

/** Campo de escolha com menu próprio; o select nativo entrega o popup do sistema. */

/** Um valor que o campo sabe oferecer, e o texto que aparece para ele. */
export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  /** Texto do gatilho em modo compacto, no lugar do rótulo completo. */
  short?: string;
}

/** `sm` é o campo compacto da barra lateral; `md`, o do formulário. */
export type SelectFieldSize = 'sm' | 'md';

export interface SelectFieldProps<T extends string | number> {
  label: string;
  options: readonly SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: SelectFieldSize;
  /** Troca o gatilho para `option.short` enquanto a janela for estreita. */
  compact?: boolean;
}

const TRIGGER_CLASS = {
  sm: 'w-full flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 cursor-pointer transition-colors hover:border-slate-700 focus:outline-none focus-visible:border-emerald-500',
  md: 'w-full flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 cursor-pointer transition-colors hover:border-slate-700 focus:outline-none focus-visible:border-emerald-500',
} satisfies Record<SelectFieldSize, string>;

const LABEL_CLASS = {
  sm: 'text-xs text-slate-500',
  md: 'text-xs font-medium text-slate-300',
} satisfies Record<SelectFieldSize, string>;

const CHEVRON_CLASS = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
} satisfies Record<SelectFieldSize, string>;

const ITEM_TEXT_CLASS = {
  sm: 'text-xs',
  md: 'text-sm',
} satisfies Record<SelectFieldSize, string>;

const ITEM_CHECK_CLASS = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
} satisfies Record<SelectFieldSize, string>;

/** No modo compacto carrega as duas formas do rótulo e deixa o CSS escolher pela largura. */
function triggerLabel<T extends string | number>(
  option: SelectOption<T> | undefined,
  compact: boolean,
): ReactNode {
  if (option === undefined) return '';
  if (!compact || option.short === undefined) return option.label;
  return (
    <>
      <span className="lg:hidden">{option.short}</span>
      <span className="hidden lg:inline">{option.label}</span>
    </>
  );
}

export function SelectField<T extends string | number>({
  label,
  options,
  value,
  onChange,
  size = 'md',
  compact = false,
}: SelectFieldProps<T>): JSX.Element {
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = useId();
  const labelId = `${listId}-label`;

  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (event: MouseEvent): void => {
      if (event.target instanceof Node && containerRef.current?.contains(event.target) === true)
        return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setFocusIndex(activeIndex);
    itemRefs.current[activeIndex]?.focus();
  }, [activeIndex, open]);

  const close = (): void => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const choose = (chosen: T): void => {
    setOpen(false);
    triggerRef.current?.focus();
    // regra do campo controlado: realimentar o mesmo valor não deve gravar
    if (chosen !== value) onChange(chosen);
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
    }
  };

  const handleItemKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    const last = options.length - 1;
    let next: number | null = null;
    if (event.key === 'Escape') close();
    else if (event.key === 'ArrowDown') next = focusIndex >= last ? 0 : focusIndex + 1;
    else if (event.key === 'ArrowUp') next = focusIndex <= 0 ? last : focusIndex - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else if (event.key === 'Tab') setOpen(false);
    if (next !== null) {
      event.preventDefault();
      setFocusIndex(next);
      itemRefs.current[next]?.focus();
    }
  };

  const active = options[activeIndex];

  return (
    <div ref={containerRef} className="relative space-y-1.5">
      <span className={LABEL_CLASS[size]} id={labelId}>
        {label}
      </span>

      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={labelId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
        className={TRIGGER_CLASS[size]}
      >
        <span className="truncate">{triggerLabel(active, compact)}</span>
        <ChevronDown
          className={`${CHEVRON_CLASS[size]} shrink-0 text-slate-500 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={labelId}
          className="absolute z-20 left-0 right-0 top-full mt-1 rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-lg shadow-black/40"
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            return (
              <li key={option.value} role="option" aria-selected={selected}>
                <button
                  ref={(element) => {
                    itemRefs.current[index] = element;
                  }}
                  type="button"
                  onClick={() => {
                    choose(option.value);
                  }}
                  onKeyDown={handleItemKeyDown}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left cursor-pointer transition-colors focus:outline-none ${
                    selected
                      ? 'bg-emerald-500/10 text-emerald-400 font-semibold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100 focus-visible:bg-slate-800'
                  } ${ITEM_TEXT_CLASS[size]}`}
                >
                  <span>{option.label}</span>
                  {selected && <Check className={`${ITEM_CHECK_CLASS[size]} shrink-0`} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
