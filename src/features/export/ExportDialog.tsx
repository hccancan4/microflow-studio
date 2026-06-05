/**
 * ExportDialog.tsx — Tasarımı PNG / SVG olarak dışa aktarma modalı.
 *
 * Format, DPI, arka plan, ölçek çubuğu ve kenar payı gibi seçenekleri
 * kullanıcıdan toplar; "Dışa Aktar" butonu `onConfirm` ile çağırır.
 *
 * Orkestrasyon (render → backend save) App.tsx tarafında yapılır; bu bileşen
 * yalnızca seçenekleri toplar ve kapatma sinyallerini yönetir.
 */
import React, { useState } from 'react';
import { FiX, FiImage, FiFileText, FiDownload, FiLayers } from 'react-icons/fi';
import clsx from 'clsx';
import { useEscapeClose } from '../../hooks/useEscapeClose';

export type ExportFormat = 'png' | 'svg' | 'gds';
export type ExportBackground = 'white' | 'dark' | 'transparent';

export interface ExportSettings {
  format: ExportFormat;
  dpi: 96 | 150 | 300 | 600;
  background: ExportBackground;
  includeScaleBar: boolean;
  paddingUm: number;
  /** GDS-II (Faz 5B) için ayrılan ayar — arc→polyline nokta sayısı. */
  arcResolution: number;
}

interface ExportDialogProps {
  open: boolean;
  busy?: boolean;
  defaultSettings?: Partial<ExportSettings>;
  onCancel: () => void;
  onConfirm: (settings: ExportSettings) => void;
}

const DPI_OPTIONS: Array<{ value: ExportSettings['dpi']; label: string }> = [
  { value: 96, label: '96 DPI (ekran)' },
  { value: 150, label: '150 DPI (taslak)' },
  { value: 300, label: '300 DPI (baskı)' },
  { value: 600, label: '600 DPI (yüksek)' },
];

const BG_OPTIONS: Array<{ value: ExportBackground; label: string; color: string }> = [
  { value: 'white', label: 'Beyaz', color: '#ffffff' },
  { value: 'dark', label: 'Koyu', color: '#0d1117' },
  { value: 'transparent', label: 'Şeffaf', color: 'transparent' },
];

const ExportDialog: React.FC<ExportDialogProps> = ({
  open,
  busy,
  defaultSettings,
  onCancel,
  onConfirm,
}) => {
  const [format, setFormat] = useState<ExportFormat>(defaultSettings?.format ?? 'png');
  const [dpi, setDpi] = useState<ExportSettings['dpi']>(defaultSettings?.dpi ?? 300);
  const [background, setBackground] = useState<ExportBackground>(
    defaultSettings?.background ?? 'white',
  );
  const [includeScaleBar, setScaleBar] = useState<boolean>(
    defaultSettings?.includeScaleBar ?? true,
  );
  const [paddingUm, setPaddingUm] = useState<number>(defaultSettings?.paddingUm ?? 2000);
  const [arcResolution, setArcResolution] = useState<number>(defaultSettings?.arcResolution ?? 64);

  // ESC ile kapat (busy iken kapatma)
  useEscapeClose(open && !busy, onCancel);

  if (!open) return null;

  const handleConfirm = () => {
    onConfirm({ format, dpi, background, includeScaleBar, paddingUm, arcResolution });
  };

  return (
    <div
      className="backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="dialog-enter bg-mf-panel border border-mf-border rounded-ds-lg shadow-pop w-[480px] max-w-[94vw] text-mf-text">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-mf-border">
          <div className="flex items-center gap-2">
            <FiDownload className="text-mf-blue" />
            <h2 className="text-sm font-semibold">Tasarımı Dışa Aktar</h2>
          </div>
          <button className="btn-icon w-6 h-6" onClick={onCancel} disabled={busy} title="Kapat">
            <FiX size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 text-xs">
          {/* Format */}
          <Field label="Format">
            <div className="grid grid-cols-3 gap-2">
              <FormatButton
                active={format === 'png'}
                onClick={() => setFormat('png')}
                icon={<FiImage />}
                label="PNG"
                sub="Raster — DPI seçilebilir"
              />
              <FormatButton
                active={format === 'svg'}
                onClick={() => setFormat('svg')}
                icon={<FiFileText />}
                label="SVG"
                sub="Vektör — sunum/yayın"
              />
              <FormatButton
                active={format === 'gds'}
                onClick={() => setFormat('gds')}
                icon={<FiLayers />}
                label="GDS-II"
                sub="Litografi maskesi"
              />
            </div>
          </Field>

          {/* DPI (only for PNG) */}
          {format === 'png' && (
            <Field label="Çözünürlük">
              <select
                className="w-full bg-mf-bg border border-mf-border rounded px-2 py-1 text-mf-text"
                value={dpi}
                onChange={(e) => setDpi(Number(e.target.value) as ExportSettings['dpi'])}
                disabled={busy}
              >
                {DPI_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {/* Background — GDS-II binary maskede anlamsız, gizle */}
          {format !== 'gds' && (
            <Field label="Arka Plan">
              <div className="flex gap-2">
                {BG_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setBackground(o.value)}
                    disabled={busy}
                    className={clsx(
                      'flex-1 px-2 py-2 rounded border text-xs transition-colors',
                      background === o.value
                        ? 'border-mf-blue bg-mf-blue/10 text-mf-text'
                        : 'border-mf-border text-mf-text-dim hover:text-mf-text',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block w-4 h-4 rounded border border-mf-border"
                        style={{
                          background:
                            o.value === 'transparent'
                              ? 'repeating-conic-gradient(#888 0 25%, #ccc 0 50%) 50%/8px 8px'
                              : o.color,
                        }}
                      />
                      {o.label}
                    </div>
                  </button>
                ))}
              </div>
            </Field>
          )}

          {/* Kenar payı */}
          <Field label={`Kenar Payı — ${paddingUm} μm`}>
            <input
              type="range"
              min={0}
              max={10000}
              step={100}
              value={paddingUm}
              onChange={(e) => setPaddingUm(Number(e.target.value))}
              disabled={busy}
              className="w-full"
            />
          </Field>

          {/* Scale bar — PNG/SVG için */}
          {format !== 'gds' && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeScaleBar}
                onChange={(e) => setScaleBar(e.target.checked)}
                disabled={busy}
              />
              <span>Ölçek çubuğu ekle</span>
            </label>
          )}

          {/* Arc resolution — GDS-II'de eğri→poligon ayrıklaştırma nokta sayısı */}
          {format === 'gds' && (
            <Field label={`Yay Çözünürlüğü — ${arcResolution} nokta (360°)`}>
              <input
                type="range"
                min={16}
                max={256}
                step={8}
                value={arcResolution}
                onChange={(e) => setArcResolution(Number(e.target.value))}
                disabled={busy}
                className="w-full"
              />
              <p className="text-[10px] text-mf-text-dim mt-1">
                Düşük = hızlı önizleme (16–32). Yüksek = litografi kalitesi (64–128). Eğri
                kanalların ve dairesel portların kaç doğru parçasıyla temsil edileceğini belirler.
              </p>
            </Field>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-mf-border">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1 text-xs rounded border border-mf-border text-mf-text-dim hover:text-mf-text"
          >
            İptal
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            className={clsx(
              'px-4 py-1 text-xs rounded font-semibold transition-all',
              busy
                ? 'bg-mf-border text-mf-text-dim cursor-not-allowed'
                : 'bg-mf-blue text-mf-bg hover:bg-blue-300 active:scale-95',
            )}
          >
            {busy ? 'İşleniyor…' : 'Dışa Aktar'}
          </button>
        </div>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <div className="text-mf-text-dim text-[11px] uppercase tracking-wide mb-1">{label}</div>
    {children}
  </div>
);

const FormatButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  sub: string;
}> = ({ active, onClick, icon, label, sub }) => (
  <button
    onClick={onClick}
    className={clsx(
      'flex-1 px-3 py-2 rounded border text-left transition-colors',
      active
        ? 'border-mf-blue bg-mf-blue/10 text-mf-text'
        : 'border-mf-border text-mf-text-dim hover:text-mf-text',
    )}
  >
    <div className="flex items-center gap-2 font-semibold">
      {icon} {label}
    </div>
    <div className="text-[10px] text-mf-text-dim mt-0.5">{sub}</div>
  </button>
);

export default ExportDialog;
