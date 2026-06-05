/**
 * ResultsPanel/shared — sekmeler arası paylaşılan küçük bileşenler ve
 * recharts tema sabitleri. Tek kaynak: tüm sekmeler buradan tüketir.
 */
import React from 'react';
import clsx from 'clsx';
import { TOKENS } from '../../theme/tokens';
import type { ExperimentDataSet } from '../../types';
import type { computeMetrics } from '../../features/experiment/experimentMetrics';

// ── Ortak recharts tema sabitleri (token-güdümlü) ─────────────────────────
export const AXIS_TICK = { fontSize: 10, fill: TOKENS.chartAxis } as const;
export const TOOLTIP_STYLE = {
  background: TOKENS.chartTooltipBg,
  border: `1px solid ${TOKENS.chartTooltipBorder}`,
  borderRadius: 4,
  fontSize: 11,
} as const;

export const MetricCard: React.FC<{ label: string; value: string; color: 'blue' | 'green' | 'orange' }> = ({ label, value, color }) => {
  const c = { blue: 'text-mf-blue', green: 'text-mf-green', orange: 'text-mf-orange' }[color];
  return (
    <div className="bg-mf-bg rounded border border-mf-border p-2">
      <div className="text-xs text-mf-text-dark mb-1">{label}</div>
      <div className={clsx('text-sm font-mono font-semibold', c)}>{value}</div>
    </div>
  );
};

export const MiniMetric: React.FC<{ label: string; value: string; color: 'blue' | 'green' | 'orange' }> = ({ label, value, color }) => {
  const c = { blue: 'text-mf-blue', green: 'text-mf-green', orange: 'text-mf-orange' }[color];
  return (
    <div className="bg-mf-surface rounded px-1.5 py-1 border border-mf-border/50">
      <div className="text-[10px] text-mf-text-dark">{label}</div>
      <div className={clsx('text-xs font-mono font-semibold truncate', c)}>{value}</div>
    </div>
  );
};

// Metrik kartı — R², RMSE, MAPE, n
export const MetricsCard: React.FC<{
  dataset: ExperimentDataSet;
  metrics: ReturnType<typeof computeMetrics>;
}> = ({ dataset, metrics }) => {
  const goodR2 = Number.isFinite(metrics.rSquared) && metrics.rSquared > 0.9;
  const fmtR2 = Number.isFinite(metrics.rSquared) ? metrics.rSquared.toFixed(4) : '—';
  const fmtRmse = Number.isFinite(metrics.rmse) ? metrics.rmse.toExponential(2) : '—';
  const fmtMape = Number.isFinite(metrics.meanAbsPctError) ? `${metrics.meanAbsPctError.toFixed(2)}%` : '—';

  return (
    <div className="bg-mf-bg border border-mf-border rounded p-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="inline-block w-3 h-3 rounded-full" style={{ background: dataset.color }} />
        <span className="text-xs font-semibold text-mf-text">{dataset.name}</span>
        <span className="text-[10px] text-mf-text-dark">· {metrics.n} nokta</span>
      </div>
      <div className="grid grid-cols-4 gap-1 text-xs">
        <MiniMetric label="R²" value={fmtR2} color={goodR2 ? 'green' : 'orange'} />
        <MiniMetric label="RMSE" value={fmtRmse} color="blue" />
        <MiniMetric label="MAPE" value={fmtMape} color="orange" />
        <MiniMetric label="|Δ|max" value={Number.isFinite(metrics.maxAbsError) ? metrics.maxAbsError.toExponential(2) : '—'} color="orange" />
      </div>
    </div>
  );
};

export const ToggleChip: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={clsx(
      'px-2 py-0.5 rounded text-xs border transition-colors',
      active
        ? 'bg-mf-blue/20 border-mf-blue text-mf-blue'
        : 'border-mf-border text-mf-text-dim hover:border-mf-blue/50'
    )}
  >
    {label}
  </button>
);

export const TabBtn: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }> = ({ active, onClick, icon, children }) => (
  <button
    onClick={onClick}
    className={clsx(
      'flex items-center gap-1 px-2 py-0.5 rounded text-xs border transition-colors',
      active
        ? 'bg-mf-blue/20 border-mf-blue text-mf-blue'
        : 'border-mf-border text-mf-text-dim hover:border-mf-blue/50'
    )}
  >
    {icon}
    <span>{children}</span>
  </button>
);

export const ChartCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-mf-bg border border-mf-border rounded flex flex-col min-h-0">
    <div className="px-2 py-1 text-xs text-mf-text-dim border-b border-mf-border">{title}</div>
    <div className="flex-1 min-h-0">{children}</div>
  </div>
);
