/**
 * AutoDesignDialog — ✦ Oto-Tasarım: hedef debilerden devre üretimi (inverse).
 *
 * Akış: hedef tablo → solve_targets (tek hidrolik çekirdek) → önizleme
 * (R/L/Re + zarf-fab bayrakları) → Oluştur → buildAutoDesignLua →
 * script pipeline → canvas + Hızlı Analiz + Doğrulama sekmesi.
 */
import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { FiX, FiCpu, FiPlay, FiAlertTriangle, FiLoader } from 'react-icons/fi';
import { useSimulationStore } from '../../stores/useSimulationStore';
import { useProjectStore } from '../../stores/useProjectStore';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { toast } from '../../stores/useUiStore';
import { paToMbar, CELL_MM_MIN, CELL_MM_MAX } from '../../utils/fab';
import { solveTargets, type BranchSpec } from './solveTargets';
import { buildAutoDesignLua } from './autoDesignLua';
import type { ScriptRunOutcome } from '../../hooks/useScriptRun';

const FEED = { wUm: 300, lUm: 1000 };

interface Props {
  open: boolean;
  onClose: () => void;
  runScript: (code?: string) => Promise<ScriptRunOutcome>;
}

const AutoDesignDialog: React.FC<Props> = ({ open, onClose, runScript }) => {
  const params = useSimulationStore((s) => s.params);

  const [targets, setTargets] = useState<number[]>([2.0, 1.0]);
  const [wUm, setWUm] = useState(100);
  const [hUm, setHUm] = useState(80);
  const [pInPa, setPInPa] = useState<number | null>(null); // null → params'tan
  const [cellMm, setCellMm] = useState(CELL_MM_MAX);
  const [withCfd, setWithCfd] = useState(false);
  const [solving, setSolving] = useState(false);
  const [branches, setBranches] = useState<BranchSpec[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEscapeClose(open, onClose);

  const effPInPa = pInPa ?? params.inletPressure ?? 1000;

  const totalQ = useMemo(() => targets.reduce((a, b) => a + (b > 0 ? b : 0), 0), [targets]);

  if (!open) return null;

  const setCount = (n: number) => {
    const count = Math.max(2, Math.min(6, n));
    setTargets((t) => {
      const next = t.slice(0, count);
      while (next.length < count) next.push(1.0);
      return next;
    });
    setBranches(null);
  };

  const solve = async () => {
    setError(null);
    setSolving(true);
    try {
      const res = await solveTargets({
        pInPa: effPInPa,
        fluid: {
          viscosity: params.fluidProperties.viscosity,
          density: params.fluidProperties.density,
        },
        wUm,
        hUm,
        cellMm,
        feed: FEED,
        targets: targets.map((q, i) => ({ label: `ÇIKIŞ ${i + 1}`, qUlMin: q })),
      });
      setBranches(res);
    } catch (err) {
      setError(String(err));
      setBranches(null);
    } finally {
      setSolving(false);
    }
  };

  const create = async () => {
    if (!branches) return;
    const lua = buildAutoDesignLua({
      pInPa: effPInPa,
      fluidKey: params.fluid,
      wUm,
      hUm,
      feed: FEED,
      branches,
      runCfd: withCfd,
    });
    useProjectStore.getState().setScriptContent(lua);
    const st = useProjectStore.getState();
    if (!st.bottomPanelOpen) st.toggleBottomPanel();
    onClose();
    await runScript(lua);
    toast.success('Devre üretildi — sonuçlar için Doğrulama sekmesine bakın');
  };

  return (
    <div
      className="backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-enter bg-mf-panel border border-mf-border rounded-ds-lg shadow-pop w-[620px] max-w-[96vw] max-h-[90vh] flex flex-col text-mf-text">
        {/* Başlık */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-mf-border">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <FiCpu size={14} className="text-mf-orange" /> ✦ Otomatik Tasarım
          </span>
          <button onClick={onClose} className="text-mf-text-dim hover:text-mf-text">
            <FiX size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Üst parametreler */}
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="text-2xs text-mf-text-dim uppercase tracking-caps block mb-1">
                Çıkış Sayısı
              </label>
              <input
                type="number"
                className="mf-input text-xs font-mono"
                min={2}
                max={6}
                value={targets.length}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="text-2xs text-mf-text-dim uppercase tracking-caps block mb-1">
                Giriş Basıncı (Pa)
              </label>
              <input
                type="number"
                className="mf-input text-xs font-mono"
                value={effPInPa}
                step={100}
                onChange={(e) => {
                  setPInPa(Number(e.target.value));
                  setBranches(null);
                }}
              />
              <div className="text-2xs text-mf-text-dark font-mono mt-0.5">
                = {paToMbar(effPInPa).toFixed(2)} mbar
              </div>
            </div>
            <div>
              <label className="text-2xs text-mf-text-dim uppercase tracking-caps block mb-1">
                Kesit w×h (µm)
              </label>
              <div className="flex gap-1">
                <input
                  type="number"
                  className="mf-input text-xs font-mono"
                  value={wUm}
                  onChange={(e) => {
                    setWUm(Number(e.target.value));
                    setBranches(null);
                  }}
                />
                <input
                  type="number"
                  className="mf-input text-xs font-mono"
                  value={hUm}
                  onChange={(e) => {
                    setHUm(Number(e.target.value));
                    setBranches(null);
                  }}
                />
              </div>
            </div>
            <div>
              <label className="text-2xs text-mf-text-dim uppercase tracking-caps block mb-1">
                Hücre (mm)
              </label>
              <input
                type="number"
                className="mf-input text-xs font-mono"
                min={CELL_MM_MIN}
                max={CELL_MM_MAX}
                value={cellMm}
                onChange={(e) => {
                  setCellMm(Number(e.target.value));
                  setBranches(null);
                }}
              />
            </div>
          </div>

          {/* Hedef tablosu */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-2xs text-mf-text-dim uppercase tracking-caps">
                Hedef Debiler (µL/min) — akışkan: {params.fluidProperties.name}
              </label>
              <button
                onClick={() => {
                  setTargets((t) => t.map(() => Number((totalQ / t.length).toFixed(3)) || 1));
                  setBranches(null);
                }}
                className="text-2xs text-mf-blue hover:underline"
              >
                eşit böl
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {targets.map((q, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-2xs text-mf-text-dark w-14 flex-shrink-0">
                    ÇIKIŞ {i + 1}
                  </span>
                  <input
                    type="number"
                    className="mf-input text-xs font-mono"
                    step={0.1}
                    min={0.01}
                    value={q}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setTargets((t) => t.map((x, j) => (j === i ? v : x)));
                      setBranches(null);
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="text-2xs text-mf-text-dark mt-1 font-mono">
              Σ = {totalQ.toFixed(3)} µL/min
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-mf-text-dim cursor-pointer">
            <input
              type="checkbox"
              checked={withCfd}
              onChange={(e) => setWithCfd(e.target.checked)}
            />
            Üretimden sonra CFD de çalıştır (kaba — besleme kanalı üzerinde)
          </label>

          {error && (
            <div className="flex items-center gap-2 text-xs text-mf-red px-2 py-1.5 bg-red-900/20 border border-red-900/40 rounded">
              <FiAlertTriangle size={12} /> {error}
            </div>
          )}

          {/* Önizleme tablosu */}
          {branches && (
            <div className="bg-mf-bg border border-mf-border rounded overflow-hidden">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-mf-text-dim border-b border-mf-border text-2xs uppercase tracking-caps">
                    <th className="px-2 py-1 text-left">Çıkış</th>
                    <th className="px-2 py-1 text-right">Q (µL/min)</th>
                    <th className="px-2 py-1 text-right">R (mbar/µL·min⁻¹)</th>
                    <th className="px-2 py-1 text-right">L (mm)</th>
                    <th className="px-2 py-1 text-right">Re</th>
                    <th className="px-2 py-1 text-center">Zarf</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.map((b) => (
                    <tr
                      key={b.label}
                      className={clsx(
                        'border-b border-mf-border/50',
                        !b.fits_envelope && 'text-mf-red',
                        b.w_flag && 'text-mf-orange',
                      )}
                    >
                      <td className="px-2 py-1">{b.label}</td>
                      <td className="px-2 py-1 text-right">{b.target_q_ul_min.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right">{b.r_disp.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right">{b.l_mm.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right">{b.re.toFixed(3)}</td>
                      <td className="px-2 py-1 text-center">
                        {b.fits_envelope ? '✓' : `✗ >${cellMm}mm`}
                        {b.w_flag ? ' · w<40µm' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Alt butonlar */}
        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-mf-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-mf-text-dim hover:text-mf-text"
          >
            Vazgeç
          </button>
          <button
            onClick={() => void solve()}
            disabled={solving || targets.some((q) => !(q > 0))}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-mf-blue/50 text-mf-blue hover:bg-mf-blue/10 disabled:opacity-50"
          >
            {solving ? <FiLoader size={11} className="animate-spin" /> : <FiCpu size={11} />}
            Çöz
          </button>
          <button
            onClick={() => void create()}
            disabled={!branches}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-mf-orange text-white hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiPlay size={11} /> Oluştur
          </button>
        </div>
      </div>
    </div>
  );
};

export default AutoDesignDialog;
