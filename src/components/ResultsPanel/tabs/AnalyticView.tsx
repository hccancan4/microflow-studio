/**
 * AnalyticView — analitik sonuç sekmeleri (Özet / Bileşenler / Grafik / Profil /
 * Deney) ve aralarındaki yönlendirme. ResultsPanel bu görünümü `tab`'a göre
 * monte eder. Davranış ResultsPanel.tsx'ten birebir taşındı.
 */
import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { FiEye, FiEyeOff, FiTrash2 } from 'react-icons/fi';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Line,
  ReferenceLine,
  Scatter,
} from 'recharts';
import { useDesignStore } from '../../../stores/useDesignStore';
import { useExperimentStore } from '../../../features/experiment/useExperimentStore';
import { computeMetrics } from '../../../features/experiment/experimentMetrics';
import { TOKENS, CHART_SERIES } from '../../../theme/tokens';
import { confirmAsync } from '../../../stores/useUiStore';
import { MetricCard, MetricsCard, ChartCard, AXIS_TICK, TOOLTIP_STYLE } from '../shared';
import type {
  AnalyticResult,
  VelocityProfile,
  SimulationResult,
  ExperimentDataSet,
} from '../../../types';

export type TabKey =
  | 'summary'
  | 'components'
  | 'charts'
  | 'profile'
  | 'experiment'
  | 'validation'
  | 'sweep';

export const AnalyticView: React.FC<{
  result: SimulationResult;
  tab: TabKey;
  selectedIds: string[];
}> = ({ result, tab, selectedIds }) => {
  const analytics: AnalyticResult[] = result.analyticResults ?? [];
  const profiles: VelocityProfile[] = result.velocityProfiles ?? [];

  // Bileşen-dostu etiket üret
  const components = useDesignStore((s) => s.components);
  const nameFor = useMemo(() => {
    const m = new Map<string, string>();
    components.forEach((c) => {
      const short = c.id.slice(-5);
      m.set(c.id, c.label ?? `${c.type.replace(/_/g, ' ')} #${short}`);
    });
    return (id: string) => m.get(id) ?? id.slice(0, 8);
  }, [components]);

  // Port/rezervuar gibi R=0 bileşenleri bazı görünümlerden filtrele
  const meaningful = analytics.filter((r) => r.resistance > 1e3);

  return (
    <div className="h-full px-3 py-2">
      {tab === 'summary' && <SummaryTab result={result} />}
      {tab === 'components' && (
        <ComponentsTab analytics={analytics} nameFor={nameFor} selectedIds={selectedIds} />
      )}
      {tab === 'charts' && <ChartsTab analytics={meaningful} nameFor={nameFor} />}
      {tab === 'profile' && (
        <ProfileTab profiles={profiles} nameFor={nameFor} selectedIds={selectedIds} />
      )}
      {tab === 'experiment' && <ExperimentTab profiles={profiles} nameFor={nameFor} />}
    </div>
  );
};

// ── Sekme 1: Özet ──────────────────────────────────────────────────────────
const SummaryTab: React.FC<{ result: SimulationResult }> = ({ result }) => {
  const paths = result.networkPaths ?? [];
  const analytics: AnalyticResult[] = result.analyticResults ?? [];
  const mixers = analytics.filter((r) => r.mixingEfficiency !== undefined);
  const curves = analytics.filter((r) => r.deanNumber !== undefined);
  const maxRe = analytics.reduce((m, r) => Math.max(m, r.reynoldsNumber), 0);
  const regime =
    maxRe < 1
      ? 'Stokes akış (Re < 1)'
      : maxRe < 100
        ? 'Düşük Re laminar'
        : maxRe < 2000
          ? 'Laminar'
          : 'Türbülanslı (!)';
  const regimeColor =
    maxRe < 100 ? 'text-mf-green' : maxRe < 2000 ? 'text-mf-blue' : 'text-mf-orange';

  return (
    <div className="grid grid-cols-4 gap-2">
      <MetricCard
        label="Maks. Hız"
        value={`${(result.summary.maxVelocity * 1000).toFixed(3)} mm/s`}
        color="blue"
      />
      <MetricCard
        label="Toplam Debi"
        value={`${result.summary.totalFlowRate.toFixed(3)} μL/min`}
        color="green"
      />
      <MetricCard
        label="Maks. Basınç"
        value={`${result.summary.maxPressure.toFixed(1)} Pa`}
        color="orange"
      />
      <MetricCard
        label="Min. Basınç"
        value={`${result.summary.minPressure.toFixed(1)} Pa`}
        color="orange"
      />

      <MetricCard label="Bileşen" value={`${analytics.length}`} color="blue" />
      <MetricCard label="Ağ Yolu" value={`${paths.length}`} color="green" />
      <MetricCard label="Maks. Re" value={maxRe.toFixed(3)} color="blue" />
      <div className="bg-mf-bg rounded border border-mf-border p-2">
        <div className="text-xs text-mf-text-dark mb-1">Akış Rejimi</div>
        <div className={clsx('text-sm font-mono font-semibold', regimeColor)}>{regime}</div>
      </div>

      {/* Mikser/eğri bileşen varsa ek metrikler */}
      {mixers.length > 0 && (
        <div className="col-span-4 mt-2">
          <div className="text-xs text-mf-text-dim mb-1 font-semibold uppercase tracking-wider">
            Serpantin Mikserler
          </div>
          <div className="grid grid-cols-4 gap-2">
            {mixers.map((m) => (
              <div key={m.componentId} className="bg-mf-bg rounded border border-mf-border p-2">
                <div className="text-xs text-mf-text-dark mb-1 truncate">
                  {m.componentId.slice(-8)}
                </div>
                <div className="text-sm font-mono font-semibold text-mf-green">
                  η = {(m.mixingEfficiency! * 100).toFixed(1)}%
                </div>
                <div className="w-full h-1 bg-mf-bg mt-1 rounded overflow-hidden">
                  <div
                    className="h-full bg-mf-green"
                    style={{ width: `${m.mixingEfficiency! * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {curves.length > 0 && (
        <div className="col-span-4 mt-2">
          <div className="text-xs text-mf-text-dim mb-1 font-semibold uppercase tracking-wider">
            Eğri Kanallar (Dean sayısı)
          </div>
          <div className="grid grid-cols-4 gap-2">
            {curves.map((c) => (
              <div key={c.componentId} className="bg-mf-bg rounded border border-mf-border p-2">
                <div className="text-xs text-mf-text-dark mb-1 truncate">
                  {c.componentId.slice(-8)}
                </div>
                <div className="text-sm font-mono font-semibold text-mf-blue">
                  De = {c.deanNumber!.toFixed(3)}
                </div>
                <div className="text-[10px] text-mf-text-dark mt-0.5">
                  {c.deanNumber! > 10 ? 'Dean girdapları beklenir' : 'Eksenel akış baskın'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Sekme 2: Bileşenler tablosu ────────────────────────────────────────────
const ComponentsTab: React.FC<{
  analytics: AnalyticResult[];
  nameFor: (id: string) => string;
  selectedIds: string[];
}> = ({ analytics, nameFor, selectedIds }) => (
  <table className="w-full text-xs">
    <thead>
      <tr className="text-mf-text-dark border-b border-mf-border">
        <th className="text-left py-1 pr-3">Bileşen</th>
        <th className="text-right py-1 pr-3">Debi (μL/min)</th>
        <th className="text-right py-1 pr-3">ΔP (Pa)</th>
        <th className="text-right py-1 pr-3">Re</th>
        <th className="text-right py-1 pr-3">De</th>
        <th className="text-right py-1 pr-3">η</th>
        <th className="text-right py-1">Direnç (Pa·s/m³)</th>
      </tr>
    </thead>
    <tbody>
      {analytics.map((r) => (
        <tr
          key={r.componentId}
          className={clsx(
            'border-b border-mf-border/50',
            selectedIds.includes(r.componentId) ? 'bg-mf-blue/10' : 'hover:bg-mf-bg/50',
          )}
        >
          <td className="py-1 pr-3 font-mono text-mf-text-dim">{nameFor(r.componentId)}</td>
          <td className="py-1 pr-3 text-right text-mf-blue">{r.flowRate.toFixed(4)}</td>
          <td className="py-1 pr-3 text-right text-mf-orange">{r.pressureDrop.toFixed(2)}</td>
          <td className="py-1 pr-3 text-right text-mf-text">{r.reynoldsNumber.toFixed(4)}</td>
          <td className="py-1 pr-3 text-right text-mf-text">
            {r.deanNumber !== undefined ? r.deanNumber.toFixed(3) : '—'}
          </td>
          <td className="py-1 pr-3 text-right text-mf-green">
            {r.mixingEfficiency !== undefined ? `${(r.mixingEfficiency * 100).toFixed(1)}%` : '—'}
          </td>
          <td className="py-1 text-right text-mf-text-dim">{r.resistance.toExponential(2)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

// ── Sekme 3: Grafikler ─────────────────────────────────────────────────────
const ChartsTab: React.FC<{
  analytics: AnalyticResult[];
  nameFor: (id: string) => string;
}> = ({ analytics, nameFor }) => {
  const data = analytics.map((r) => ({
    id: r.componentId,
    name: nameFor(r.componentId).slice(0, 14),
    debi: Number(r.flowRate.toFixed(4)),
    basinc: Number(r.pressureDrop.toFixed(2)),
    re: Number(r.reynoldsNumber.toFixed(4)),
  }));

  if (data.length === 0) {
    return (
      <div className="text-xs text-mf-text-dark italic p-4 text-center">
        Grafik çizmek için yeterli bileşen yok.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 h-full">
      <ChartCard title="Debi dağılımı (μL/min)">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 24, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={TOKENS.chartGrid} />
            <XAxis dataKey="name" tick={AXIS_TICK} angle={-20} textAnchor="end" height={40} />
            <YAxis tick={AXIS_TICK} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="debi" fill={CHART_SERIES.flow} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Basınç düşümü (Pa)">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 24, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={TOKENS.chartGrid} />
            <XAxis dataKey="name" tick={AXIS_TICK} angle={-20} textAnchor="end" height={40} />
            <YAxis tick={AXIS_TICK} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="basinc" fill={CHART_SERIES.pressure} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Reynolds sayısı">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 24, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={TOKENS.chartGrid} />
            <XAxis dataKey="name" tick={AXIS_TICK} angle={-20} textAnchor="end" height={40} />
            <YAxis tick={AXIS_TICK} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <ReferenceLine
              y={2000}
              stroke={TOKENS.active}
              strokeDasharray="4 2"
              label={{ value: 'türbülans eşiği', fill: TOKENS.active, fontSize: 9 }}
            />
            <Bar dataKey="re" fill={CHART_SERIES.reynolds} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Direnç (Pa·s/m³, log ölçek)">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data.map((d, i) => ({ ...d, r: Math.log10(analytics[i].resistance || 1) }))}
            margin={{ top: 8, right: 8, bottom: 24, left: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={TOKENS.chartGrid} />
            <XAxis dataKey="name" tick={AXIS_TICK} angle={-20} textAnchor="end" height={40} />
            <YAxis
              tick={AXIS_TICK}
              label={{
                value: 'log₁₀(R)',
                angle: -90,
                position: 'insideLeft',
                fontSize: 10,
                fill: TOKENS.chartAxis,
              }}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: number | string) => [`10^${Number(v).toFixed(2)}`, 'Direnç']}
            />
            <Bar dataKey="r" fill={CHART_SERIES.resistance} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
};

// ── Sekme 4: Hız profili (parabolik) + deney overlay ───────────────────────
const ProfileTab: React.FC<{
  profiles: VelocityProfile[];
  nameFor: (id: string) => string;
  selectedIds: string[];
}> = ({ profiles, nameFor, selectedIds }) => {
  const defaultId =
    profiles.find((p) => selectedIds.includes(p.component_id))?.component_id ??
    profiles[0]?.component_id;
  const [activeId, setActiveId] = useState<string | undefined>(defaultId);
  const active = profiles.find((p) => p.component_id === (activeId ?? defaultId));

  // Deney verisi (velocity tipinde, aktif bileşene linklenmiş)
  const datasets = useExperimentStore((s) => s.datasets);
  const visibleIds = useExperimentStore((s) => s.visibleIds);
  const linkedComponentId = useExperimentStore((s) => s.linkedComponentId);

  const linkedVelocityDatasets = useMemo(() => {
    if (!active) return [] as ExperimentDataSet[];
    return datasets.filter(
      (d) =>
        d.dataType === 'velocity' &&
        visibleIds.has(d.id) &&
        linkedComponentId[d.id] === active.component_id,
    );
  }, [datasets, visibleIds, linkedComponentId, active]);

  if (profiles.length === 0) {
    return (
      <div className="text-xs text-mf-text-dark italic p-4 text-center">
        Hız profili için geometri bilgisi yok.
      </div>
    );
  }

  // Sim eğrisi — mm/s cinsinden y = y_um, v = velocity*1000
  const simLine = active
    ? active.points.map((pt) => ({
        y: Number(pt.y_um.toFixed(1)),
        v: Number((pt.velocity * 1000).toFixed(4)),
      }))
    : [];
  const simX = active?.points.map((pt) => pt.y_um) ?? [];
  const simY_mm = active?.points.map((pt) => pt.velocity * 1000) ?? [];

  // Metrikler (her dataset için)
  const metricsByDs = linkedVelocityDatasets.map((d) => {
    const xs = d.points.map((p) => p.x);
    const ys = d.points.map((p) => p.value * 1000); // m/s → mm/s (deney birimiyle aynı tutmalı; varsayım: m/s girildi)
    const m = computeMetrics(simX, simY_mm, xs, ys);
    return { dataset: d, metrics: m };
  });

  return (
    <div className="flex gap-2 h-full">
      {/* Bileşen listesi */}
      <div className="w-48 flex-shrink-0 overflow-auto border border-mf-border rounded bg-mf-bg">
        {profiles.map((p) => (
          <button
            key={p.component_id}
            onClick={() => setActiveId(p.component_id)}
            className={clsx(
              'w-full text-left px-2 py-1.5 text-xs border-b border-mf-border/50 hover:bg-mf-surface',
              (activeId ?? defaultId) === p.component_id && 'bg-mf-blue/20 text-mf-blue',
            )}
          >
            <div className="font-mono truncate">{nameFor(p.component_id)}</div>
            <div className="text-[10px] text-mf-text-dark">
              {p.width_um.toFixed(0)}×{p.depth_um.toFixed(0)} μm · v̄=
              {(p.mean_velocity * 1000).toFixed(2)} mm/s
            </div>
          </button>
        ))}
      </div>

      {/* Grafik + metrikler */}
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        <div className="flex-1 bg-mf-bg border border-mf-border rounded p-2 min-h-0">
          {active ? (
            <>
              <div className="text-xs text-mf-text-dim mb-1 flex items-center justify-between">
                <span>
                  <span className="font-semibold">{nameFor(active.component_id)}</span>
                  <span className="text-mf-text-dark ml-2">
                    Parabolik profil · v<sub>max</sub> = {(active.peak_velocity * 1000).toFixed(3)}{' '}
                    mm/s
                  </span>
                </span>
                {linkedVelocityDatasets.length > 0 && (
                  <span className="text-mf-text-dark">
                    · {linkedVelocityDatasets.length} deney seti overlay
                  </span>
                )}
              </div>
              <ResponsiveContainer width="100%" height="88%">
                <ComposedChart margin={{ top: 8, right: 16, bottom: 32, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={TOKENS.chartGrid} />
                  <XAxis
                    dataKey="y"
                    type="number"
                    tick={AXIS_TICK}
                    label={{
                      value: 'y (μm) — kanal kesiti',
                      position: 'insideBottom',
                      offset: -12,
                      fontSize: 10,
                      fill: TOKENS.chartAxis,
                    }}
                  />
                  <YAxis
                    tick={AXIS_TICK}
                    label={{
                      value: 'v (mm/s)',
                      angle: -90,
                      position: 'insideLeft',
                      fontSize: 10,
                      fill: TOKENS.chartAxis,
                    }}
                  />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Line
                    data={simLine}
                    type="monotone"
                    dataKey="v"
                    stroke={CHART_SERIES.flow}
                    strokeWidth={2}
                    dot={false}
                    name="Simülasyon"
                  />
                  <ReferenceLine
                    y={Number((active.mean_velocity * 1000).toFixed(4))}
                    stroke={TOKENS.ok}
                    strokeDasharray="4 2"
                    label={{
                      value: 'v̄',
                      fill: TOKENS.ok,
                      fontSize: 10,
                      position: 'insideTopRight',
                    }}
                  />
                  {linkedVelocityDatasets.map((d) => (
                    <Scatter
                      key={d.id}
                      name={d.name}
                      data={d.points.map((p) => ({ y: p.x, v: p.value * 1000 }))}
                      fill={d.color}
                      shape="circle"
                      line={false}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-mf-text-dark text-xs">
              Bir bileşen seçin
            </div>
          )}
        </div>

        {/* Metrik kartları — linked dataset varsa */}
        {metricsByDs.length > 0 && (
          <div className="flex-shrink-0 grid grid-cols-1 md:grid-cols-2 gap-2">
            {metricsByDs.map(({ dataset, metrics }) => (
              <MetricsCard key={dataset.id} dataset={dataset} metrics={metrics} />
            ))}
          </div>
        )}

        {/* Linkli dataset yok — kullanıcıya hatırlatma */}
        {active && metricsByDs.length === 0 && datasets.length > 0 && (
          <div className="flex-shrink-0 text-[11px] text-mf-text-dark italic p-2 border border-dashed border-mf-border rounded">
            Deney verisini bu bileşene ilişkilendirmek için <b>Deney</b> sekmesinden hız tipindeki
            dataset'i <code>{nameFor(active.component_id)}</code> bileşenine bağlayın.
          </div>
        )}
      </div>
    </div>
  );
};

// ── Sekme 5: Deney verisi yönetimi ──────────────────────────────────────────
const ExperimentTab: React.FC<{
  profiles: VelocityProfile[];
  nameFor: (id: string) => string;
}> = ({ profiles, nameFor }) => {
  const datasets = useExperimentStore((s) => s.datasets);
  const visibleIds = useExperimentStore((s) => s.visibleIds);
  const linkedComponentId = useExperimentStore((s) => s.linkedComponentId);
  const toggleVisible = useExperimentStore((s) => s.toggleVisible);
  const removeDataset = useExperimentStore((s) => s.removeDataset);
  const updateDataset = useExperimentStore((s) => s.updateDataset);
  const linkComponent = useExperimentStore((s) => s.linkComponent);

  if (datasets.length === 0) {
    return (
      <div className="text-xs text-mf-text-dark italic p-4 text-center">
        Henüz deney verisi yüklenmedi. Toolbar'daki <b>Deney Verisi</b> butonundan CSV/JSON içe
        aktarın.
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-mf-text-dark border-b border-mf-border">
            <th className="py-1 pr-2 w-6"></th>
            <th className="text-left py-1 pr-3">Dataset</th>
            <th className="text-left py-1 pr-3">Tip</th>
            <th className="text-right py-1 pr-3">Nokta</th>
            <th className="text-left py-1 pr-3">Bağlı Bileşen</th>
            <th className="py-1 pr-2 w-8"></th>
            <th className="py-1 w-8"></th>
          </tr>
        </thead>
        <tbody>
          {datasets.map((d) => (
            <tr key={d.id} className="border-b border-mf-border/50">
              <td className="py-1 pr-2">
                <input
                  type="color"
                  value={d.color}
                  onChange={(e) => updateDataset(d.id, { color: e.target.value })}
                  className="w-4 h-4 rounded-full border border-mf-border cursor-pointer bg-transparent p-0"
                  style={{ appearance: 'none', WebkitAppearance: 'none' }}
                  title="Rengi değiştir"
                />
              </td>
              <td className="py-1 pr-3 font-mono">
                <div className="text-mf-text">{d.name}</div>
                <div className="text-[10px] text-mf-text-dark truncate max-w-[220px]">
                  {d.filename}
                </div>
              </td>
              <td className="py-1 pr-3 text-mf-text-dim">{d.dataType}</td>
              <td className="py-1 pr-3 text-right text-mf-text-dim">{d.points.length}</td>
              <td className="py-1 pr-3">
                <select
                  value={linkedComponentId[d.id] ?? ''}
                  onChange={(e) => linkComponent(d.id, e.target.value || null)}
                  className="bg-mf-bg border border-mf-border rounded px-1 py-0.5 text-xs text-mf-text max-w-[200px]"
                >
                  <option value="">— yok —</option>
                  {profiles.map((p) => (
                    <option key={p.component_id} value={p.component_id}>
                      {nameFor(p.component_id)}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-1 pr-2">
                <button
                  onClick={() => toggleVisible(d.id)}
                  className="btn-icon w-6 h-6"
                  title={visibleIds.has(d.id) ? 'Gizle' : 'Göster'}
                >
                  {visibleIds.has(d.id) ? (
                    <FiEye size={12} />
                  ) : (
                    <FiEyeOff size={12} className="opacity-40" />
                  )}
                </button>
              </td>
              <td className="py-1">
                <button
                  onClick={async () => {
                    const ok = await confirmAsync({
                      title: 'Veri Setini Sil',
                      message: `"${d.name}" veri seti silinsin mi?`,
                      confirmLabel: 'Sil',
                      danger: true,
                    });
                    if (ok) removeDataset(d.id);
                  }}
                  className="btn-icon w-6 h-6 hover:text-mf-red"
                  title="Sil"
                >
                  <FiTrash2 size={12} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
