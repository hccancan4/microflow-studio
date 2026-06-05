/**
 * Toolbar — Üst araç çubuğu
 * Dosya işlemleri, düzenleme araçları, simülasyon butonları
 */
import React from 'react';
import {
  FiFile,
  FiFolder,
  FiSave,
  FiDownload,
  FiRotateCcw,
  FiRotateCw,
  FiPlay,
  FiZap,
  FiSidebar,
  FiCode,
  FiDatabase,
  FiSliders,
  FiLayout,
  FiHelpCircle,
} from 'react-icons/fi';
import { useProjectStore } from '../../stores/useProjectStore';
import { useDesignStore } from '../../stores/useDesignStore';
import clsx from 'clsx';

interface ToolbarProps {
  onNewProject: () => void;
  onOpenProject: () => void;
  onSaveProject: () => void;
  onExport: () => void;
  onRunAnalytic: () => void;
  onRunCfd: () => void;
  onImportExperiment: () => void;
  onOpenSweep: () => void;
  onOpenHelp: () => void;
  /** Simülasyon ya da sweep çalışırken simülasyon butonlarını disabled yap. */
  busy?: boolean;
}

const Toolbar: React.FC<ToolbarProps> = ({
  onNewProject,
  onOpenProject,
  onSaveProject,
  onExport,
  onRunAnalytic,
  onRunCfd,
  onImportExperiment,
  onOpenSweep,
  onOpenHelp,
  busy = false,
}) => {
  const {
    metadata,
    isDirty,
    leftPanelOpen,
    rightPanelOpen,
    bottomPanelOpen,
    toggleLeftPanel,
    toggleRightPanel,
    toggleBottomPanel,
    activeTab,
    setActiveTab,
  } = useProjectStore();
  const { undo, redo, canUndo, canRedo, components } = useDesignStore();
  const hasComponents = components.length > 0;
  const canSimulate = hasComponents && !busy;

  // Project metadata artık StatusBar'da gösteriliyor — toolbar'da yer açıyor
  void metadata;
  void isDirty;
  return (
    <div className="flex items-center h-9 bg-mf-panel border-b border-mf-border px-1.5 flex-shrink-0 select-none">
      {/* Brand mark — kompakt */}
      <div className="brand-mark mr-2" title="MicroFlow Studio">
        μ
      </div>

      <div className="tool-divider" />

      {/* Dosya işlemleri */}
      <ToolbarButton icon={<FiFile />} label="Yeni Proje (Ctrl+N)" onClick={onNewProject} />
      <ToolbarButton icon={<FiFolder />} label="Aç (Ctrl+O)" onClick={onOpenProject} />
      <ToolbarButton
        icon={<FiSave />}
        label={
          isDirty
            ? 'Kaydet (Ctrl+S) — kaydedilmemiş değişiklikler var'
            : 'Kaydet (Ctrl+S) — değişiklik yok'
        }
        onClick={onSaveProject}
        accent={isDirty}
        disabled={!isDirty}
      />

      <div className="tool-divider" />

      {/* Düzenleme */}
      <ToolbarButton
        icon={<FiRotateCcw />}
        label="Geri Al (Ctrl+Z)"
        onClick={undo}
        disabled={!canUndo()}
      />
      <ToolbarButton
        icon={<FiRotateCw />}
        label="İleri Al (Ctrl+Y)"
        onClick={redo}
        disabled={!canRedo()}
      />

      <div className="tool-divider" />

      {/* Mod seçimi — Canvas / Script */}
      <div className="flex items-center bg-mf-bg rounded-sm overflow-hidden border border-mf-border h-[22px]">
        <button
          className={clsx(
            'px-2.5 h-full text-2xs uppercase tracking-caps font-semibold transition-colors',
            activeTab === 'canvas'
              ? 'bg-mf-blue/15 text-mf-blue'
              : 'text-mf-text-dim hover:text-mf-text',
          )}
          onClick={() => setActiveTab('canvas')}
          title="Görsel tasarım — F1"
        >
          Canvas
        </button>
        <div className="w-px h-full bg-mf-border" />
        <button
          className={clsx(
            'px-2.5 h-full text-2xs uppercase tracking-caps font-semibold transition-colors flex items-center gap-1',
            activeTab === 'script'
              ? 'bg-mf-blue/15 text-mf-blue'
              : 'text-mf-text-dim hover:text-mf-text',
          )}
          onClick={() => setActiveTab('script')}
          title="Lua scripting — F2"
        >
          <FiCode size={10} /> Script
        </button>
      </div>

      <div className="tool-divider" />

      {/* Simülasyon — tek bir bütün gibi gruplanmış */}
      <div className="flex items-center bg-mf-bg border border-mf-border rounded-sm overflow-hidden">
        <SimButton
          icon={<FiZap size={12} />}
          label="Hızlı Analiz"
          accentColor="orange"
          enabled={canSimulate}
          hasComponents={hasComponents}
          busy={busy}
          onClick={onRunAnalytic}
          tooltip="Analitik çözücü — direnç ağı (F5)"
        />
        <div className="w-px h-5 bg-mf-border self-center" />
        <SimButton
          icon={<FiPlay size={12} />}
          label="CFD"
          accentColor="blue"
          enabled={canSimulate}
          hasComponents={hasComponents}
          busy={busy}
          onClick={onRunCfd}
          tooltip="2D Stokes çözücü"
        />
        <div className="w-px h-5 bg-mf-border self-center" />
        <SimButton
          icon={<FiSliders size={12} />}
          label="Tarama"
          accentColor="neutral"
          enabled={canSimulate}
          hasComponents={hasComponents}
          busy={busy}
          onClick={onOpenSweep}
          tooltip="Parametre taraması — batch analitik"
        />
      </div>

      <div className="flex-1" />

      {/* Deney verisi */}
      <ToolbarButton
        icon={<FiDatabase />}
        label="Deney Verisi İçe Aktar"
        onClick={onImportExperiment}
      />
      <ToolbarButton icon={<FiDownload />} label="Dışa Aktar (Ctrl+E)" onClick={onExport} />

      <div className="tool-divider" />

      {/* Panel toggle'ları */}
      <ToolbarButton
        icon={<FiSidebar />}
        label={leftPanelOpen ? 'Sol Paneli Gizle' : 'Sol Paneli Göster'}
        onClick={toggleLeftPanel}
        accent={leftPanelOpen}
      />
      <ToolbarButton
        icon={<FiLayout />}
        label={bottomPanelOpen ? 'Alt Paneli Gizle' : 'Alt Paneli Göster'}
        onClick={toggleBottomPanel}
        accent={bottomPanelOpen}
      />
      <ToolbarButton
        icon={<FiSidebar style={{ transform: 'scaleX(-1)' }} />}
        label={rightPanelOpen ? 'Sağ Paneli Gizle' : 'Sağ Paneli Göster'}
        onClick={toggleRightPanel}
        accent={rightPanelOpen}
      />

      <div className="tool-divider" />
      <ToolbarButton icon={<FiHelpCircle />} label="Klavye Kısayolları (?)" onClick={onOpenHelp} />
    </div>
  );
};

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
}

// Sim grubu içindeki tek tip buton — kompakt, durum-bilinçli
interface SimButtonProps {
  icon: React.ReactNode;
  label: string;
  accentColor: 'orange' | 'blue' | 'neutral';
  enabled: boolean;
  hasComponents: boolean;
  busy: boolean;
  onClick: () => void;
  tooltip: string;
}
const SimButton: React.FC<SimButtonProps> = ({
  icon,
  label,
  accentColor,
  enabled,
  hasComponents,
  busy,
  onClick,
  tooltip,
}) => {
  const colorEnabled = {
    orange: 'text-mf-orange hover:bg-mf-orange/10',
    blue: 'text-mf-blue hover:bg-mf-blue/10',
    neutral: 'text-mf-text hover:bg-mf-elev',
  }[accentColor];
  return (
    <button
      onClick={onClick}
      disabled={!enabled}
      title={
        !hasComponents
          ? `${tooltip} — önce canvas'a bileşen ekleyin`
          : busy
            ? `${tooltip} — başka simülasyon çalışıyor`
            : tooltip
      }
      aria-label={label}
      className={clsx(
        'flex items-center gap-1.5 px-2.5 h-[22px] text-2xs uppercase tracking-caps font-semibold transition-colors',
        enabled ? colorEnabled : 'text-mf-text-dark cursor-not-allowed',
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
};

const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  icon,
  label,
  onClick,
  disabled,
  accent,
}) => (
  <button
    title={label}
    aria-label={label}
    onClick={onClick}
    disabled={disabled}
    className={clsx(
      'btn-icon w-[26px] h-[26px]',
      disabled && 'opacity-30 cursor-not-allowed',
      accent && 'text-mf-blue bg-mf-blue/10',
    )}
  >
    {icon}
  </button>
);

export default Toolbar;
