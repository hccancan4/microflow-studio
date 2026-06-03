/**
 * StatusBar — alt durum çubuğu (CAD-stili, hücre tabanlı).
 * Proje adı, geometri sayaçları, port i/o, canlı koordinat, grid+zoom
 * (tıklanabilir preset popover), simülasyon durum çipi, versiyon.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useDesignStore } from '../../stores/useDesignStore';
import { useSimulationStore } from '../../stores/useSimulationStore';
import { useSweepStore } from '../../stores/useSweepStore';
import { useCursorStore } from '../../stores/useCursorStore';
import type { ChipComponent, Connection, ProjectMetadata } from '../../types';

// Versiyon package.json'dan inject edilir (vite define → __APP_VERSION__)
const APP_VERSION = __APP_VERSION__;

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

export default StatusBar;
