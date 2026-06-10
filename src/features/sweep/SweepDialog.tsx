/**
 * SweepDialog — Parametre tarama (sweep) kurulum dialogu (Faz 6B).
 *
 * Akış:
 *  1. Bileşen seç (dropdown — yalnızca süpürülebilir param'ı olan tipler)
 *  2. Parametre seç (bileşen tipine göre filtrelenir)
 *  3. Başlangıç / bitiş / adım gir (live preview ile ilk/son birkaç değer)
 *  4. "Taramayı Başlat" → sweepRunner çağırılır
 */
import React, { useMemo, useState, useEffect } from 'react';
import { FiX, FiPlay } from 'react-icons/fi';
import { useDesignStore } from '../../stores/useDesignStore';
import { useSimulationStore } from '../../stores/useSimulationStore';
import { useSweepStore, buildSweepValues } from './useSweepStore';
import { componentDisplayLabel, getParamOption, getSweepableParams } from './sweepHelpers';
import { runSweep } from './sweepRunner';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { toast } from '../../stores/useUiStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SweepDialog: React.FC<Props> = ({ open, onClose }) => {
  const { components, connections } = useDesignStore();
  const params = useSimulationStore((s) => s.params);

  const [componentId, setComponentId] = useState<string>('');
  const [paramKey, setParamKey] = useState<string>('');
  const [start, setStart] = useState<number>(50);
  const [end, setEnd] = useState<number>(500);
  const [steps, setSteps] = useState<number>(10);

  // Başlangıç seçimi — açıldığında ilk sweepable bileşene kilitle
  useEffect(() => {
    if (!open) return;
    if (components.length === 0) return;
    const first = components.find((c) => getSweepableParams(c.type).length > 0);
    if (first) {
      setComponentId(first.id);
      const firstParam = getSweepableParams(first.type)[0];
      setParamKey(firstParam.key);
      const cur =
        (first.params as unknown as Record<string, number>)[firstParam.key] ?? firstParam.min;
      setStart(Math.max(firstParam.min, cur * 0.5));
      setEnd(Math.min(firstParam.maxHint, cur * 2));
      setSteps(10);
    }
  }, [open, components]);

  const selectedComponent = components.find((c) => c.id === componentId);
  const paramOptions = selectedComponent ? getSweepableParams(selectedComponent.type) : [];
  const selectedParam = selectedComponent
    ? getParamOption(selectedComponent.type, paramKey)
    : undefined;

  // Parametre değiştiğinde varsayılan aralık
  const handleParamChange = (newKey: string) => {
    setParamKey(newKey);
    if (selectedComponent) {
      const opt = getParamOption(selectedComponent.type, newKey);
      if (opt) {
        const cur =
          (selectedComponent.params as unknown as Record<string, number>)[newKey] ?? opt.min;
        setStart(Math.max(opt.min, cur * 0.5));
        setEnd(Math.min(opt.maxHint, cur * 2));
      }
    }
  };

  const handleComponentChange = (id: string) => {
    setComponentId(id);
    const c = components.find((x) => x.id === id);
    if (c) {
      const first = getSweepableParams(c.type)[0];
      if (first) handleParamChange(first.key);
    }
  };

  const preview = useMemo(() => {
    if (!selectedParam) return [];
    return buildSweepValues(start, end, steps);
  }, [start, end, steps, selectedParam]);

  const validSteps = steps >= 2 && steps <= 200;
  const validRange = end > start && start >= (selectedParam?.min ?? 0);
  const canStart = !!selectedComponent && !!selectedParam && validSteps && validRange;

  const handleStart = async () => {
    if (!selectedComponent || !selectedParam) return;
    const idx = components.findIndex((c) => c.id === selectedComponent.id);
    const cfg = {
      componentId: selectedComponent.id,
      componentLabel: componentDisplayLabel(selectedComponent, idx),
      paramKey: selectedParam.key,
      paramLabel: selectedParam.label,
      unit: selectedParam.unit,
      start,
      end,
      steps,
    };
    onClose();
    // Arka planda başlat — dialog kapandıktan sonra ResultsPanel.Sweep sekmesi canlı güncellenir
    runSweep({
      components,
      connections,
      inletPressure: params.inletPressure ?? 1000,
      fluid: params.fluidProperties,
      config: cfg,
    }).catch((e) => {
      console.error('Sweep hatası:', e);
      toast.error(`Tarama hatası: ${e}`);
    });
  };

  const running = useSweepStore((s) => s.running);

  // ESC ile kapat (running iken kapatma)
  useEscapeClose(open && !running, onClose);

  if (!open) return null;

  return (
    <div
      className="backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sweep-dialog-title"
      onMouseDown={(e) => {
        // Backdrop click ile kapat (running değilse)
        if (e.target === e.currentTarget && !running) onClose();
      }}
    >
      <div className="dialog-enter bg-mf-panel border border-mf-border rounded-ds-lg shadow-pop w-[560px] max-w-[92vw] max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-mf-border">
          <h3 id="sweep-dialog-title" className="text-mf-text text-sm font-semibold">
            Parametre Taraması
          </h3>
          <button
            onClick={onClose}
            className="text-mf-text-dim hover:text-mf-text"
            aria-label="Kapat"
            disabled={running}
          >
            <FiX size={14} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {components.length === 0 && (
            <div className="text-mf-text-dim text-sm">Canvas'ta tarama yapılacak bileşen yok.</div>
          )}

          {components.length > 0 && (
            <>
              {/* Bileşen seçimi */}
              <div>
                <label className="block text-xs text-mf-text-dim mb-1">Bileşen</label>
                <select
                  value={componentId}
                  onChange={(e) => handleComponentChange(e.target.value)}
                  className="w-full bg-mf-bg border border-mf-border rounded px-2 py-1.5 text-sm text-mf-text"
                >
                  {components.map((c, i) => {
                    const sweepable = getSweepableParams(c.type).length > 0;
                    return (
                      <option key={c.id} value={c.id} disabled={!sweepable}>
                        {componentDisplayLabel(c, i)}
                        {!sweepable ? ' (taranabilir param yok)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Param seçimi */}
              <div>
                <label className="block text-xs text-mf-text-dim mb-1">Parametre</label>
                <select
                  value={paramKey}
                  onChange={(e) => handleParamChange(e.target.value)}
                  className="w-full bg-mf-bg border border-mf-border rounded px-2 py-1.5 text-sm text-mf-text"
                  disabled={paramOptions.length === 0}
                >
                  {paramOptions.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label} {p.unit && `(${p.unit})`}
                    </option>
                  ))}
                </select>
                {selectedComponent && selectedParam && (
                  <div className="text-xs text-mf-text-dim mt-1">
                    Mevcut değer:{' '}
                    <span className="text-mf-text">
                      {
                        (selectedComponent.params as unknown as Record<string, number>)[
                          selectedParam.key
                        ]
                      }
                    </span>{' '}
                    {selectedParam.unit}
                  </div>
                )}
              </div>

              {/* Aralık */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-mf-text-dim mb-1">Başlangıç</label>
                  <input
                    type="number"
                    value={start}
                    onChange={(e) => setStart(parseFloat(e.target.value))}
                    className="w-full bg-mf-bg border border-mf-border rounded px-2 py-1.5 text-sm text-mf-text"
                    step="any"
                  />
                </div>
                <div>
                  <label className="block text-xs text-mf-text-dim mb-1">Bitiş</label>
                  <input
                    type="number"
                    value={end}
                    onChange={(e) => setEnd(parseFloat(e.target.value))}
                    className="w-full bg-mf-bg border border-mf-border rounded px-2 py-1.5 text-sm text-mf-text"
                    step="any"
                  />
                </div>
                <div>
                  <label className="block text-xs text-mf-text-dim mb-1">Adım sayısı</label>
                  <input
                    type="number"
                    value={steps}
                    min={2}
                    max={200}
                    onChange={(e) => setSteps(parseInt(e.target.value) || 2)}
                    className="w-full bg-mf-bg border border-mf-border rounded px-2 py-1.5 text-sm text-mf-text"
                  />
                </div>
              </div>

              {!validRange && (
                <div className="text-xs text-mf-orange">
                  Bitiş değeri başlangıçtan büyük olmalı.
                </div>
              )}
              {!validSteps && (
                <div className="text-xs text-mf-orange">Adım sayısı 2 ile 200 arasında olmalı.</div>
              )}

              {/* Önizleme */}
              {preview.length > 0 && (
                <div className="bg-mf-bg border border-mf-border rounded p-2">
                  <div className="text-xs text-mf-text-dim mb-1">
                    Önizleme — {preview.length} koşu:
                  </div>
                  <div className="text-xs text-mf-text font-mono">
                    {preview.length <= 8
                      ? preview.map((v) => v.toFixed(2)).join(', ')
                      : `${preview
                          .slice(0, 3)
                          .map((v) => v.toFixed(2))
                          .join(', ')} … ${preview
                          .slice(-3)
                          .map((v) => v.toFixed(2))
                          .join(', ')}`}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-mf-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-mf-text-dim hover:text-mf-text"
          >
            Vazgeç
          </button>
          <button
            onClick={handleStart}
            disabled={!canStart || running}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium
                       bg-mf-blue text-mf-bg hover:bg-blue-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FiPlay size={12} />
            {running ? 'Tarama devam ediyor...' : 'Taramayı Başlat'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SweepDialog;
