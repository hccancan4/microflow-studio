/**
 * App.tsx — MicroFlow Studio ana uygulama bileşeni
 * Layout: Toolbar + Sol Panel + Merkez (Canvas/Script) + Sağ Panel + Alt Panel
 */
import React, { useEffect, useCallback, useRef, useState, Suspense, lazy } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import Toolbar from './components/Toolbar/Toolbar';
import Sidebar from './components/Sidebar/Sidebar';
import CanvasEditor from './components/Canvas/CanvasEditor';
// ScriptEditor (Monaco) yalnız Script sekmesine geçilince yüklenir (kod-bölme).
const ScriptEditor = lazy(() => import('./components/ScriptEditor/ScriptEditor'));
import ResultsPanel from './components/ResultsPanel/ResultsPanel';
import PropertiesPanel from './components/PropertiesPanel/PropertiesPanel';
import ProgressOverlay from './components/ProgressOverlay';
import ExportDialog, { type ExportSettings } from './components/ExportDialog';
import ExperimentImportDialog from './components/ExperimentImportDialog';
import SweepDialog from './components/SweepDialog';
import KeyboardHelp from './components/KeyboardHelp';
import ExportRenderer, { type ExportJob } from './utils/exportRenderer';
import { exportDesignAsSvg } from './utils/svgExporter';
import { buildGdsPolygons } from './utils/gdsGeometry';

import { useProjectStore } from './stores/useProjectStore';
import { useDesignStore } from './stores/useDesignStore';
import { useSimulationStore } from './stores/useSimulationStore';
import { useSweepStore } from './stores/useSweepStore';
import { useExperimentStore } from './stores/useExperimentStore';
import { useScriptDispatcher, type ScriptRunStatus } from './hooks/useScriptDispatcher';
import Notifications from './components/Notifications';
import { toast, confirmAsync } from './stores/useUiStore';
import type { RawMFlowProject, RawAnalyticDesignResult, CfdField, ChipComponent, Connection, ProjectMetadata } from './types';

import './index.css';

// Panel boyutları için resize hook
function useElementSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

const App: React.FC = () => {
  const {
    activeTab,
    leftPanelOpen,
    rightPanelOpen,
    bottomPanelOpen,
    leftPanelWidth,
    rightPanelWidth,
    bottomPanelHeight,
    metadata,
    isDirty,
    scriptContent,
    newProject: handleNewProjectStore,
  } = useProjectStore();

  // Seçici abonelik: App yalnız components/connections değişince re-render eder
  // (canvas pan/zoom, seçim, dragOffset değişiklikleri App'i tetiklemez).
  const components = useDesignStore((s) => s.components);
  const connections = useDesignStore((s) => s.connections);
  const { setStatus, setProgress, setResult, setError, reset, params } = useSimulationStore();
  // Sim durumu — analitik/CFD/sweep koşarken paralel çalıştırmayı engelle
  const simStatus = useSimulationStore((s) => s.status);
  const sweepRunning = useSweepStore((s) => s.running);
  const isBusy = simStatus === 'running' || sweepRunning;

  const centerRef = useRef<HTMLDivElement>(null);
  const centerSize = useElementSize(centerRef);

  // Lua script run status (son koşudan gelen çıktı/hata/istatistik)
  const [scriptStatus, setScriptStatus] = useState<ScriptRunStatus>({
    running: false,
    lastOutput: '',
    lastError: null,
    lastActionCount: 0,
    lastElapsedMs: 0,
  });
  // Script output'unu biriktir (event'ler parça parça gelebilir)
  const [scriptOutputLog, setScriptOutputLog] = useState<string>('');

  // Lua action event'lerini store'a dispatch eden hook
  const scriptDispatcher = useScriptDispatcher((status) => {
    setScriptStatus(status);
    if (status.running && status.lastOutput) {
      setScriptOutputLog((prev) => prev + status.lastOutput);
    }
  });

  // Tauri event dinleyicileri — cancelled flag ile race-condition'sız cleanup
  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | null = null;
    listen<{ progress: number; message: string }>('simulation-progress', (event) => {
      setProgress(event.payload.progress, event.payload.message);
    }).then((f) => {
      if (cancelled) f();
      else unlistenFn = f;
    });
    return () => {
      cancelled = true;
      if (unlistenFn) unlistenFn();
    };
  }, [setProgress]);

  // Klavye kısayolları
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'z': e.preventDefault(); useDesignStore.getState().undo(); break;
          case 'y': e.preventDefault(); useDesignStore.getState().redo(); break;
          case 's':
            e.preventDefault();
            if (e.shiftKey) handleSaveAs();
            else handleSave();
            break;
          case 'o': e.preventDefault(); handleOpen(); break;
          case 'n': e.preventDefault(); handleNewProject(); break;
          case 'e': e.preventDefault(); handleExport(); break;
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Monaco editör aktifken silme işlemi yapma
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
        const { selectedIds, removeComponents } = useDesignStore.getState();
        if (selectedIds.length > 0) removeComponents(selectedIds);
      }
      // ? veya F1 — klavye kısayolları
      if ((e.key === '?' || e.key === 'F1') && !e.ctrlKey && !e.metaKey) {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
        e.preventDefault();
        setHelpOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // Handler'lar aşağıda tanımlı; ref'i tutmak yerine handler'lar içinde
    // useXxxStore.getState() ile fresh state okuyoruz → stale closure güvenli.
  }, []);

  // Dosya işlemleri — isDirty closure'unu kullanmak yerine getState ile fresh oku
  const handleNewProject = useCallback(async () => {
    const dirty = useProjectStore.getState().isDirty;
    if (dirty) {
      const ok = await confirmAsync({
        title: 'Yeni Proje',
        message: 'Kaydedilmemiş değişiklikler var. Yeni projeye geçilsin mi?',
        confirmLabel: 'Devam et',
        danger: true,
      });
      if (!ok) return;
    }
    handleNewProjectStore();
    useDesignStore.getState().clearDesign();
    useExperimentStore.getState().clear();
    useSweepStore.getState().reset();
    reset();
  }, [handleNewProjectStore, reset]);

  const handleSave = useCallback(async () => {
    const { filePath, setFilePath: _setPath, setDirty: markClean } = useProjectStore.getState();
    if (!filePath) { handleSaveAs(); return; }
    try {
      const project = buildProjectPayload();
      await invoke<void>('save_project_file', { project, path: filePath });
      markClean(false);
      toast.success('Proje kaydedildi');
    } catch (err) {
      toast.error(`Kaydetme hatası: ${err}`);
    }
  }, []);

  const handleSaveAs = useCallback(async () => {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({
        filters: [{ name: 'MicroFlow Proje', extensions: ['mflow'] }],
        defaultPath: `${useProjectStore.getState().metadata.name}.mflow`,
      });
      if (!path) return;
      const project = buildProjectPayload();
      await invoke<void>('save_project_file', { project, path });
      useProjectStore.getState().setFilePath(path);
      useProjectStore.getState().setDirty(false);
      useProjectStore.getState().addRecentFile(path);
      toast.success('Proje kaydedildi');
    } catch (err) {
      // Dialog import / save IPC hataları sessiz kalmasın
      console.error('[handleSaveAs]', err);
      toast.error(`Kaydetme hatası: ${err}`);
    }
  }, []);

  const handleOpen = useCallback(async () => {
    const dirty = useProjectStore.getState().isDirty;
    if (dirty) {
      const ok = await confirmAsync({
        title: 'Proje Aç',
        message: 'Kaydedilmemiş değişiklikler var. Başka bir proje açılsın mı?',
        confirmLabel: 'Aç',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      const { open: openFile } = await import('@tauri-apps/plugin-dialog');
      const path = await openFile({
        filters: [{ name: 'MicroFlow Proje', extensions: ['mflow'] }],
      });
      if (!path) return;
      const project = await invoke<RawMFlowProject>('load_project_file', { path });
      useProjectStore.getState().setMetadata(project.metadata);
      useProjectStore.getState().setFilePath(path as string);
      useProjectStore.getState().setDirty(false);
      useProjectStore.getState().setScriptContent(project.script ?? '');
      useDesignStore.getState().loadDesign(project.components ?? [], project.connections ?? []);
      useExperimentStore.getState().replaceAll(project.experiment_data ?? []);
      useSweepStore.getState().reset();
      reset();
    } catch (_err) {
      // Dialog iptal edildi veya hata
    }
  }, [reset]);

  // Deney verisi import dialog durumu
  const [expDialogOpen, setExpDialogOpen] = useState(false);
  const [sweepDialogOpen, setSweepDialogOpen] = useState(false);
  const addExperiment = useExperimentStore((s) => s.addDataset);
  const nextExpColor  = useExperimentStore((s) => s.nextColor);

  const handleImportExperiment = useCallback(() => {
    setExpDialogOpen(true);
  }, []);

  // Export dialog durumu
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  // Aktif PNG render job'ı — null değilken ExportRenderer monte olur
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);

  const handleExport = useCallback(() => {
    if (useDesignStore.getState().components.length === 0) {
      toast.warn("Dışa aktarmak için canvas'a bileşen ekleyin.");
      return;
    }
    setExportDialogOpen(true);
  }, []);

  /** ExportDialog "Dışa Aktar" butonundan çağrılır. */
  const handleExportConfirm = useCallback(async (settings: ExportSettings) => {
    setExportBusy(true);
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const ext = settings.format;
      const path = await save({
        filters: [{
          name: ext === 'png' ? 'PNG Görüntü' : 'SVG Vektör',
          extensions: [ext],
        }],
        defaultPath: `${useProjectStore.getState().metadata.name}.${ext}`,
      });
      if (!path) { setExportBusy(false); return; }

      if (settings.format === 'svg') {
        const svg = exportDesignAsSvg(components, connections, {
          background: settings.background,
          includeScaleBar: settings.includeScaleBar,
          paddingUm: settings.paddingUm,
        });
        await invoke<void>('export_svg', { outputPath: path, svg });
        setExportBusy(false);
        setExportDialogOpen(false);
        toast.success(`SVG dışa aktarıldı: ${path}`);
        return;
      }

      if (settings.format === 'gds') {
        const polygons = buildGdsPolygons(components, {
          arcResolution: settings.arcResolution,
        });
        if (polygons.length === 0) {
          throw new Error('Dışa aktarılacak poligon yok.');
        }
        const size = await invoke<number>('export_gds_file', {
          outputPath: path,
          polygons,
          params: {
            db_unit_um: 0.001,
            struct_name: useProjectStore.getState().metadata.name.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 31) || 'CHIP',
            lib_name: 'MICROFLOW',
          },
        });
        setExportBusy(false);
        setExportDialogOpen(false);
        toast.success(`GDS-II dışa aktarıldı (${polygons.length} poligon, ${size} bayt): ${path}`);
        return;
      }

      // PNG: offscreen Konva Stage → base64 → backend save
      const dataUrl = await new Promise<string>((resolve, reject) => {
        setExportJob({
          components,
          connections,
          options: {
            dpi: settings.dpi,
            background: settings.background,
            includeScaleBar: settings.includeScaleBar,
            paddingUm: settings.paddingUm,
          },
          resolve, reject,
        });
      });
      setExportJob(null);

      const [w, h] = await invoke<[number, number]>('export_png_data', {
        outputPath: path,
        data: dataUrl,
        options: {
          format: 'png',
          dpi: settings.dpi,
          background: settings.background,
          include_scale_bar: settings.includeScaleBar,
        },
      });
      setExportBusy(false);
      setExportDialogOpen(false);
      toast.success(`PNG dışa aktarıldı (${w}×${h}): ${path}`);
    } catch (err) {
      setExportJob(null);
      setExportBusy(false);
      toast.error(`Dışa aktarma hatası: ${err}`);
    }
  }, [components, connections]);

  // Analitik simülasyon — tüm tasarım ağını çözer
  const handleRunAnalytic = useCallback(async () => {
    // Aynı anda iki simülasyon koşmasın — sonuçlar birbirini eziyor
    if (useSimulationStore.getState().status === 'running') return;
    if (useSweepStore.getState().running) return;
    if (components.length === 0) {
      toast.warn("Önce canvas'a bileşen ekleyin.");
      return;
    }
    reset();
    setStatus('running');
    setProgress(10, 'Ağ grafı oluşturuluyor...');
    try {
      setProgress(40, 'Direnç ağı çözülüyor (Hagen-Poiseuille)...');
      // Rust'a gönderilen component/connection şekli zaten camelCase alanlar içeriyor;
      // serde rename attribute'leri frontend tipleriyle eşleşmeli.
      const res = await invoke<RawAnalyticDesignResult>('run_analytic_network', {
        req: {
          components,
          connections,
          inlet_pressure: params.inletPressure ?? 1000,
          fluid_viscosity: params.fluidProperties.viscosity,
          fluid_density: params.fluidProperties.density,
        },
      });

      setProgress(90, 'Sonuçlar işleniyor...');
      // Rust snake_case → TypeScript camelCase dönüşümü
      // Her numerik alanı NaN / Infinity karşısında koruyalım
      const safeNum = (v: unknown): number => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };
      setResult({
        mode: 'analytic',
        timestamp: new Date().toISOString(),
        analyticResults: (res.results ?? []).map((r) => ({
          componentId: r.component_id ?? '',
          flowRate: safeNum(r.flow_rate),
          pressureDrop: safeNum(r.pressure_drop),
          reynoldsNumber: safeNum(r.reynolds_number),
          resistance: safeNum(r.resistance),
          deanNumber: r.dean_number != null ? safeNum(r.dean_number) : undefined,
          mixingEfficiency: r.mixing_efficiency != null ? safeNum(r.mixing_efficiency) : undefined,
        })),
        networkPaths: res.paths ?? [],
        velocityProfiles: res.profiles ?? [],
        summary: {
          maxVelocity: safeNum(res.max_velocity),
          minPressure: safeNum(res.min_pressure),
          maxPressure: safeNum(res.max_pressure),
          totalFlowRate: safeNum(res.total_flow_rate),
        },
      });
      setProgress(100, 'Tamamlandı');
    } catch (err) {
      setError(`Analitik simülasyon hatası: ${err}`);
    }
  }, [components, connections, params, reset, setStatus, setProgress, setResult, setError]);

  // CFD simülasyonu
  // Seçili bir straight_channel varsa onun geometrisini kullan; yoksa ilk straight_channel.
  // Böylece user "hangi bileşen üstünde CFD çalışsın?" sorusunu seçimle cevaplar.
  const handleRunCfd = useCallback(async () => {
    // Aynı anda iki simülasyon koşmasın
    if (useSimulationStore.getState().status === 'running') return;
    if (useSweepStore.getState().running) return;
    if (components.length === 0) {
      toast.warn("Önce canvas'a bileşen ekleyin.");
      return;
    }

    // CFD hedefi: seçili straight_channel veya ilk straight_channel
    const selectedIds = useDesignStore.getState().selectedIds;
    const candidates = components.filter((c) => c.type === 'straight_channel');
    const target =
      components.find((c) => selectedIds.includes(c.id) && c.type === 'straight_channel')
      ?? candidates[0];

    if (!target) {
      toast.warn("CFD için bir Düz Kanal bileşeni gereklidir. Canvas'a ekleyin ve seçin.");
      return;
    }

    const p = target.params as { width: number; length: number; depth: number };
    const channelWidth  = p.length; // akım yönü (x) uzunluğu
    const channelHeight = p.width;  // en-kesit (y)
    const depthM = p.depth * 1e-6;

    // Analitik ön-çözüm: aynı geometride Hagen-Poiseuille inlet hızı
    // u_avg = ΔP · h² / (12 · μ · L)  (2D paralel levhalar yaklaşımı)
    const dP = params.inletPressure ?? 1000;
    const hM = channelHeight * 1e-6;
    const lM = channelWidth * 1e-6;
    const uAvg = (dP * hM * hM) / (12 * params.fluidProperties.viscosity * lM);

    reset();
    setStatus('running');
    setProgress(2, `CFD başlatılıyor — "${target.label ?? target.type}" kanalı üzerinde`);

    // Hedef bileşeni overlay için store'a kaydet
    useSimulationStore.getState().setCfdTargetComponentId(target.id);

    try {
      const resMap: Record<string, { nx: number; ny: number; iter: number }> = {
        coarse: { nx: 60,  ny: 16, iter: 400 },
        medium: { nx: 100, ny: 24, iter: 800 },
        fine:   { nx: 160, ny: 36, iter: 1400 },
      };
      const grid = resMap[params.gridResolution] ?? resMap.medium;

      const cfdField = await invoke<CfdField>('run_cfd_simulation', {
        req: {
          channel_width_um:  channelWidth,
          channel_height_um: channelHeight,
          inlet_velocity:    uAvg,
          nx: grid.nx,
          ny: grid.ny,
          max_iterations:    Math.max(params.maxIterations, grid.iter),
          fluid_viscosity:   params.fluidProperties.viscosity,
          fluid_density:     params.fluidProperties.density,
        },
      });

      const maxV = cfdField.magnitude.reduce((m: number, v: number) => v > m ? v : m, 0);
      const minP = cfdField.pressure.reduce((m: number, v: number) => v < m ? v : m, Infinity);
      const maxP = cfdField.pressure.reduce((m: number, v: number) => v > m ? v : m, -Infinity);
      // Debi (μL/min): Q = u_avg · A = u_avg · (w · depth)
      const qMicroLMin = uAvg * hM * depthM * 1e9 * 60;

      setResult({
        mode: 'cfd',
        timestamp: new Date().toISOString(),
        cfdField,
        summary: {
          maxVelocity: maxV,
          minPressure: Number.isFinite(minP) ? minP : 0,
          maxPressure: Number.isFinite(maxP) ? maxP : 0,
          totalFlowRate: qMicroLMin,
        },
      });
    } catch (err) {
      setError(`CFD simülasyon hatası: ${err}`);
    }
  }, [components, params, reset, setStatus, setProgress, setResult, setError]);

  // Script çalıştırma — Lua → DesignAction event'leri → store
  const handleRunScript = useCallback(async () => {
    // Önceki koşunun output/hata bilgisini temizle, buffer'ı sıfırla
    setScriptOutputLog('');
    setScriptStatus({
      running: true,
      lastOutput: '',
      lastError: null,
      lastActionCount: 0,
      lastElapsedMs: 0,
    });
    scriptDispatcher.reset();
    try {
      // Tauri tarafı script-action + script-completed event'leri emit edecek;
      // useScriptDispatcher bunları buffer'layıp tek batch olarak store'a yazar.
      await invoke<void>('execute_script', { script: scriptContent });
    } catch (err) {
      setScriptStatus({
        running: false,
        lastOutput: '',
        lastError: `IPC hatası: ${err}`,
        lastActionCount: 0,
        lastElapsedMs: 0,
      });
    }
  }, [scriptContent, scriptDispatcher]);

  // Proje payload oluştur (kaydetme için)
  function buildProjectPayload() {
    const { metadata: md, scriptContent: sc } = useProjectStore.getState();
    const { components: comps, connections: conns, canvas: cv } = useDesignStore.getState();
    return {
      version: '1.0',
      metadata: md,
      canvas: cv,
      components: comps,
      connections: conns,
      simulation_results: null,
      experiment_data: useExperimentStore.getState().datasets,
      script: sc,
    };
  }

  // Canvas boyutu
  const canvasHeight = Math.max(
    100,
    centerSize.height - (bottomPanelOpen ? bottomPanelHeight : 0) - 1
  );

  return (
    <div className="flex flex-col w-full h-full bg-mf-bg overflow-hidden">
      {/* Üst araç çubuğu */}
      <Toolbar
        onNewProject={handleNewProject}
        onOpenProject={handleOpen}
        onSaveProject={handleSave}
        onExport={handleExport}
        onRunAnalytic={handleRunAnalytic}
        onRunCfd={handleRunCfd}
        onImportExperiment={handleImportExperiment}
        onOpenSweep={() => setSweepDialogOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
        busy={isBusy}
      />

      {/* İnce çalışıyor şeridi — toolbar altında, görsel olarak rahatsız etmez */}
      {isBusy && <div className="progress-line flex-shrink-0" />}

      {/* Ana içerik */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sol panel */}
        {leftPanelOpen && <Sidebar width={leftPanelWidth} />}

        {/* Merkez */}
        <div ref={centerRef} className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <div style={{ height: canvasHeight }} className="flex-shrink-0 overflow-hidden">
            {activeTab === 'canvas' ? (
              <CanvasEditor width={centerSize.width} height={canvasHeight} />
            ) : (
              <Suspense fallback={<EditorLoading height={canvasHeight} />}>
                <ScriptEditor
                  height={canvasHeight}
                  onRunScript={handleRunScript}
                  runStatus={scriptStatus}
                  outputLog={scriptOutputLog}
                />
              </Suspense>
            )}
          </div>

          {/* Alt panel */}
          {bottomPanelOpen && <ResultsPanel height={bottomPanelHeight} />}
        </div>

        {/* Sağ panel */}
        {rightPanelOpen && <PropertiesPanel width={rightPanelWidth} />}
      </div>

      {/* Status bar */}
      <StatusBar components={components} connections={connections} metadata={metadata} isDirty={isDirty} />

      {/* CFD/analitik ilerleme bildirimi (sağ alt köşe) */}
      <ProgressOverlay />

      {/* Dışa aktarma diyaloğu */}
      <ExportDialog
        open={exportDialogOpen}
        busy={exportBusy}
        onCancel={() => { if (!exportBusy) setExportDialogOpen(false); }}
        onConfirm={handleExportConfirm}
      />

      {/* Offscreen PNG renderer — yalnızca aktif iş varken monte olur */}
      {exportJob && <ExportRenderer job={exportJob} />}

      {/* Deney verisi import sihirbazı */}
      <ExperimentImportDialog
        open={expDialogOpen}
        onCancel={() => setExpDialogOpen(false)}
        onConfirm={(ds) => {
          addExperiment(ds);
          setExpDialogOpen(false);
        }}
        suggestedColor={nextExpColor()}
      />

      {/* Parametre taraması (Faz 6B) */}
      <SweepDialog
        open={sweepDialogOpen}
        onClose={() => setSweepDialogOpen(false)}
      />

      {/* Klavye kısayolları (? veya F1) */}
      <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* Toast + onay diyaloğu (native alert/confirm yerine) */}
      <Notifications />
    </div>
  );
};

// ScriptEditor lazy-load sırasında gösterilen yükleme durumu
const EditorLoading: React.FC<{ height: number }> = ({ height }) => (
  <div className="flex items-center justify-center bg-mf-bg" style={{ height }}>
    <div className="flex items-center gap-2 text-mf-text-dim text-sm">
      <span className="inline-block w-4 h-4 border-2 border-mf-border border-t-mf-dye rounded-full animate-spin" />
      Editör yükleniyor…
    </div>
  </div>
);

// ─── Status bar — CAD-stili, hücre tabanlı ─────────────────────────────────
import { useCursorStore } from './stores/useCursorStore';

const StatusBar: React.FC<{
  components: ChipComponent[];
  connections: Connection[];
  metadata: ProjectMetadata;
  isDirty: boolean;
}> = ({ components, connections, metadata, isDirty }) => {
  const zoom     = useDesignStore((s) => s.canvas.zoom);
  const gridSize = useDesignStore((s) => s.canvas.gridSize);
  const cursor   = useCursorStore();
  const simStatus = useSimulationStore((s) => s.status);
  const simResult = useSimulationStore((s) => s.result);
  const sweepRunning = useSweepStore((s) => s.running);

  const portCount = components.filter((c) => c.type === 'port').length;
  const inletCount = components.filter((c) =>
    c.type === 'port' && (c.params as { portType?: string }).portType === 'inlet'
  ).length;
  const outletCount = portCount - inletCount;

  // Sim durumu rozeti
  const simChip = sweepRunning
    ? <StatusChip kind="busy">SWEEP</StatusChip>
    : simStatus === 'running' ? <StatusChip kind="busy">SIM</StatusChip>
    : simStatus === 'completed' && simResult ? <StatusChip kind="ok">{simResult.mode === 'cfd' ? 'CFD' : 'ANL'}</StatusChip>
    : simStatus === 'error' ? <StatusChip kind="err">HATA</StatusChip>
    : <StatusChip kind="idle">IDLE</StatusChip>;

  return (
    <div className="status-bar">
      {/* Sol: marka + proje */}
      <div className="status-cell">
        <div className="brand-mark text-[10px]" style={{ width: 14, height: 14 }}>μ</div>
        <span className="status-cell-value text-mf-text">{metadata.name}</span>
        {isDirty && (
          <span className="text-mf-orange tabular" title="Kaydedilmemiş değişiklikler">●</span>
        )}
      </div>

      {/* Geometri sayaçları */}
      <div className="status-cell">
        <span className="status-cell-key">obj</span>
        <span className="status-cell-value">{components.length.toString().padStart(3, '0')}</span>
        <span className="status-cell-key ml-2">conn</span>
        <span className="status-cell-value">{connections.length.toString().padStart(3, '0')}</span>
      </div>

      {/* Port giriş/çıkış */}
      {portCount > 0 && (
        <div className="status-cell">
          <span className="status-cell-key">i/o</span>
          <span className="status-cell-value">
            <span className="text-mf-green">{inletCount}</span>
            <span className="text-mf-text-dark mx-0.5">/</span>
            <span className="text-mf-red">{outletCount}</span>
          </span>
        </div>
      )}

      {/* Canlı koordinat — fare canvas üzerindeyken */}
      <div className="status-cell" style={{ minWidth: 180 }}>
        <span className="status-cell-key">x,y</span>
        {cursor.inCanvas ? (
          <span className="status-cell-value">
            {cursor.x.toFixed(cursor.precision)}, {cursor.y.toFixed(cursor.precision)}
            <span className="text-mf-text-dark ml-1">μm</span>
          </span>
        ) : (
          <span className="status-cell-value text-mf-text-dark">—</span>
        )}
      </div>

      {/* Grid + zoom (zoom tıklanabilir popover) */}
      <div className="status-cell">
        <span className="status-cell-key">grid</span>
        <span className="status-cell-value">{gridSize}<span className="text-mf-text-dark">μm</span></span>
        <ZoomPopover zoom={zoom} />
      </div>

      {/* Sim durumu */}
      <div className="status-cell">
        {simChip}
      </div>

      {/* Sağ taraf — boşluk + versiyon */}
      <div className="flex-1" />
      <div className="status-cell border-r-0">
        <span className="status-cell-key">v</span>
        <span className="status-cell-value">{APP_VERSION}</span>
      </div>
    </div>
  );
};

// Sim durum çipi
const StatusChip: React.FC<{ kind: 'idle' | 'busy' | 'ok' | 'err'; children: React.ReactNode }> = ({ kind, children }) => {
  const cls = {
    idle: 'text-mf-text-dark border-mf-border',
    busy: 'text-mf-orange border-mf-orange/50 bg-mf-orange/10',
    ok:   'text-mf-green border-mf-green/50 bg-mf-green/10',
    err:  'text-mf-red border-mf-red/60 bg-mf-red/10',
  }[kind];
  return (
    <span className={`px-1.5 py-[1px] text-[9px] font-mono font-semibold uppercase tracking-caps border rounded-sm ${cls}`}>
      {children}
    </span>
  );
};

// Versiyon package.json'dan inject edilir (vite define → __APP_VERSION__)
const APP_VERSION = __APP_VERSION__;

// Zoom göstergesi + tıklanabilir preset menü
const ZOOM_PRESETS = [0.25, 0.5, 1, 2, 4];
const ZoomPopover: React.FC<{ zoom: number }> = ({ zoom }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const setZoom = (z: number) => {
    // zoomBy mevcut zoom'u baz alıyor; mutlak set için store'u kısa devre yapalım
    const c = useDesignStore.getState().canvas;
    useDesignStore.getState().updateCanvas({
      zoom: z,
      // Cursor anchor'a değil, viewport merkezine ortala
      panX: c.panX + (c.zoom - z) * 400,
      panY: c.panY + (c.zoom - z) * 300,
    });
    setOpen(false);
  };

  return (
    <div className="relative inline-flex items-center" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="status-cell-key ml-2 hover:text-mf-text transition-colors"
        title="Zoom presets"
      >
        zoom
      </button>
      <button
        onClick={() => setOpen((o) => !o)}
        className="status-cell-value hover:text-mf-blue transition-colors cursor-pointer"
        title="Zoom seviyesini değiştir"
      >
        {(zoom * 100).toFixed(0)}<span className="text-mf-text-dark">%</span>
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-1 z-50 bg-mf-elev border border-mf-border-strong rounded-sm shadow-pop py-1 min-w-[140px]">
          {ZOOM_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setZoom(p)}
              className={`block w-full text-left px-3 py-1 text-xs font-mono hover:bg-mf-panel transition-colors ${
                Math.abs(zoom - p) < 0.01 ? 'text-mf-blue' : 'text-mf-text'
              }`}
            >
              {(p * 100).toFixed(0)}%
            </button>
          ))}
          <div className="border-t border-mf-border my-1" />
          <button
            onClick={() => { useDesignStore.getState().zoomReset(); setOpen(false); }}
            className="block w-full text-left px-3 py-1 text-xs hover:bg-mf-panel transition-colors text-mf-text"
          >
            Sıfırla <span className="text-mf-text-dark float-right text-2xs">Ctrl+0</span>
          </button>
          <button
            onClick={() => {
              // Fit-all canvas viewport'unu bilemediği için 800×600 varsayılan
              // CanvasEditor zaten F tuşuyla daha doğru hesaplıyor
              const w = window.innerWidth - 240 - 280; // sol/sağ panel kabaca
              const h = window.innerHeight - 36 - 24 - 220; // toolbar/statusbar/altpanel
              useDesignStore.getState().fitAll(Math.max(400, w), Math.max(300, h));
              setOpen(false);
            }}
            className="block w-full text-left px-3 py-1 text-xs hover:bg-mf-panel transition-colors text-mf-text"
          >
            Sığdır <span className="text-mf-text-dark float-right text-2xs">F</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
