/**
 * Notifications.tsx — Toast host + Confirm diyaloğu (App'te bir kez monte edilir).
 *
 * useUiStore'a abone olur; native alert()/confirm() yerine token-temalı,
 * renk-kodlu bildirimler gösterir.
 */
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  FiCheckCircle, FiAlertTriangle, FiXCircle, FiInfo, FiX,
} from 'react-icons/fi';
import clsx from 'clsx';
import { useUiStore, type Toast, type ToastKind } from '../stores/useUiStore';
import { useEscapeClose } from '../hooks/useEscapeClose';

// ── Toast ─────────────────────────────────────────────────────────────────
const KIND: Record<ToastKind, { icon: React.ReactNode; bar: string; text: string }> = {
  success: { icon: <FiCheckCircle size={15} />, bar: 'bg-mf-green',  text: 'text-mf-green' },
  error:   { icon: <FiXCircle size={15} />,      bar: 'bg-mf-red',    text: 'text-mf-red' },
  warn:    { icon: <FiAlertTriangle size={15} />,bar: 'bg-mf-yellow', text: 'text-mf-yellow' },
  info:    { icon: <FiInfo size={15} />,          bar: 'bg-mf-blue',   text: 'text-mf-blue' },
};

const ToastItem: React.FC<{ toast: Toast; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
  useEffect(() => {
    const id = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(id);
  }, [toast.id, toast.duration, onDismiss]);

  const k = KIND[toast.kind];
  return (
    <div
      className="toast-enter flex items-start gap-2 w-80 max-w-[90vw] bg-mf-elev border border-mf-border-strong
                 rounded-ds-md shadow-pop overflow-hidden"
      role="status"
    >
      <div className={clsx('w-1 self-stretch flex-shrink-0', k.bar)} />
      <div className={clsx('pt-2.5 flex-shrink-0', k.text)}>{k.icon}</div>
      <div className="flex-1 py-2.5 pr-1 text-xs text-mf-text leading-relaxed break-words">{toast.message}</div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="btn-icon w-6 h-6 mt-1.5 mr-1 flex-shrink-0"
        aria-label="Kapat"
      >
        <FiX size={12} />
      </button>
    </div>
  );
};

const ToastHost: React.FC = () => {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  return createPortal(
    <div className="fixed bottom-9 right-3 z-[200] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onDismiss={dismiss} />
        </div>
      ))}
    </div>,
    document.body,
  );
};

// ── Confirm diyaloğu ────────────────────────────────────────────────────────
const ConfirmDialog: React.FC = () => {
  const c = useUiStore((s) => s.confirm);
  const resolve = useUiStore((s) => s.resolveConfirm);
  useEscapeClose(!!c, () => resolve(false));
  if (!c) return null;

  return createPortal(
    <div
      className="backdrop-enter fixed inset-0 z-[210] flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onMouseDown={(e) => { if (e.target === e.currentTarget) resolve(false); }}
    >
      <div className="dialog-enter bg-mf-panel border border-mf-border-strong rounded-ds-lg shadow-pop w-[420px] max-w-[92vw]">
        <div className="px-4 py-3 border-b border-mf-border">
          <h3 id="confirm-title" className="text-sm font-semibold text-mf-text">
            {c.title ?? 'Onay'}
          </h3>
        </div>
        <div className="px-4 py-4 text-xs text-mf-text-dim leading-relaxed">{c.message}</div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-mf-border">
          <button
            onClick={() => resolve(false)}
            className="px-3 py-1.5 text-xs text-mf-text-dim hover:text-mf-text"
          >
            {c.cancelLabel ?? 'Vazgeç'}
          </button>
          <button
            onClick={() => resolve(true)}
            autoFocus
            className={clsx(
              'px-3 py-1.5 text-xs font-medium rounded-ds-sm transition-colors',
              c.danger
                ? 'bg-mf-red/15 text-mf-red border border-mf-red/50 hover:bg-mf-red/25'
                : 'bg-mf-blue/15 text-mf-blue border border-mf-blue/50 hover:bg-mf-blue/25',
            )}
          >
            {c.confirmLabel ?? 'Tamam'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

/** App'te bir kez monte edilen kapsayıcı. */
const Notifications: React.FC = () => (
  <>
    <ToastHost />
    <ConfirmDialog />
  </>
);

export default Notifications;
