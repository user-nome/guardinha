import { useEffect } from 'react';
import type { JSX } from 'react';

interface ToastProps {
  message: string | null;
  onClose: () => void;
}

/** Aviso flutuante (copy, save…) que some sozinho após 2,5 s. */
export function Toast({ message, onClose }: ToastProps): JSX.Element | null {
  useEffect(() => {
    if (message === null) return;
    const timer = setTimeout(onClose, 2500);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (message === null) return null;

  return (
    // ancoragem que não estoura a janela estreita: coluna na borda, bloco central no trilho
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:justify-end sm:px-0">
      <div className="max-w-full bg-slate-800 border border-emerald-500/30 text-slate-100 text-sm px-4 py-2.5 rounded-lg shadow-lg">
        {message}
      </div>
    </div>
  );
}
