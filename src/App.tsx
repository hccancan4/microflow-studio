/**
 * App.tsx — MicroFlow Studio kompozisyon kökü.
 * İş mantığı hook'lara (useProjectIO / useSimulationRun / useExportFlow /
 * useScriptRun / useKeyboardShortcuts), sunum parçaları bileşenlere taşındı.
 * Bu dosya yalnız bunları birleştirir + layout iskeletini render eder.
 */
import React, { useState, useRef, useCallback, Suspense, lazy } from 'react';

import Toolbar from './components/Toolbar/Toolbar';
import Sidebar from './components/Sidebar/Sidebar';
import CanvasEditor from './components/Canvas/CanvasEditor';
// ScriptEditor (Monaco) yalnız Script sekmesine geçilince yüklenir (kod-bölme).
const ScriptEditor = lazy(() => import('./components/ScriptEditor/ScriptEditor'));
import ResultsPanel from './components/ResultsPanel/ResultsPanel';
import PropertiesPanel from './components/PropertiesPanel/PropertiesPanel';
import ProgressOverlay from './components/overlays/ProgressOverlay';
import ExportDialog from './features/export/ExportDialog';
import ExperimentImportDialog from './features/experiment/ExperimentImportDialog';
import SweepDialog from './components/SweepDialog';
import KeyboardHelp from './components/overlays/KeyboardHelp';
import StatusBar from './components/StatusBar/StatusBar';
import EditorLoading from './components/overlays/EditorLoading';
import Notifications from './components/overlays/Notifications';
import ExportRenderer from './features/export/exportRenderer';

import { useProjectStore } from './stores/useProjectStore';
import { useDesignStore } from './stores/useDesignStore';
import { useSimulationStore } from './stores/useSimulationStore';
import { useSweepStore } from './stores/useSweepStore';
import { useExperimentStore } from './features/experiment/useExperimentStore';

import { useElementSize } from './hooks/useElementSize';
import { useProjectIO } from './hooks/useProjectIO';
import { useSimulationRun } from './hooks/useSimulationRun';
import { useExportFlow } from './hooks/useExportFlow';
import { useScriptRun } from './hooks/useScriptRun';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

import './index.css';

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
  } = useProjectStore();

  // Seçici abonelik: App yalnız components/connections değişince re-render eder
  // (canvas pan/zoom, seçim, dragOffset değişiklikleri App'i tetiklemez).
  const components = useDesignStore((s) => s.components);
  const connections = useDesignStore((s) => s.connections);
  // Sim durumu — busy şeridi + toolbar disable için
  const simStatus = useSimulationStore((s) => s.status);
  const sweepRunning = useSweepStore((s) => s.running);
  const isBusy = simStatus === 'running' || sweepRunning;

  const centerRef = useRef<HTMLDivElement>(null);
  const centerSize = useElementSize(centerRef);

  // ── İş mantığı hook'ları ─────────────────────────────────────────────────
  const { handleNewProject, handleSave, handleSaveAs, handleOpen } = useProjectIO();
  const { handleRunAnalytic, handleRunCfd } = useSimulationRun(components, connections);
  const {
    exportDialogOpen,
    setExportDialogOpen,
    exportBusy,
    exportJob,
    handleExport,
    handleExportConfirm,
  } = useExportFlow(components, connections);
  const { handleRunScript, scriptStatus, scriptOutputLog } = useScriptRun();

  // ── Dialog durumları ─────────────────────────────────────────────────────
  const [expDialogOpen, setExpDialogOpen] = useState(false);
  const [sweepDialogOpen, setSweepDialogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const addExperiment = useExperimentStore((s) => s.addDataset);
  const nextExpColor = useExperimentStore((s) => s.nextColor);
  const handleImportExperiment = useCallback(() => setExpDialogOpen(true), []);

  useKeyboardShortcuts({
    onSave: handleSave,
    onSaveAs: handleSaveAs,
    onOpen: handleOpen,
    onNewProject: handleNewProject,
    onExport: handleExport,
    onToggleHelp: () => setHelpOpen((o) => !o),
  });

  // Canvas boyutu
  const canvasHeight = Math.max(
    100,
    centerSize.height - (bottomPanelOpen ? bottomPanelHeight : 0) - 1,
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
      <StatusBar
        components={components}
        connections={connections}
        metadata={metadata}
        isDirty={isDirty}
      />

      {/* CFD/analitik ilerleme bildirimi (sağ alt köşe) */}
      <ProgressOverlay />

      {/* Dışa aktarma diyaloğu */}
      <ExportDialog
        open={exportDialogOpen}
        busy={exportBusy}
        onCancel={() => {
          if (!exportBusy) setExportDialogOpen(false);
        }}
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

      {/* Parametre taraması */}
      <SweepDialog open={sweepDialogOpen} onClose={() => setSweepDialogOpen(false)} />

      {/* Klavye kısayolları (? veya F1) */}
      <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* Toast + onay diyaloğu (native alert/confirm yerine) */}
      <Notifications />
    </div>
  );
};

export default App;
