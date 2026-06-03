/**
 * useKeyboardShortcuts — global klavye kısayolları.
 * Ctrl+Z/Y (undo/redo), Ctrl+S/Shift+S (kaydet/farklı kaydet), Ctrl+O (aç),
 * Ctrl+N (yeni), Ctrl+E (dışa aktar), Delete/Backspace (seçili sil),
 * ?/F1 (yardım). Davranış App.tsx'ten birebir taşındı.
 *
 * Dinleyici bir kez bağlanır; callback'ler ref üzerinden güncel tutulur
 * (orijinal de stabil handler'lara dayanıyordu — davranış aynı).
 */
import { useEffect, useRef } from 'react';
import { useDesignStore } from '../stores/useDesignStore';

export interface KeyboardShortcutHandlers {
  onSave: () => void;
  onSaveAs: () => void;
  onOpen: () => void;
  onNewProject: () => void;
  onExport: () => void;
  onToggleHelp: () => void;
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const h = ref.current;
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'z': e.preventDefault(); useDesignStore.getState().undo(); break;
          case 'y': e.preventDefault(); useDesignStore.getState().redo(); break;
          case 's':
            e.preventDefault();
            if (e.shiftKey) h.onSaveAs();
            else h.onSave();
            break;
          case 'o': e.preventDefault(); h.onOpen(); break;
          case 'n': e.preventDefault(); h.onNewProject(); break;
          case 'e': e.preventDefault(); h.onExport(); break;
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Monaco editör / input aktifken silme işlemi yapma
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
        const { selectedIds, removeComponents } = useDesignStore.getState();
        if (selectedIds.length > 0) removeComponents(selectedIds);
      }
      // ? veya F1 — klavye kısayolları yardımı
      if ((e.key === '?' || e.key === 'F1') && !e.ctrlKey && !e.metaKey) {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
        e.preventDefault();
        h.onToggleHelp();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
