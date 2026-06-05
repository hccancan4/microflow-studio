/**
 * ProgressOverlay.tsx — Ekranın sağ alt köşesinde görünen ilerleme bildirimi.
 *
 * Uzun-süreli CFD simülasyonu sırasında canlı geri bildirim:
 *   - İlerleme % + durum mesajı
 *   - Canlı residual sparkline (log₁₀ residual düşerken yakınsama hissi)
 *   - ETA (kalan süre tahmini) + iterasyon sayacı
 * `useSimulationStore` status 'running' olunca belirir, tamamlanınca kaybolur.
 */
import React, { useEffect, useRef, useState } from 'react';
import { FiLoader, FiCheckCircle, FiAlertTriangle } from 'react-icons/fi';
import { useSimulationStore } from '../stores/useSimulationStore';
import { CHART_SERIES } from '../theme/tokens';
import clsx from 'clsx';

/** "İterasyon 120/800 — residual=1.2e-4" mesajından residual + iterasyon ayıkla. */
function parseProgress(msg: string): { residual: number | null; iter: string | null } {
  const r = msg.match(/residual\s*=\s*([\d.eE+-]+)/);
  const it = msg.match(/İterasyon\s*(\d+\s*\/\s*\d+)/);
  return {
    residual: r ? Number(r[1]) : null,
    iter: it ? it[1].replace(/\s/g, '') : null,
  };
}

const ProgressOverlay: React.FC = () => {
  const { status, progress, progressMessage, error } = useSimulationStore();
  const [visible, setVisible] = useState(false);
  const [residuals, setResiduals] = useState<number[]>([]);
  const [iter, setIter] = useState<string | null>(null);
  const startRef = useRef<number | null>(null);
  const [nowTick, setNowTick] = useState(0); // ETA'yı tazelemek için

  // Koşu başlangıcı / bitişi
  useEffect(() => {
    if (status === 'running') {
      setVisible(true);
      if (startRef.current === null) {
        startRef.current = Date.now();
        setResiduals([]);
        setIter(null);
      }
      return;
    }
    if (status === 'completed' || status === 'error') {
      setVisible(true);
      startRef.current = null;
      const t = setTimeout(() => setVisible(false), 2400);
      return () => clearTimeout(t);
    }
    setVisible(false);
    startRef.current = null;
  }, [status]);

  // Mesajdan residual + iterasyon ayıkla, sparkline'a ekle
  useEffect(() => {
    if (status !== 'running' || !progressMessage) return;
    const { residual, iter: it } = parseProgress(progressMessage);
    if (it) setIter(it);
    if (residual != null && Number.isFinite(residual)) {
      setResiduals((prev) => {
        if (prev.length && prev[prev.length - 1] === residual) return prev;
        return [...prev, residual].slice(-120);
      });
    }
  }, [progressMessage, status]);

  // ETA için saniyede ~3 kez yeniden render (yalnız çalışırken)
  useEffect(() => {
    if (status !== 'running') return;
    const id = setInterval(() => setNowTick((t) => t + 1), 350);
    return () => clearInterval(id);
  }, [status]);
  void nowTick;

  if (!visible) return null;

  const isRunning = status === 'running';
  const isError = status === 'error';
  const isDone = status === 'completed';

  const barColor = isError ? 'bg-mf-red' : isDone ? 'bg-mf-green' : 'bg-mf-orange';

  // ETA hesabı
  const elapsed = startRef.current ? (Date.now() - startRef.current) / 1000 : 0;
  const eta =
    isRunning && progress > 4 && progress < 99
      ? Math.max(0, (elapsed * (100 - progress)) / progress)
      : null;

  return (
    <div className="fixed bottom-10 right-4 z-[9998] w-80 pointer-events-none select-none">
      <div
        className={clsx(
          'bg-mf-surface/95 backdrop-blur border rounded-ds-md shadow-pop px-3 py-2 transition-opacity duration-slow',
          isError ? 'border-mf-red/60' : isDone ? 'border-mf-green/60' : 'border-mf-orange/60',
          visible ? 'opacity-100' : 'opacity-0',
        )}
      >
        <div className="flex items-center gap-2 text-xs mb-1.5">
          {isRunning && <FiLoader size={12} className="text-mf-orange animate-spin" />}
          {isDone && <FiCheckCircle size={12} className="text-mf-green" />}
          {isError && <FiAlertTriangle size={12} className="text-mf-red" />}
          <span className="font-semibold text-mf-text">
            {isRunning ? 'Simülasyon' : isDone ? 'Tamamlandı' : 'Hata'}
          </span>
          <span className="flex-1" />
          {iter && isRunning && <span className="font-mono text-mf-text-dark tabular">{iter}</span>}
          <span className="font-mono text-mf-text-dim tabular">{Math.round(progress)}%</span>
        </div>

        <div className="w-full h-1.5 bg-mf-bg rounded-full overflow-hidden">
          <div
            className={clsx('h-full rounded-full transition-all duration-base', barColor)}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>

        {/* Canlı residual sparkline — CFD yakınsaması */}
        {residuals.length > 1 && (
          <div className="mt-1.5">
            <div className="flex items-center justify-between text-[10px] text-mf-text-dark mb-0.5">
              <span>log₁₀ residual</span>
              <span className="font-mono tabular">
                {residuals[residuals.length - 1].toExponential(1)}
              </span>
            </div>
            <Sparkline values={residuals} />
          </div>
        )}

        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-mf-text-dim leading-snug">
          <span className="line-clamp-1 flex-1">
            {isError
              ? (error ?? 'Bilinmeyen hata')
              : progressMessage || (isDone ? 'Simülasyon tamamlandı' : 'Çalışıyor...')}
          </span>
          {eta != null && (
            <span className="font-mono text-mf-text-dark tabular flex-shrink-0">
              ~{formatEta(eta)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

function formatEta(sec: number): string {
  if (sec < 1) return '<1sn';
  if (sec < 60) return `${Math.ceil(sec)}sn`;
  const m = Math.floor(sec / 60);
  const s = Math.ceil(sec % 60);
  return `${m}dk ${s}sn`;
}

/** Minik inline residual sparkline (log₁₀ ölçek). */
const Sparkline: React.FC<{ values: number[] }> = ({ values }) => {
  const W = 280,
    H = 26;
  const logs = values.map((v) => Math.log10(Math.max(v, 1e-12)));
  let min = Math.min(...logs);
  let max = Math.max(...logs);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = -12;
    max = 0;
  }
  const range = max - min || 1;
  const pts = logs
    .map((l, i) => {
      const x = logs.length > 1 ? (i / (logs.length - 1)) * W : 0;
      const y = H - 2 - ((l - min) / range) * (H - 4); // yüksek residual → üstte
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <polyline
        points={pts}
        fill="none"
        stroke={CHART_SERIES.residual}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
};

export default ProgressOverlay;
