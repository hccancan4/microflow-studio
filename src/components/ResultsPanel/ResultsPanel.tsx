/**
 * ResultsPanel — Alt panel: Simülasyon sonuçları.
 * Analitik: özet metrikler + bileşen tablosu + basınç/debi bar chart + hız profili.
 * CFD: renk haritası kontrolleri + residual yakınsama grafiği.
 * Ayrıca deney verisi karşılaştırma ve parametrik tarama sekmeleri.
 */
import React, { useMemo, useState } from 'react';
import { useSimulationStore } from '../../stores/useSimulationStore';
import { useDesignStore } from '../../stores/useDesignStore';
import { useExperimentStore } from '../../stores/useExperimentStore';
import { useSweepStore } from '../../stores/useSweepStore';
import { sweepResultsToCsv } from '../../utils/sweepRunner';
import { FiActivity, FiAlertCircle, FiLoader, FiGrid, FiTrendingUp, FiBarChart2, FiDatabase, FiEye, FiEyeOff, FiTrash2, FiSliders, FiDownload, FiXCircle, FiCheckCircle } from 'react-icons/fi';
import clsx from 'clsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, ComposedChart, Scatter,
} from 'recharts';
import type { AnalyticResult, VelocityProfile, CfdField, ColormapType, ExperimentDataSet, SimulationResult } from '../../types';
import { colormapCssGradient, colormap as colormapEval } from '../../utils/colormaps';
import { computeMetrics } from '../../utils/experimentMetrics';
import { TOKENS, CHART_SERIES } from '../../theme/tokens';
import { toast, confirmAsync } from '../../stores/useUiStore';

// ── Ortak recharts tema sabitleri (token-güdümlü) ─────────────────────────
const AXIS_TICK = { fontSize: 10, fill: TOKENS.chartAxis } as const;
const TOOLTIP_STYLE = {
  background: TOKENS.chartTooltipBg,
  border: `1px solid ${TOKENS.chartTooltipBorder}`,
  borderRadius: 4,
  fontSize: 11,
} as const;

interface ResultsPanelProps {
  height: number;
}

type TabKey = 'summary' | 'components' | 'charts' | 'profile' | 'experiment' | 'sweep';

const ResultsPanel: React.FC<ResultsPanelProps> = ({ height }) => {
  const { status, progress, progressMessage, result, error, colormap, setColormap,
    cfdFieldType, setCfdFieldType,
    showVelocityField, toggleVelocityField,
    showPressureField, togglePressureField,
    showWallShear, toggleWallShear,
    showStreamlines, toggleStreamlines } = useSimulationStore();

  const selectedIds = useDesignStore((s) => s.selectedIds);
  const [tab, setTab] = useState<TabKey>('summary');

  const isAnalytic = result?.mode === 'analytic';
  const sweepRuns = useSweepStore((s) => s.runs);
  const sweepRunning = useSweepStore((s) => s.running);
  const sweepHasData = sweepRuns.length > 0 || sweepRunning;

  return (
    <div
      className="flex flex-col bg-mf-surface border-t border-mf-border"
      style={{ height }}
    >
      {/* Panel başlığı */}
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <FiActivity size={12} />
          <span>Simülasyon Sonuçları</span>
          {status === 'running' && (
            <FiLoader size={12} className="animate-spin text-mf-orange" />
          )}
          {result && (
            <span className="text-mf-text-dark text-xs">
              · {result.mode.toUpperCase()} · {new Date(result.timestamp).toLocaleTimeString('tr-TR')}
            </span>
          )}
        </div>

        {/* CFD görselleştirme kontrolleri (Faz 4B) */}
        {result?.mode === 'cfd' && (
          <div className="flex items-center gap-2">
            <select
              value={cfdFieldType}
              onChange={(e) => {
                const v = e.target.value as 'magnitude' | 'pressure' | 'wallShear';
                setCfdFieldType(v);
                // Seçilen alana uygun görünürlük bayraklarını tek-seferlik senkronize et
                if (v === 'magnitude'  && !showVelocityField) toggleVelocityField();
                if (v === 'pressure'   && !showPressureField) togglePressureField();
                if (v === 'wallShear'  && !showWallShear)     toggleWallShear();
              }}
              className="mf-input text-xs py-0.5"
              title="Gösterilecek saha"
            >
              <option value="magnitude">Hız büyüklüğü (|v|)</option>
              <option value="pressure">Basınç</option>
              <option value="wallShear">Duvar kesme</option>
            </select>
            <ToggleChip label="Göster" active={showVelocityField || showPressureField || showWallShear} onClick={() => {
              const any = showVelocityField || showPressureField || showWallShear;
              if (any) {
                if (showVelocityField) toggleVelocityField();
                if (showPressureField) togglePressureField();
                if (showWallShear)     toggleWallShear();
              } else {
                if (cfdFieldType === 'magnitude') toggleVelocityField();
                if (cfdFieldType === 'pressure')  togglePressureField();
                if (cfdFieldType === 'wallShear') toggleWallShear();
              }
            }} />
            <select
              value={colormap}
              onChange={(e) => setColormap(e.target.value as ColormapType)}
              className="mf-input text-xs w-24 py-0.5"
            >
              <option value="viridis">Viridis</option>
              <option value="jet">Jet</option>
              <option value="plasma">Plasma</option>
              <option value="coolwarm">Coolwarm</option>
            </select>
          </div>
        )}

        {/* Analitik için tab seçici — mantıksal gruplar: Analiz | Doğrulama | Tarama */}
        {isAnalytic && result?.analyticResults && result.analyticResults.length > 0 && (
          <div className="flex items-center gap-1">
            {/* Analiz grubu */}
            <TabBtn active={tab === 'summary'} onClick={() => setTab('summary')} icon={<FiActivity size={10} />}>Özet</TabBtn>
            <TabBtn active={tab === 'components'} onClick={() => setTab('components')} icon={<FiGrid size={10} />}>Bileşenler</TabBtn>
            <TabBtn active={tab === 'charts'} onClick={() => setTab('charts')} icon={<FiBarChart2 size={10} />}>Grafik</TabBtn>
            <TabBtn active={tab === 'profile'} onClick={() => setTab('profile')} icon={<FiTrendingUp size={10} />}>Profil</TabBtn>
            {/* Doğrulama grubu */}
            <div className="tool-divider" />
            <TabBtn active={tab === 'experiment'} onClick={() => setTab('experiment')} icon={<FiDatabase size={10} />}>Deney</TabBtn>
            {/* Tarama grubu */}
            {sweepHasData && (
              <>
                <div className="tool-divider" />
                <TabBtn active={tab === 'sweep'} onClick={() => setTab('sweep')} icon={<FiSliders size={10} />}>Tarama</TabBtn>
              </>
            )}
          </div>
        )}

        {/* Analitik sonuç yoksa ama sweep varsa yalnız Tarama sekmesi */}
        {!isAnalytic && sweepHasData && (
          <div className="flex items-center gap-1">
            <TabBtn active={tab === 'sweep'} onClick={() => setTab('sweep')} icon={<FiSliders size={10} />}>Tarama</TabBtn>
          </div>
        )}
      </div>

      {/* İçerik */}
      <div className="flex-1 overflow-auto">
        {status === 'idle' && !result && !sweepHasData && (
          <div className="flex flex-col items-center justify-center h-full gap-1.5 text-center p-3">
            <FiActivity size={22} className="text-mf-text-dark opacity-40" />
            <div className="text-sm text-mf-text-dim">Henüz sonuç yok</div>
            <div className="text-xs text-mf-text-dark">
              Toolbar'dan <span className="text-mf-orange">Hızlı Analiz</span> ·{' '}
              <span className="text-mf-blue">CFD Sim.</span> ·{' '}
              <span className="text-mf-text">Tarama</span> çalıştırın
            </div>
          </div>
        )}

        {/* Sweep — simülasyondan bağımsız görünebilir */}
        {tab === 'sweep' && sweepHasData && (
          <div className="h-full px-3 py-2">
            <SweepTab />
          </div>
        )}

        {status === 'running' && (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-3">
            <div className="w-full max-w-md">
              <div className="flex justify-between text-xs text-mf-text-dim mb-1">
                <span>{progressMessage || 'Simülasyon çalışıyor...'}</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-2 bg-mf-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-mf-orange rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {status === 'error' && error && (
          <div className="flex items-center gap-2 text-mf-red text-sm p-3 m-2 bg-red-900/20 rounded border border-red-900/40">
            <FiAlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        {status === 'completed' && result && isAnalytic && tab !== 'sweep' && (
          <AnalyticView result={result} tab={tab} selectedIds={selectedIds} />
        )}

        {status === 'completed' && result?.mode === 'cfd' && result.cfdField && tab !== 'sweep' && (
          <CfdView field={result.cfdField} summary={result.summary} colormap={colormap} fieldType={cfdFieldType} />
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Analitik görünüm — 4 sekme
// ═══════════════════════════════════════════════════════════════════════════

const AnalyticView: React.FC<{
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
      {tab === 'components' && <ComponentsTab analytics={analytics} nameFor={nameFor} selectedIds={selectedIds} />}
      {tab === 'charts' && <ChartsTab analytics={meaningful} nameFor={nameFor} />}
      {tab === 'profile' && <ProfileTab profiles={profiles} nameFor={nameFor} selectedIds={selectedIds} />}
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
  const regime = maxRe < 1 ? 'Stokes akış (Re < 1)'
    : maxRe < 100 ? 'Düşük Re laminar'
    : maxRe < 2000 ? 'Laminar'
    : 'Türbülanslı (!)';
  const regimeColor = maxRe < 100 ? 'text-mf-green' : maxRe < 2000 ? 'text-mf-blue' : 'text-mf-orange';

  return (
    <div className="grid grid-cols-4 gap-2">
      <MetricCard label="Maks. Hız" value={`${(result.summary.maxVelocity * 1000).toFixed(3)} mm/s`} color="blue" />
      <MetricCard label="Toplam Debi" value={`${result.summary.totalFlowRate.toFixed(3)} μL/min`} color="green" />
      <MetricCard label="Maks. Basınç" value={`${result.summary.maxPressure.toFixed(1)} Pa`} color="orange" />
      <MetricCard label="Min. Basınç" value={`${result.summary.minPressure.toFixed(1)} Pa`} color="orange" />

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
          <div className="text-xs text-mf-text-dim mb-1 font-semibold uppercase tracking-wider">Serpantin Mikserler</div>
          <div className="grid grid-cols-4 gap-2">
            {mixers.map((m) => (
              <div key={m.componentId} className="bg-mf-bg rounded border border-mf-border p-2">
                <div className="text-xs text-mf-text-dark mb-1 truncate">{m.componentId.slice(-8)}</div>
                <div className="text-sm font-mono font-semibold text-mf-green">
                  η = {(m.mixingEfficiency! * 100).toFixed(1)}%
                </div>
                <div className="w-full h-1 bg-mf-bg mt-1 rounded overflow-hidden">
                  <div className="h-full bg-mf-green" style={{ width: `${m.mixingEfficiency! * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {curves.length > 0 && (
        <div className="col-span-4 mt-2">
          <div className="text-xs text-mf-text-dim mb-1 font-semibold uppercase tracking-wider">Eğri Kanallar (Dean sayısı)</div>
          <div className="grid grid-cols-4 gap-2">
            {curves.map((c) => (
              <div key={c.componentId} className="bg-mf-bg rounded border border-mf-border p-2">
                <div className="text-xs text-mf-text-dark mb-1 truncate">{c.componentId.slice(-8)}</div>
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
            selectedIds.includes(r.componentId) ? 'bg-mf-blue/10' : 'hover:bg-mf-bg/50'
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
    return <div className="text-xs text-mf-text-dark italic p-4 text-center">Grafik çizmek için yeterli bileşen yok.</div>;
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
            <ReferenceLine y={2000} stroke={TOKENS.active} strokeDasharray="4 2" label={{ value: 'türbülans eşiği', fill: TOKENS.active, fontSize: 9 }} />
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
            <YAxis tick={AXIS_TICK} label={{ value: 'log₁₀(R)', angle: -90, position: 'insideLeft', fontSize: 10, fill: TOKENS.chartAxis }} />
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
  const defaultId = profiles.find((p) => selectedIds.includes(p.component_id))?.component_id
    ?? profiles[0]?.component_id;
  const [activeId, setActiveId] = useState<string | undefined>(defaultId);
  const active = profiles.find((p) => p.component_id === (activeId ?? defaultId));

  // Deney verisi (velocity tipinde, aktif bileşene linklenmiş)
  const datasets = useExperimentStore((s) => s.datasets);
  const visibleIds = useExperimentStore((s) => s.visibleIds);
  const linkedComponentId = useExperimentStore((s) => s.linkedComponentId);

  const linkedVelocityDatasets = useMemo(() => {
    if (!active) return [] as ExperimentDataSet[];
    return datasets.filter((d) =>
      d.dataType === 'velocity'
      && visibleIds.has(d.id)
      && linkedComponentId[d.id] === active.component_id,
    );
  }, [datasets, visibleIds, linkedComponentId, active]);

  if (profiles.length === 0) {
    return <div className="text-xs text-mf-text-dark italic p-4 text-center">Hız profili için geometri bilgisi yok.</div>;
  }

  // Sim eğrisi — mm/s cinsinden y = y_um, v = velocity*1000
  const simLine = active ? active.points.map((pt) => ({
    y: Number(pt.y_um.toFixed(1)),
    v: Number((pt.velocity * 1000).toFixed(4)),
  })) : [];
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
              (activeId ?? defaultId) === p.component_id && 'bg-mf-blue/20 text-mf-blue'
            )}
          >
            <div className="font-mono truncate">{nameFor(p.component_id)}</div>
            <div className="text-[10px] text-mf-text-dark">
              {p.width_um.toFixed(0)}×{p.depth_um.toFixed(0)} μm · v̄={((p.mean_velocity) * 1000).toFixed(2)} mm/s
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
                    Parabolik profil · v<sub>max</sub> = {(active.peak_velocity * 1000).toFixed(3)} mm/s
                  </span>
                </span>
                {linkedVelocityDatasets.length > 0 && (
                  <span className="text-mf-text-dark">
                    · {linkedVelocityDatasets.length} deney seti overlay
                  </span>
                )}
              </div>
              <ResponsiveContainer width="100%" height="88%">
                <ComposedChart
                  margin={{ top: 8, right: 16, bottom: 32, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={TOKENS.chartGrid} />
                  <XAxis
                    dataKey="y"
                    type="number"
                    tick={AXIS_TICK}
                    label={{ value: 'y (μm) — kanal kesiti', position: 'insideBottom', offset: -12, fontSize: 10, fill: TOKENS.chartAxis }}
                  />
                  <YAxis
                    tick={AXIS_TICK}
                    label={{ value: 'v (mm/s)', angle: -90, position: 'insideLeft', fontSize: 10, fill: TOKENS.chartAxis }}
                  />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Line data={simLine} type="monotone" dataKey="v" stroke={CHART_SERIES.flow} strokeWidth={2} dot={false} name="Simülasyon" />
                  <ReferenceLine
                    y={Number((active.mean_velocity * 1000).toFixed(4))}
                    stroke={TOKENS.ok} strokeDasharray="4 2"
                    label={{ value: 'v̄', fill: TOKENS.ok, fontSize: 10, position: 'insideTopRight' }}
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
            Deney verisini bu bileşene ilişkilendirmek için <b>Deney</b> sekmesinden
            hız tipindeki dataset'i <code>{nameFor(active.component_id)}</code> bileşenine bağlayın.
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
        Henüz deney verisi yüklenmedi. Toolbar'daki <b>Deney Verisi</b> butonundan CSV/JSON içe aktarın.
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
                <div className="text-[10px] text-mf-text-dark truncate max-w-[220px]">{d.filename}</div>
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
                  {visibleIds.has(d.id) ? <FiEye size={12} /> : <FiEyeOff size={12} className="opacity-40" />}
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

// Metrik kartı — R², RMSE, MAPE, n
const MetricsCard: React.FC<{
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

const MiniMetric: React.FC<{ label: string; value: string; color: 'blue' | 'green' | 'orange' }> = ({ label, value, color }) => {
  const c = { blue: 'text-mf-blue', green: 'text-mf-green', orange: 'text-mf-orange' }[color];
  return (
    <div className="bg-mf-surface rounded px-1.5 py-1 border border-mf-border/50">
      <div className="text-[10px] text-mf-text-dark">{label}</div>
      <div className={clsx('text-xs font-mono font-semibold truncate', c)}>{value}</div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// CFD görünüm — metrik kartları + legend + residual grafiği
// ═══════════════════════════════════════════════════════════════════════════
const CfdView: React.FC<{
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
  const simArr = samples.map((s) => s.sim);
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

// ═══════════════════════════════════════════════════════════════════════════
// Ortak minik bileşenler
// ═══════════════════════════════════════════════════════════════════════════

const MetricCard: React.FC<{ label: string; value: string; color: 'blue' | 'green' | 'orange' }> = ({ label, value, color }) => {
  const c = { blue: 'text-mf-blue', green: 'text-mf-green', orange: 'text-mf-orange' }[color];
  return (
    <div className="bg-mf-bg rounded border border-mf-border p-2">
      <div className="text-xs text-mf-text-dark mb-1">{label}</div>
      <div className={clsx('text-sm font-mono font-semibold', c)}>{value}</div>
    </div>
  );
};

const ToggleChip: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
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

const TabBtn: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }> = ({ active, onClick, icon, children }) => (
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

const ChartCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-mf-bg border border-mf-border rounded flex flex-col min-h-0">
    <div className="px-2 py-1 text-xs text-mf-text-dim border-b border-mf-border">{title}</div>
    <div className="flex-1 min-h-0">{children}</div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// Sweep sekmesi (Faz 6B) — parametrik tarama sonuçları
// ═══════════════════════════════════════════════════════════════════════════

const SweepTab: React.FC = () => {
  const config = useSweepStore((s) => s.config);
  const runs = useSweepStore((s) => s.runs);
  const running = useSweepStore((s) => s.running);
  const progress = useSweepStore((s) => s.progress);
  const currentIndex = useSweepStore((s) => s.currentIndex);
  const requestCancel = useSweepStore((s) => s.requestCancel);
  const reset = useSweepStore((s) => s.reset);

  const [metric, setMetric] = useState<'totalFlowRate' | 'maxPressure' | 'maxReynolds' | 'componentPressureDrop'>('totalFlowRate');

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
            <span>{config.paramLabel} vs {metricLabel[metric]}</span>
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
                  label={{ value: `${config.paramLabel} (${config.unit})`, position: 'insideBottom', offset: -8, fill: TOKENS.chartAxis, fontSize: 10 }}
                />
                <YAxis
                  tick={AXIS_TICK}
                  label={{ value: metricLabel[metric], angle: -90, position: 'insideLeft', fill: TOKENS.chartAxis, fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(v: number | string) => `${config.paramLabel}: ${Number(v).toFixed(3)} ${config.unit}`}
                />
                <Line type="monotone" dataKey={metric} stroke={CHART_SERIES.flow} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
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
                  <tr key={i} className={clsx('border-b border-mf-border/50', r.error && 'text-mf-red')}>
                    <td className="px-2 py-1 text-mf-text">{r.paramValue.toFixed(3)}</td>
                    <td className="px-2 py-1 text-right text-mf-green">{r.totalFlowRate.toFixed(3)}</td>
                    <td className="px-2 py-1 text-right text-mf-orange">{r.maxPressure.toFixed(1)}</td>
                    <td className="px-2 py-1 text-right text-mf-blue">{r.maxReynolds.toFixed(3)}</td>
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

export default ResultsPanel;
