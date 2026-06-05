/**
 * SweepTab — parametrik tarama sonuçları: canlı ilerleme/iptal, metrik seçimli
 * çizgi grafiği, sonuç tablosu, CSV dışa aktarma. Davranış birebir taşındı.
 */
import React, { useState } from 'react';
import clsx from 'clsx';
import { FiXCircle, FiCheckCircle, FiDownload, FiTrash2 } from 'react-icons/fi';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { useSweepStore } from '../../../stores/useSweepStore';
import { sweepResultsToCsv } from '../../../utils/sweepRunner';
import { toast } from '../../../stores/useUiStore';
import { TOKENS, CHART_SERIES } from '../../../theme/tokens';
import { AXIS_TICK, TOOLTIP_STYLE } from '../shared';

export const SweepTab: React.FC = () => {
  const config = useSweepStore((s) => s.config);
  const runs = useSweepStore((s) => s.runs);
  const running = useSweepStore((s) => s.running);
  const progress = useSweepStore((s) => s.progress);
  const currentIndex = useSweepStore((s) => s.currentIndex);
  const requestCancel = useSweepStore((s) => s.requestCancel);
  const reset = useSweepStore((s) => s.reset);

  const [metric, setMetric] = useState<
    'totalFlowRate' | 'maxPressure' | 'maxReynolds' | 'componentPressureDrop'
  >('totalFlowRate');

  if (!config) {
    return <div className="text-mf-text-dim text-sm">Tarama verisi yok.</div>;
  }

  const chartData = runs.map((r) => ({
    x: r.paramValue,
    totalFlowRate: r.totalFlowRate,
    maxPressure: r.maxPressure,
    maxReynolds: r.maxReynolds,
    componentPressureDrop: r.componentPressureDrop ?? 0,
  }));

  const metricLabel: Record<typeof metric, string> = {
    totalFlowRate: 'Toplam Debi (μL/min)',
    maxPressure: 'Maks Basınç (Pa)',
    maxReynolds: 'Maks Re',
    componentPressureDrop: 'Bileşen ΔP (Pa)',
  } as const;

  const handleExportCsv = async () => {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      const path = await save({
        defaultPath: `sweep_${config.componentLabel}_${config.paramKey}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (!path) return;
      const csv = sweepResultsToCsv(config, runs);
      await writeTextFile(path, csv);
      toast.success(`CSV dışa aktarıldı: ${path}`);
    } catch (e) {
      toast.error(`CSV dışa aktarma hatası: ${e}`);
    }
  };

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Başlık + kontroller */}
      <div className="flex items-center justify-between gap-2 flex-shrink-0">
        <div className="text-xs text-mf-text-dim">
          <span className="text-mf-text font-semibold">{config.componentLabel}</span>
          {' · '}
          <span>{config.paramLabel}</span>
          {' · '}
          <span>
            {config.start.toFixed(2)} → {config.end.toFixed(2)} {config.unit}
          </span>
          {' · '}
          <span>{config.steps} adım</span>
        </div>
        <div className="flex items-center gap-2">
          {running && (
            <>
              <div className="text-xs text-mf-text-dim">
                {currentIndex}/{config.steps} ({Math.round(progress * 100)}%)
              </div>
              <button
                onClick={requestCancel}
                className="flex items-center gap-1 px-2 py-0.5 text-xs text-mf-orange hover:text-orange-400 border border-mf-orange/40 rounded"
                title="Taramayı durdur"
              >
                <FiXCircle size={11} /> İptal
              </button>
            </>
          )}
          {!running && runs.length > 0 && (
            <>
              {/* Tamamlanma durumu */}
              <span className="flex items-center gap-1 text-xs text-mf-green">
                <FiCheckCircle size={11} /> {runs.length} koşu
              </span>
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-1 px-2 py-0.5 text-xs text-mf-blue hover:text-mf-cyan border border-mf-blue/40 rounded-ds-sm"
                title="CSV dışa aktar"
              >
                <FiDownload size={11} /> CSV
              </button>
              <button
                onClick={reset}
                className="flex items-center gap-1 px-2 py-0.5 text-xs text-mf-text-dim hover:text-mf-red border border-mf-border rounded"
                title="Tarama verisini temizle"
              >
                <FiTrash2 size={11} /> Temizle
              </button>
            </>
          )}
        </div>
      </div>

      {/* İlerleme çubuğu (çalışırken) */}
      {running && (
        <div className="w-full h-1 bg-mf-bg rounded-full overflow-hidden flex-shrink-0">
          <div
            className="h-full bg-mf-blue transition-all duration-200"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}

      {/* Grafik + tablo yan yana */}
      <div className="flex-1 grid grid-cols-[1.3fr_1fr] gap-2 min-h-0">
        <div className="bg-mf-bg border border-mf-border rounded flex flex-col min-h-0">
          <div className="px-2 py-1 text-xs text-mf-text-dim border-b border-mf-border flex items-center justify-between">
            <span>
              {config.paramLabel} vs {metricLabel[metric]}
            </span>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as typeof metric)}
              className="mf-input text-xs py-0.5"
            >
              <option value="totalFlowRate">Toplam Debi</option>
              <option value="maxPressure">Maks Basınç</option>
              <option value="maxReynolds">Maks Re</option>
              <option value="componentPressureDrop">Bileşen ΔP</option>
            </select>
          </div>
          <div className="flex-1 min-h-0 p-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 22, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={TOKENS.chartGrid} />
                <XAxis
                  dataKey="x"
                  type="number"
                  domain={['auto', 'auto']}
                  tick={AXIS_TICK}
                  label={{
                    value: `${config.paramLabel} (${config.unit})`,
                    position: 'insideBottom',
                    offset: -8,
                    fill: TOKENS.chartAxis,
                    fontSize: 10,
                  }}
                />
                <YAxis
                  tick={AXIS_TICK}
                  label={{
                    value: metricLabel[metric],
                    angle: -90,
                    position: 'insideLeft',
                    fill: TOKENS.chartAxis,
                    fontSize: 10,
                  }}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(v: number | string) =>
                    `${config.paramLabel}: ${Number(v).toFixed(3)} ${config.unit}`
                  }
                />
                <Line
                  type="monotone"
                  dataKey={metric}
                  stroke={CHART_SERIES.flow}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sonuç tablosu */}
        <div className="bg-mf-bg border border-mf-border rounded flex flex-col min-h-0">
          <div className="px-2 py-1 text-xs text-mf-text-dim border-b border-mf-border">
            Sonuçlar ({runs.length})
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs font-mono">
              <thead className="sticky top-0 bg-mf-bg">
                <tr className="text-mf-text-dim border-b border-mf-border">
                  <th className="px-2 py-1 text-left">{config.paramLabel}</th>
                  <th className="px-2 py-1 text-right">Debi</th>
                  <th className="px-2 py-1 text-right">Maks P</th>
                  <th className="px-2 py-1 text-right">Maks Re</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r, i) => (
                  <tr
                    key={i}
                    className={clsx('border-b border-mf-border/50', r.error && 'text-mf-red')}
                  >
                    <td className="px-2 py-1 text-mf-text">{r.paramValue.toFixed(3)}</td>
                    <td className="px-2 py-1 text-right text-mf-green">
                      {r.totalFlowRate.toFixed(3)}
                    </td>
                    <td className="px-2 py-1 text-right text-mf-orange">
                      {r.maxPressure.toFixed(1)}
                    </td>
                    <td className="px-2 py-1 text-right text-mf-blue">
                      {r.maxReynolds.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
