/**
 * PropertiesPanel — Sağ panel: Seçili bileşen özellikleri
 */
import React from 'react';
import { useDesignStore } from '../../stores/useDesignStore';
import { useSimulationStore, FLUID_PRESETS } from '../../stores/useSimulationStore';
import { paToMbar, widthBelowFabLimit, W_FAB_MIN_UM } from '../../utils/fab';
import type { FluidPreset } from '../../types';
import clsx from 'clsx';

interface PropertiesPanelProps {
  width: number;
}

// Negatif/sıfır değerlere izin verilmeyen geometrik parametreler
const GEOMETRIC_KEYS = new Set([
  'width',
  'length',
  'depth',
  'radius',
  'mainWidth',
  'branchWidth',
  'channelWidth',
  'pitch',
  'orificeWidth',
  'mainChannelWidth',
  'dispersedChannelWidth',
  'pillarDiameter',
  'spacing',
  'inletWidth',
  'outletWidth',
  'height',
  'diameter',
  'turns',
  'rows',
  'columns',
]);

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ width }) => {
  const { components, selectedIds, updateComponent, removeComponents } = useDesignStore();
  const { params, setParams } = useSimulationStore();

  const selectedComponent =
    selectedIds.length === 1 ? components.find((c) => c.id === selectedIds[0]) : null;
  const multiSelected = selectedIds.length > 1;

  return (
    <div
      className="flex flex-col bg-mf-surface border-l border-mf-border overflow-hidden"
      style={{ width }}
    >
      {/* Bileşen Özellikleri */}
      <div className="panel-header">
        <span>Özellikler</span>
        {selectedComponent && (
          <span className="text-mf-blue text-2xs normal-case font-mono tracking-tight">
            {selectedComponent.type}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {!selectedComponent && !multiSelected && (
          <div className="flex flex-col items-center justify-center py-10 px-3 text-center">
            <div className="text-2xs text-mf-text-dark uppercase tracking-caps mb-1.5">
              Seçim yok
            </div>
            <div className="text-xs text-mf-text-dim leading-relaxed max-w-[200px]">
              Canvas'tan bir bileşene tıklayın veya sol panelden sürükleyip bırakın.
            </div>
          </div>
        )}

        {multiSelected && (
          <div className="px-2 py-3 space-y-2">
            <div className="text-xs text-mf-text">
              <span className="text-mf-blue font-semibold">{selectedIds.length}</span> bileşen
              seçili
            </div>
            <div className="text-[11px] text-mf-text-dark leading-relaxed">
              Toplu özellik düzenleme için tek bileşen seçin. Toplu sil/çoğalt için kısayolları
              kullanın.
            </div>
            <div className="flex flex-col gap-1.5 pt-1">
              <button
                onClick={() => useDesignStore.getState().duplicateSelected()}
                className="px-2 py-1 text-xs rounded border border-mf-border text-mf-text hover:border-mf-blue hover:text-mf-blue"
                title="Ctrl+D"
              >
                Çoğalt (Ctrl+D)
              </button>
              <button
                onClick={() => removeComponents(selectedIds)}
                className="px-2 py-1 text-xs rounded border border-mf-red/40 text-mf-red hover:bg-mf-red/10"
                title="Delete"
              >
                Sil (Del)
              </button>
            </div>
          </div>
        )}

        {selectedComponent && (
          <div className="space-y-3">
            {/* Pozisyon */}
            <PropSection title="Konum">
              <PropRow
                label="X (μm)"
                value={selectedComponent.position.x}
                onChange={(v) =>
                  updateComponent(selectedComponent.id, {
                    position: { ...selectedComponent.position, x: Number(v) },
                  })
                }
              />
              <PropRow
                label="Y (μm)"
                value={selectedComponent.position.y}
                onChange={(v) =>
                  updateComponent(selectedComponent.id, {
                    position: { ...selectedComponent.position, y: Number(v) },
                  })
                }
              />
              <PropRow
                label="Açı (°)"
                value={selectedComponent.rotation}
                onChange={(v) => updateComponent(selectedComponent.id, { rotation: Number(v) })}
              />
            </PropSection>

            {/* Parametreler */}
            <PropSection title="Parametreler">
              {Object.entries(selectedComponent.params).map(([key, value]) => {
                // portType için özel select — text input yerine
                if (key === 'portType') {
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <label className="text-xs text-mf-text-dim w-24 flex-shrink-0 truncate">
                        Port Tipi
                      </label>
                      <select
                        className="mf-input text-xs flex-1"
                        value={String(value)}
                        onChange={(e) =>
                          updateComponent(selectedComponent.id, {
                            params: {
                              ...selectedComponent.params,
                              portType: e.target.value as 'inlet' | 'outlet',
                            },
                          })
                        }
                      >
                        <option value="inlet">Giriş</option>
                        <option value="outlet">Çıkış</option>
                      </select>
                    </div>
                  );
                }
                return (
                  <PropRow
                    key={key}
                    label={formatParamLabel(key)}
                    value={value as number | string}
                    minHint={
                      typeof value === 'number' && GEOMETRIC_KEYS.has(key) ? 0.001 : undefined
                    }
                    onChange={(v) => {
                      // Numerik geometri parametreleri için pozitiflik zorla — negatif
                      // değerler GDS/CFD tessellation'ı bozar.
                      const numeric = Number(v);
                      if (typeof value === 'number' && !isNaN(numeric)) {
                        const clamped = GEOMETRIC_KEYS.has(key)
                          ? Math.max(0.001, numeric)
                          : numeric;
                        updateComponent(selectedComponent.id, {
                          params: { ...selectedComponent.params, [key]: clamped },
                        });
                      } else {
                        updateComponent(selectedComponent.id, {
                          params: {
                            ...selectedComponent.params,
                            [key]: isNaN(numeric) ? v : numeric,
                          },
                        });
                      }
                    }}
                  />
                );
              })}
              {/* Üretilebilirlik uyarısı (fab-check) */}
              {widthBelowFabLimit(
                selectedComponent.params as unknown as Record<string, unknown>,
              ) && (
                <div className="mt-1.5 px-2 py-1.5 text-2xs leading-relaxed rounded-sm border border-mf-orange/40 bg-mf-orange/10 text-mf-orange">
                  ⚠ Üretim limiti: kanal genişliği ≥ {W_FAB_MIN_UM} µm olmalı. Daha dar kanallar
                  standart fabrikasyonda güvenilir üretilemez.
                </div>
              )}
            </PropSection>

            {/* Etiket */}
            <PropSection title="Etiket">
              <input
                type="text"
                className="mf-input text-xs"
                value={selectedComponent.label ?? ''}
                onChange={(e) => updateComponent(selectedComponent.id, { label: e.target.value })}
                placeholder="Bileşen etiketi..."
              />
            </PropSection>
          </div>
        )}
      </div>

      {/* Simülasyon Parametreleri */}
      <div className="border-t border-mf-border">
        <div className="panel-header">
          <span>Simülasyon</span>
        </div>
        <div className="px-3 py-3 space-y-3">
          {/* Akışkan seçimi */}
          <div>
            <label className="text-2xs text-mf-text-dim uppercase tracking-caps block mb-1">
              Akışkan
            </label>
            <select
              className="mf-input text-xs"
              value={params.fluid}
              onChange={(e) => {
                const fluid = e.target.value as FluidPreset;
                setParams({ fluid, fluidProperties: FLUID_PRESETS[fluid] });
              }}
            >
              {Object.entries(FLUID_PRESETS).map(([key, f]) => (
                <option key={key} value={key}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Giriş basıncı */}
          <div>
            <label className="text-2xs text-mf-text-dim uppercase tracking-caps block mb-1">
              Giriş Basıncı
            </label>
            <div className="relative">
              <input
                type="number"
                className="mf-input text-xs font-mono pr-8"
                value={params.inletPressure ?? 1000}
                onChange={(e) => setParams({ inletPressure: Number(e.target.value) })}
                min={0}
                step={100}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-mf-text-dark pointer-events-none font-mono">
                Pa
              </span>
            </div>
            {/* İkincil mbar gösterimi (1 mbar = 100 Pa) */}
            <div className="mt-0.5 text-2xs text-mf-text-dark font-mono text-right">
              = {paToMbar(params.inletPressure ?? 1000).toFixed(2)} mbar
            </div>
          </div>

          {/* Grid çözünürlüğü */}
          <div>
            <label className="text-2xs text-mf-text-dim uppercase tracking-caps block mb-1">
              CFD Çözünürlüğü
            </label>
            <div className="flex gap-0 bg-mf-bg border border-mf-border rounded-sm overflow-hidden">
              {(['coarse', 'medium', 'fine'] as const).map((res, i) => (
                <button
                  key={res}
                  onClick={() => setParams({ gridResolution: res })}
                  className={clsx(
                    'flex-1 py-1 text-2xs uppercase tracking-caps font-semibold transition-colors',
                    i > 0 && 'border-l border-mf-border',
                    params.gridResolution === res
                      ? 'bg-mf-blue/15 text-mf-blue'
                      : 'text-mf-text-dim hover:text-mf-text hover:bg-mf-elev',
                  )}
                  title={
                    res === 'coarse'
                      ? '60×16, 400 iter'
                      : res === 'medium'
                        ? '100×24, 800 iter'
                        : '160×36, 1400 iter'
                  }
                >
                  {res === 'coarse' ? 'Kaba' : res === 'medium' ? 'Orta' : 'İnce'}
                </button>
              ))}
            </div>
          </div>

          {/* Akışkan özellikleri özeti — okunur, hizalı */}
          <div className="bg-mf-bg border border-mf-border rounded-sm px-2 py-1.5 space-y-0.5 font-mono">
            <div className="flex justify-between text-2xs">
              <span className="text-mf-text-dark">μ</span>
              <span className="text-mf-text">
                {params.fluidProperties.viscosity} <span className="text-mf-text-dark">Pa·s</span>
              </span>
            </div>
            <div className="flex justify-between text-2xs">
              <span className="text-mf-text-dark">ρ</span>
              <span className="text-mf-text">
                {params.fluidProperties.density} <span className="text-mf-text-dark">kg/m³</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Yardımcı bileşenler
const PropSection: React.FC<{
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}> = ({ title, children, defaultOpen = true }) => {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="section-title w-full mb-1.5 hover:text-mf-text transition-colors cursor-pointer"
        aria-expanded={open}
      >
        <span style={{ width: 8, display: 'inline-block', textAlign: 'center' }}>
          {open ? '▾' : '▸'}
        </span>
        {title}
      </button>
      {open && <div className="space-y-1">{children}</div>}
    </div>
  );
};

interface PropRowProps {
  label: string;
  value: number | string;
  onChange: (v: string) => void;
  /** Minimum kabul edilen değer — input bu değerin altındaysa kırmızı kenar göster. */
  minHint?: number;
}
const PropRow: React.FC<PropRowProps> = ({ label, value, onChange, minHint }) => {
  const tooLow = typeof value === 'number' && minHint !== undefined && value <= minHint;
  // "Genişlik (μm)" → label="Genişlik", unit="μm"
  const m = label.match(/^(.+?)\s*\((.+?)\)\s*$/);
  const niceLabel = m?.[1] ?? label;
  const unit = m?.[2];
  return (
    <div className="flex items-center gap-2 group">
      <label
        className="text-2xs text-mf-text-dim w-20 flex-shrink-0 truncate uppercase tracking-caps"
        title={label}
      >
        {niceLabel}
      </label>
      <div className="relative flex-1">
        <input
          type={typeof value === 'number' ? 'number' : 'text'}
          className={clsx(
            'mf-input text-xs font-mono w-full',
            unit && 'pr-7',
            tooLow && 'border-mf-yellow',
          )}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          step={typeof value === 'number' ? 'any' : undefined}
          min={minHint}
          title={tooLow ? `Minimum: ${minHint}. Otomatik clamp uygulanır.` : undefined}
        />
        {unit && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-mf-text-dark pointer-events-none font-mono">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
};

function formatParamLabel(key: string): string {
  const labels: Record<string, string> = {
    width: 'Genişlik (μm)',
    length: 'Uzunluk (μm)',
    depth: 'Derinlik (μm)',
    radius: 'Yarıçap (μm)',
    angle: 'Açı (°)',
    mainWidth: 'Ana Genişlik (μm)',
    branchWidth: 'Dal Genişliği (μm)',
    branchAngle: 'Dal Açısı (°)',
    channelWidth: 'Kanal Genişliği (μm)',
    turns: 'Tur Sayısı',
    pitch: 'Adım (μm)',
    diameter: 'Çap (μm)',
    portType: 'Port Tipi',
    orificeWidth: 'Orifis Genişliği (μm)',
    mainChannelWidth: 'Ana Kanal (μm)',
    dispersedChannelWidth: 'Dağılmış Kanal (μm)',
    pillarDiameter: 'Pillar Çapı (μm)',
    spacing: 'Aralık (μm)',
    rows: 'Satır',
    columns: 'Sütun',
    inletWidth: 'Giriş Genişliği (μm)',
    outletWidth: 'Çıkış Genişliği (μm)',
    height: 'Yükseklik (μm)',
  };
  return labels[key] ?? key;
}

export default PropertiesPanel;
