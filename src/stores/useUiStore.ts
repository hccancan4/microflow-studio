/**
 * useUiStore — Uygulama-geneli bildirim altyapısı.
 *
 * İki mekanizma:
 *   1. Toast'lar — non-blocking, otomatik kaybolan durum bildirimleri
 *      (başarı/hata/uyarı/bilgi). Native `alert()` yerine.
 *   2. Confirm — promise-tabanlı evet/hayır onay diyaloğu. Native `confirm()`
 *      yerine (veri kaybı uyarıları gibi bloklayıcı kararlar için).
 *
 * Kullanım:
 *   import { toast, confirmAsync } from '../stores/useUiStore';
 *   toast.success('Kaydedildi');
 *   if (await confirmAsync({ message: 'Emin misiniz?', danger: true })) { ... }
 */
import { create } from 'zustand';

let _seq = 0;
const nextId = () => `ui-${++_seq}`;

export type ToastKind = 'success' | 'error' | 'warn' | 'info';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  duration: number; // ms
}

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean; // onay butonu kırmızı (silme vb.)
}
interface ConfirmState extends ConfirmOptions {
  id: string;
  resolve: (ok: boolean) => void;
}

interface UiState {
  toasts: Toast[];
  pushToast: (kind: ToastKind, message: string, duration?: number) => void;
  dismissToast: (id: string) => void;

  confirm: ConfirmState | null;
  requestConfirm: (opts: ConfirmOptions) => Promise<boolean>;
  resolveConfirm: (ok: boolean) => void;
}

export const useUiStore = create<UiState>()((set, get) => ({
  toasts: [],
  pushToast: (kind, message, duration) =>
    set((s) => ({
      toasts: [
        ...s.toasts,
        { id: nextId(), kind, message, duration: duration ?? (kind === 'error' ? 6000 : 4000) },
      ].slice(-5), // en fazla 5 toast üst üste
    })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  confirm: null,
  requestConfirm: (opts) =>
    new Promise<boolean>((resolve) => {
      set({ confirm: { ...opts, id: nextId(), resolve } });
    }),
  resolveConfirm: (ok) => {
    const c = get().confirm;
    if (c) c.resolve(ok);
    set({ confirm: null });
  },
}));

/** Kısa toast API'si. */
export const toast = {
  success: (m: string) => useUiStore.getState().pushToast('success', m),
  error:   (m: string) => useUiStore.getState().pushToast('error', m),
  warn:    (m: string) => useUiStore.getState().pushToast('warn', m),
  info:    (m: string) => useUiStore.getState().pushToast('info', m),
};

/** Promise-tabanlı onay diyaloğu. `await confirmAsync({...})` → boolean. */
export function confirmAsync(opts: ConfirmOptions): Promise<boolean> {
  return useUiStore.getState().requestConfirm(opts);
}
