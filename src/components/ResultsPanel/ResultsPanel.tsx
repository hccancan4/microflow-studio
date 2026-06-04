/**
 * ResultsPanel — alt panel için ince sekme yönlendirici.
 * Başlık + CFD görselleştirme kontrolleri + sekme çubuğu + durum (idle/running/
 * error) yönetir; içeriği AnalyticView / CfdView / SweepTab'a devreder.
 * Sekme içerikleri tabs/ altında, ortak küçük bileşenler shared.tsx'te.
 */
import React, { useState } from 'react';
import { useSimulationStore } from '../../stores/useSimulationStore';
import { useDesignStore } from '../../stores/useDesignStore';
import { useSweepStore } from '../../stores/useSweepStore';
import {
  FiActivity, FiAlertCircle, FiLoader, FiGrid, FiTrendingUp, FiBarChart2, FiDatabase, FiSliders,
} from 'react-icons/fi';
import type { ColormapType } from '../../types';
import { ToggleChip, TabBtn } from './shared';
import { AnalyticView, type TabKey } from './tabs/AnalyticView';
import { CfdView } from './tabs/CfdView';
import { SweepTab } from './tabs/SweepTab';

interface ResultsPanelProps {
  height: number;
}

const ResultsPanel: React.FC<ResultsPanelProps> = ({ height }) => {
  const { status, progress, progressMessage, result, error, colormap, setColormap,
    cfdFieldType, setCfdFieldType,
    showVelocityField, toggleVelocityField,
    showPressureField, togglePressureField,
    showWallShear, toggleWallShear } = useSimulationStore();

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

        {/* CFD görselleştirme kontrolleri */}
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

export default ResultsPanel;
