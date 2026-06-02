/**
 * ExperimentImportDialog.tsx — Deney verisi import sihirbazı (Faz 6A).
 *
 * İki adımlı akış:
 *   1) Dosya seç (CSV / TSV / JSON) — Tauri dosya diyaloğu, UTF-8 metin okur
 *   2) Sütun eşleme: x, y (opsiyonel), value, dataType, isim, renk
 *
 * Sütunlar için "sayısal skor" (satırların yüzde kaçı number?) heuristik'i
 * ile varsayılan eşlemeler otomatik önerilir.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { FiX, FiUpload, FiCheck } from 'react-icons/fi';
import clsx from 'clsx';
import type { ExperimentDataSet, ExperimentDataPoint } from '../types';
import { parseTable, numericScore, columnAsNumbers, type ParsedTable } from '../utils/csvParser';
import { useEscapeClose } from '../hooks/useEscapeClose';

interface Props {
  open: boolean;
  onCancel: () => void;
  onConfirm: (dataset: ExperimentDataSet) => void;
  suggestedColor: string;
}

type DataType = ExperimentDataSet['dataType'];

const DATA_TYPE_LABELS: Record<DataType, string> = {
  velocity: 'Hız (m/s)',
  pressure: 'Basınç (Pa)',
  concentration: 'Konsantrasyon (–)',
};

const ExperimentImportDialog: React.FC<Props> = ({ open, onCancel, onConfirm, suggestedColor }) => {
  const [filename, setFilename] = useState<string>('');
  const [rawText, setRawText] = useState<string | null>(null);
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Sütun eşlemeleri
  const [xCol, setXCol] = useState<string>('');
  const [yCol, setYCol] = useState<string>(''); // '' → yok (1D)
  const [valCol, setValCol] = useState<string>('');
  const [dataType, setDataType] = useState<DataType>('velocity');
  const [name, setName] = useState<string>('');
  const [color, setColor] = useState<string>(suggestedColor);

  // Dialog her açılışta resetle
  useEffect(() => {
    if (open) {
      setFilename(''); setRawText(null); setTable(null); setErr(null);
      setXCol(''); setYCol(''); setValCol('');
      setDataType('velocity'); setName(''); setColor(suggestedColor);
    }
  }, [open, suggestedColor]);

  // Tablo değişince sütunları oto-seç (sayısal skorlara göre)
  useEffect(() => {
    if (!table || table.headers.length === 0) return;
    const scores: Array<[string, number]> = table.headers.map((h) => [h, numericScore(table.rows, h)]);
    const numeric = scores.filter(([, s]) => s > 0.8).map(([h]) => h);
    // İsim heuristic: "x", "y", "pos" kelimeleri
    const pickByName = (patterns: RegExp[]) =>
      numeric.find((h) => patterns.some((p) => p.test(h.toLowerCase())));

    const x = pickByName([/^x$/, /pos/, /y_um/, /y\b/, /distance/, /mesafe/])
      ?? numeric[0];
    const v = pickByName([/vel|hız|u\b|speed/, /pres|basınç|p\b/, /conc|konsantrasyon|c\b/])
      ?? numeric[numeric.length - 1];

    setXCol(x ?? '');
    setValCol(v ?? '');
    if (numeric.length >= 3) setYCol(numeric.find((c) => c !== x && c !== v) ?? '');
    else setYCol('');

    // dataType, value sütunu adından sezilir
    const valLower = (v ?? '').toLowerCase();
    if (/pres|basınç|\bp\b/.test(valLower))      setDataType('pressure');
    else if (/conc|konsantrasyon|\bc\b/.test(valLower)) setDataType('concentration');
    else                                          setDataType('velocity');
  }, [table]);

  // ESC ile kapat
  useEscapeClose(open, onCancel);

  if (!open) return null;

  const pickFile = async () => {
    try {
      const { open: openFile } = await import('@tauri-apps/plugin-dialog');
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const selected = await openFile({
        multiple: false,
        filters: [
          { name: 'Tablo Verisi', extensions: ['csv', 'tsv', 'txt', 'json'] },
          { name: 'Tüm Dosyalar', extensions: ['*'] },
        ],
      });
      if (!selected || typeof selected !== 'string') return;
      const text = await readTextFile(selected);
      setFilename(selected.split(/[\\/]/).pop() ?? selected);
      setRawText(text);
      setErr(null);
      try {
        const parsed = parseTable(text, selected);
        setTable(parsed);
        if (!name) setName((selected.split(/[\\/]/).pop() ?? 'deney').replace(/\.[^.]+$/, ''));
      } catch (e: any) {
        setErr(`Dosya okunamadı: ${e.message ?? e}`);
        setTable(null);
      }
    } catch (e: any) {
      setErr(`Dosya seçilemedi: ${e}`);
    }
  };

  // İleri-butonu aktiflik koşulu
  const canConfirm = Boolean(table && xCol && valCol && name.trim());

  const handleConfirm = () => {
    if (!table || !canConfirm) return;
    const xs = columnAsNumbers(table.rows, xCol);
    const ys = yCol ? columnAsNumbers(table.rows, yCol) : null;
    const vs = columnAsNumbers(table.rows, valCol);

    const points: ExperimentDataPoint[] = [];
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i], v = vs[i];
      if (!Number.isFinite(x) || !Number.isFinite(v)) continue;
      const y = ys ? ys[i] : 0;
      points.push({ x, y: Number.isFinite(y) ? y : 0, value: v });
    }
    if (points.length === 0) {
      setErr('Seçilen sütunlarda geçerli sayısal satır bulunamadı.');
      return;
    }

    const ds: ExperimentDataSet = {
      id: `exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      filename,
      xColumn: xCol,
      yColumn: yCol || '',
      valueColumn: valCol,
      dataType,
      points,
      color,
    };
    onConfirm(ds);
  };

  // Önizleme tablosu
  const previewCols = useMemo(() => (table?.headers ?? []).slice(0, 8), [table]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-mf-panel border border-mf-border rounded-lg shadow-xl w-[640px] max-w-[96vw] max-h-[88vh] flex flex-col text-mf-text">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-mf-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <FiUpload className="text-mf-blue" />
            <h2 className="text-sm font-semibold">Deney Verisi İçe Aktar</h2>
          </div>
          <button className="btn-icon w-6 h-6" onClick={onCancel}>
            <FiX size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3 text-xs overflow-auto flex-1">
          {/* Step 1: Dosya seç */}
          <div>
            <div className="text-mf-text-dim text-[11px] uppercase tracking-wide mb-1">1. Dosya Seç</div>
            <div className="flex items-center gap-2">
              <button
                onClick={pickFile}
                className="px-3 py-1.5 rounded bg-mf-blue text-mf-bg font-semibold text-xs hover:bg-blue-300 active:scale-95 transition-all"
              >
                <FiUpload className="inline mr-1" size={12} />
                Dosya Seç (CSV / TSV / JSON)
              </button>
              {filename && (
                <span className="text-mf-text-dim font-mono truncate max-w-[320px]" title={filename}>
                  {filename}
                  {table && <span className="text-mf-green ml-2">· {table.rowCount} satır, {table.headers.length} sütun</span>}
                </span>
              )}
            </div>
            {err && <div className="mt-2 text-mf-red">{err}</div>}
          </div>

          {/* Step 2: Preview + Mapping */}
          {table && (
            <>
              <div>
                <div className="text-mf-text-dim text-[11px] uppercase tracking-wide mb-1">Önizleme (ilk 5 satır)</div>
                <div className="overflow-auto border border-mf-border rounded bg-mf-bg max-h-40">
                  <table className="text-xs w-full">
                    <thead className="bg-mf-panel">
                      <tr>
                        {previewCols.map((h) => (
                          <th key={h} className="text-left px-2 py-1 text-mf-text-dim font-mono">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.preview.map((r, i) => (
                        <tr key={i} className="border-t border-mf-border/50">
                          {previewCols.map((h) => (
                            <td key={h} className="px-2 py-1 font-mono text-mf-text truncate max-w-[140px]">{r[h]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div className="text-mf-text-dim text-[11px] uppercase tracking-wide mb-1">2. Sütun Eşleme</div>
                <div className="grid grid-cols-2 gap-2">
                  <LabeledSelect
                    label="X (pozisyon / koordinat)"
                    value={xCol} onChange={setXCol}
                    options={table.headers} required
                  />
                  <LabeledSelect
                    label="Y (ops.) — 2D veriler için"
                    value={yCol} onChange={setYCol}
                    options={['', ...table.headers]}
                  />
                  <LabeledSelect
                    label="Değer (ölçülen büyüklük)"
                    value={valCol} onChange={setValCol}
                    options={table.headers} required
                  />
                  <LabeledSelect
                    label="Veri tipi"
                    value={dataType} onChange={(v) => setDataType(v as DataType)}
                    options={Object.keys(DATA_TYPE_LABELS)}
                    renderLabel={(v) => DATA_TYPE_LABELS[v as DataType]}
                    required
                  />
                </div>
              </div>

              <div>
                <div className="text-mf-text-dim text-[11px] uppercase tracking-wide mb-1">3. Dataset Bilgileri</div>
                <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                  <label className="flex flex-col gap-1">
                    <span className="text-mf-text-dim text-[10px]">İsim</span>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Örn. 10μL/min inlet PIV"
                      className="bg-mf-bg border border-mf-border rounded px-2 py-1 text-mf-text"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-mf-text-dim text-[10px]">Renk</span>
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="h-[26px] w-14 bg-mf-bg border border-mf-border rounded cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-mf-border flex-shrink-0">
          <button
            onClick={onCancel}
            className="px-3 py-1 text-xs rounded border border-mf-border text-mf-text-dim hover:text-mf-text"
          >
            İptal
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={clsx(
              'px-4 py-1 text-xs rounded font-semibold transition-all flex items-center gap-1',
              !canConfirm
                ? 'bg-mf-border text-mf-text-dim cursor-not-allowed'
                : 'bg-mf-blue text-mf-bg hover:bg-blue-300 active:scale-95',
            )}
          >
            <FiCheck size={12} />
            İçe Aktar
          </button>
        </div>
      </div>
    </div>
  );
};

const LabeledSelect: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  required?: boolean;
  renderLabel?: (v: string) => string;
}> = ({ label, value, onChange, options, required, renderLabel }) => (
  <label className="flex flex-col gap-1">
    <span className="text-mf-text-dim text-[10px]">{label}{required && <span className="text-mf-red"> *</span>}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-mf-bg border border-mf-border rounded px-2 py-1 text-mf-text"
    >
      {options.map((o) => (
        <option key={o || '_none'} value={o}>
          {o === '' ? '— yok —' : (renderLabel ? renderLabel(o) : o)}
        </option>
      ))}
    </select>
  </label>
);

export default ExperimentImportDialog;
