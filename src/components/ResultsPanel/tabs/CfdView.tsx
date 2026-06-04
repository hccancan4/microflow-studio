/**
 * CfdView — CFD sonuç görünümü: metrik kartları, colormap legend, residual
 * yakınsama grafiği ve (deney verisi linkliyse) hata haritası.
 * Davranış ResultsPanel.tsx'ten birebir taşındı.
 */
import React, { useMemo } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line,
} from 'recharts';
import { useSimulationStore } from '../../../stores/useSimulationStore';
import { useExperimentStore } from '../../../stores/useExperimentStore';
import { colormapCssGradient, colormap as colormapEval } from '../../../utils/colormaps';
import { TOKENS, CHART_SERIES } from '../../../theme/tokens';
import { MetricCard, AXIS_TICK, TOOLTIP_STYLE } from '../shared';
import type { CfdField, ColormapType, ExperimentDataSet } from '../../../types';

export const CfdView: React.FC<{
  field: CfdField;
  summary: { maxVelocity: number; minPressure: number; maxPressure: number; totalFlowRate: number };
  colormap: ColormapType;
  fieldType: 'magnitude' | 'pressure' | 'wallShear';
}> = ({ field, summary, colormap, fieldType }) => {
  const fieldLabel  = fieldType === 'pressure' ? 'Basınç' : fieldType === 'wallShear' ? 'Duvar kesme' : 'Hız büyüklüğü';
  const fieldUnit   = fieldType === 'magnitude' ? 'm/s' : 'Pa';
  const src = fieldType === 'pressure' ? field.pressure
            : fieldType === 'wallShear' ? field.wallShear
            : field.magnitude;

  // Aktif CFD hedefine bağlı 2D velocity deney seti var mı?
  const cfdTargetId    = useSimulationStore((s) => s.cfdTargetComponentId);
  const datasets       = useExperimentStore((s) => s.datasets);
  const visibleIds     = useExperimentStore((s) => s.visibleIds);
  const linkedCompId   = useExperimentStore((s) => s.linkedComponentId);
  const errorMapDatasets = useMemo(() => {
    if (!cfdTargetId) return [] as ExperimentDataSet[];
    return datasets.filter((d) =>
      d.dataType === 'velocity'
      && visibleIds.has(d.id)
      && linkedCompId[d.id] === cfdTargetId
      && d.points.some((p) => p.y !== 0)      // 2D nokta var
    );
  }, [datasets, visibleIds, linkedCompId, cfdTargetId]);
  const [fmin, fmax] = useMemo(() => {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < src.length; i++) { const v = src[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    if (!Number.isFinite(mn)) mn = 0;
    if (!Number.isFinite(mx)) mx = 1;
    return [mn, mx];
  }, [src]);

  const residualData = (field.residuals ?? []).map((r, i) => ({
    iter: i * 5, // residuals her 5 iterasyonda bir kaydediliyor (cfd.rs)
    res: Math.max(r, 1e-12),
    log: Math.log10(Math.max(r, 1e-12)),
  }));

  return (
    <div className="grid grid-cols-4 gap-2 p-3 h-full overflow-auto">
      <MetricCard label="Maks. Hız"  value={`${(summary.maxVelocity * 1000).toFixed(3)} mm/s`} color="blue" />
      <MetricCard label="Debi"       value={`${summary.totalFlowRate.toFixed(3)} μL/min`}       color="green" />
      <MetricCard label="Basınç ∆"   value={`${(summary.maxPressure - summary.minPressure).toFixed(2)} Pa`} color="orange" />
      <MetricCard label="İterasyon"  value={`${field.iterations}${field.converged ? ' ✓' : ''}`} color={field.converged ? 'green' : 'orange'} />

      <MetricCard label="Grid"               value={`${field.width}×${field.height}`}  color="blue" />
      <MetricCard label="Son residual"       value={(field.residuals?.slice(-1)[0] ?? 0).toExponential(2)} color="orange" />
      <MetricCard label={`${fieldLabel} min`} value={`${fmin.toExponential(2)} ${fieldUnit}`} color="blue" />
      <MetricCard label={`${fieldLabel} max`} value={`${fmax.toExponential(2)} ${fieldUnit}`} color="blue" />

      {/* Colormap legend */}
      <div className="col-span-4 bg-mf-bg rounded border border-mf-border p-2">
        <div className="flex items-center justify-between mb-1 text-xs text-mf-text-dim">
          <span>{fieldLabel} ({fieldUnit}) — {colormap}</span>
          <span className="font-mono">{fmin.toExponential(2)} … {fmax.toExponential(2)}</span>
        </div>
        <div
          className="h-3 rounded"
          style={{ background: colormapCssGradient(colormap, 24) }}
        />
      </div>

      {/* Residual grafiği */}
      {residualData.length > 1 && (
        <div className="col-span-4 bg-mf-bg rounded border border-mf-border p-2" style={{ height: 200 }}>
          <div className="text-xs text-mf-text-dim mb-1">Yakınsama — log₁₀(residual) vs iterasyon</div>
          <ResponsiveContainer width="100%" height="88%">
            <LineChart data={residualData} margin={{ top: 4, right: 12, bottom: 22, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={TOKENS.chartGrid} />
              <XAxis dataKey="iter" tick={AXIS_TICK}
                label={{ value: 'iterasyon', position: 'insideBottom', offset: -8, fontSize: 10, fill: TOKENS.chartAxis }} />
              <YAxis tick={AXIS_TICK}
                label={{ value: 'log₁₀|∇·u|', angle: -90, position: 'insideLeft', fontSize: 10, fill: TOKENS.chartAxis }} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number | string) => [`${Number(v).toFixed(2)}`, 'log₁₀(res)']}
              />
              <Line type="monotone" dataKey="log" stroke={CHART_SERIES.residual} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Hata haritası — CFD hedefine linkli 2D velocity dataset varsa */}
      {errorMapDatasets.map((d) => (
        <ErrorMapPanel key={d.id} field={field} dataset={d} colormap={colormap} />
      ))}
    </div>
  );
};

// ─── Error Map: sim field sampled at deney points → hata renkli scatter ───
const ErrorMapPanel: React.FC<{
  field: CfdField;
  dataset: ExperimentDataSet;
  colormap: ColormapType;
}> = ({ field, dataset, colormap }) => {
  // Sim field domain: x ∈ [0, width*dx), y ∈ [-height*dy/2, +height*dy/2]
  // (CFD 2D straight channel — y=0 merkez)
  const domainW = field.width * field.dx;
  const domainH = field.height * field.dy;
  const yOffset = domainH / 2; // deney y=0 çizgi merkezini varsayarız

  // Sim magnitude değerini (x_local, y_local) için bilineer enterpole et.
  const sampleSim = (xl: number, yl: number): number => {
    const gx = xl / field.dx;
    const gy = (yl + yOffset) / field.dy;
    if (gx < 0 || gx > field.width - 1 || gy < 0 || gy > field.height - 1) return NaN;
    const i0 = Math.floor(gx), j0 = Math.floor(gy);
    const i1 = Math.min(field.width - 1, i0 + 1);
    const j1 = Math.min(field.height - 1, j0 + 1);
    const tx = gx - i0, ty = gy - j0;
    const idx = (i: number, j: number) => j * field.width + i;
    const v00 = field.magnitude[idx(i0, j0)];
    const v10 = field.magnitude[idx(i1, j0)];
    const v01 = field.magnitude[idx(i0, j1)];
    const v11 = field.magnitude[idx(i1, j1)];
    return (1 - tx) * (1 - ty) * v00 + tx * (1 - ty) * v10
         + (1 - tx) * ty       * v01 + tx * ty       * v11;
  };

  // Her deney noktası: (x, y, expVal, simVal, error)
  const samples = useMemo(() => {
    const rows = dataset.points.map((p) => {
      const sim = sampleSim(p.x, p.y);
      const err = sim - p.value;
      return { x: p.x, y: p.y, exp: p.value, sim, err };
    }).filter((r) => Number.isFinite(r.sim));
    return rows;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, field]);

  const expArr = samples.map((s) => s.exp);
  // Basit metrik: RMSE + meanAbsPct + R²
  const m = useMemo(() => {
    if (samples.length === 0) return null;
    let sumExp = 0; for (const v of expArr) sumExp += v;
    const meanExp = sumExp / samples.length;
    let ssr = 0, ssTot = 0, sumPct = 0, usedPct = 0, maxAbs = 0;
    for (let i = 0; i < samples.length; i++) {
      const e = samples[i].err;
      ssr += e * e;
      const d = expArr[i] - meanExp; ssTot += d * d;
      if (Math.abs(expArr[i]) > 1e-12) { sumPct += Math.abs(e) / Math.abs(expArr[i]); usedPct++; }
      if (Math.abs(e) > maxAbs) maxAbs = Math.abs(e);
    }
    return {
      rmse: Math.sqrt(ssr / samples.length),
      r2:   ssTot > 0 ? 1 - ssr / ssTot : NaN,
      mape: usedPct > 0 ? (sumPct / usedPct) * 100 : NaN,
      maxAbs,
      n: samples.length,
    };
  }, [samples, expArr]);

  if (samples.length === 0) {
    return (
      <div className="col-span-4 bg-mf-bg rounded border border-mf-border p-2">
        <div className="text-xs text-mf-text-dim">
          <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: dataset.color }} />
          {dataset.name} — deney noktaları CFD domaini dışında, hata haritası üretilemedi.
        </div>
      </div>
    );
  }

  // Hata büyüklüğü ile renklendirme aralığı
  const maxAbsErr = Math.max(1e-12, ...samples.map((s) => Math.abs(s.err)));
  const svgW = 420, svgH = 160;

  return (
    <div className="col-span-4 bg-mf-bg rounded border border-mf-border p-2">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-mf-text-dim">
          <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: dataset.color }} />
          Hata haritası — <b>{dataset.name}</b> (sim − deney, |Δ|<sub>max</sub> = {maxAbsErr.toExponential(2)} m/s)
        </div>
        {m && (
          <div className="flex gap-3 text-[10px] text-mf-text-dim font-mono">
            <span>n={m.n}</span>
            <span>R²={Number.isFinite(m.r2) ? m.r2.toFixed(3) : '—'}</span>
            <span>RMSE={m.rmse.toExponential(2)}</span>
            <span>MAPE={Number.isFinite(m.mape) ? `${m.mape.toFixed(2)}%` : '—'}</span>
          </div>
        )}
      </div>
      <svg width="100%" height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ background: TOKENS.bg }}>
        {/* Domain sınırı */}
        <rect x="8" y="8" width={svgW - 16} height={svgH - 16} fill="none"
              stroke={TOKENS.chartGrid} strokeWidth="1" strokeDasharray="2 4" />
        {samples.map((s, i) => {
          const nx = s.x / domainW;                    // 0..1
          const ny = (s.y + yOffset) / domainH;        // 0..1
          const px = 8 + nx * (svgW - 16);
          const py = svgH - 8 - ny * (svgH - 16);
          const t = Math.min(1, Math.abs(s.err) / maxAbsErr);
          const [r, g, b] = colormapEval(t, colormap);
          return (
            <circle
              key={i} cx={px} cy={py} r={4.5}
              fill={`rgb(${r},${g},${b})`}
              stroke="#000" strokeWidth="0.5"
            >
              <title>{`x=${s.x.toFixed(1)}μm, y=${s.y.toFixed(1)}μm
sim=${s.sim.toExponential(3)} m/s
exp=${s.exp.toExponential(3)} m/s
Δ=${s.err.toExponential(3)} m/s`}</title>
            </circle>
          );
        })}
        {/* Legend */}
        <g transform={`translate(${svgW - 120}, ${svgH - 14})`}>
          <text x="0" y="-2" fontSize="9" fill={TOKENS.chartAxis}>|hata|: 0</text>
          <text x="108" y="-2" fontSize="9" fill={TOKENS.chartAxis} textAnchor="end">{maxAbsErr.toExponential(1)}</text>
          <rect x="0" y="0" width="108" height="6"
                fill="url(#errgrad)" stroke={TOKENS.chartGrid} strokeWidth="0.5" />
        </g>
        <defs>
          <linearGradient id="errgrad" x1="0" y1="0" x2="1" y2="0">
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const [r, g, b] = colormapEval(t, colormap);
              return <stop key={t} offset={`${t * 100}%`} stopColor={`rgb(${r},${g},${b})`} />;
            })}
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
};
