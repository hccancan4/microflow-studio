/**
 * ProgressOverlay.tsx — Ekranın sağ alt köşesinde görünen ilerleme bildirimi.
 *
 * Uzun-süreli CFD simülasyonu sırasında kullanıcıya canlı geri bildirim verir.
 * `useSimulationStore` status 'running' olduğunda otomatik belirir, tamamlanınca
 * ~900 ms animasyonla kaybolur.
 */
import React, { useEffect, useState } from 'react';
import { FiLoader, FiCheckCircle, FiAlertTriangle } from 'react-icons/fi';
import { useSimulationStore } from '../stores/useSimulationStore';
import clsx from 'clsx';

const ProgressOverlay: React.FC = () => {
  const { status, progress, progressMessage, error } = useSimulationStore();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (status === 'running') {
      setVisible(true);
      return;
    }
    if (status === 'completed' || status === 'error') {
      setVisible(true);
      const t = setTimeout(() => setVisible(false), 2400);
      return () => clearTimeout(t);
    }
    setVisible(false);
  }, [status]);

  if (!visible) return null;

  const isRunning = status === 'running';
  const isError   = status === 'error';
  const isDone    = status === 'completed';

  const barColor = isError ? 'bg-mf-red'
                 : isDone  ? 'bg-mf-green'
                 :           'bg-mf-orange';

  return (
    <div className="fixed bottom-10 right-4 z-[9998] w-80 pointer-events-none select-none">
      <div className={clsx(
        'bg-mf-surface/95 backdrop-blur border rounded shadow-lg px-3 py-2 transition-opacity duration-500',
        isError ? 'border-mf-red/60' : isDone ? 'border-mf-green/60' : 'border-mf-orange/60',
        visible ? 'opacity-100' : 'opacity-0',
      )}>
        <div className="flex items-center gap-2 text-xs mb-1.5">
          {isRunning && <FiLoader size={12} className="text-mf-orange animate-spin" />}
          {isDone    && <FiCheckCircle size={12} className="text-mf-green" />}
          {isError   && <FiAlertTriangle size={12} className="text-mf-red" />}
          <span className="font-semibold text-mf-text">
            {isRunning ? 'Simülasyon' : isDone ? 'Tamamlandı' : 'Hata'}
          </span>
          <span className="flex-1" />
          <span className="font-mono text-mf-text-dim">{Math.round(progress)}%</span>
        </div>

        <div className="w-full h-1.5 bg-mf-bg rounded-full overflow-hidden">
          <div
            className={clsx('h-full rounded-full transition-all duration-300', barColor)}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>

        <div className="mt-1.5 text-[11px] text-mf-text-dim leading-snug line-clamp-2">
          {isError ? (error ?? 'Bilinmeyen hata')
                   : (progressMessage || (isDone ? 'Simülasyon tamamlandı' : 'Çalışıyor...'))}
        </div>
      </div>
    </div>
  );
};

export default ProgressOverlay;
