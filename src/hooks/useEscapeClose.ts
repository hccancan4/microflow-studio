/**
 * useEscapeClose — Dialog/modal'lar için ESC tuşu kapatma hook'u.
 * Hook çalışırken global keydown dinleyici ekler; ESC basıldığında onClose çağırır.
 * Birden fazla aktif modal varsa, sonuncusu (DOM'da en üstte olan) öncelikli kapanır.
 */
import { useEffect } from 'react';

export function useEscapeClose(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);
}
