/**
 * useSweepStore — Parametrik tarama (sweep) state'i (Faz 6B).
 *
 * Bir bileşenin tek bir numerik parametresini, kullanıcı tanımlı aralık/adımda
 * süpürerek analitik çözücüyü her değer için tekrar çalıştırır. Sonuçlar tablo
 * ve grafik olarak ResultsPanel'in Sweep sekmesinde gösterilir.
 *
 * CFD süpürme bilinçli olarak kapsam dışı — bir CFD koşusu dakikalar alır,
 * 20 noktalı tarama kullanılabilir değildir. Analitik çözücü milisaniyeler
 * mertebesindedir; 200 noktalı tarama bile saniyeler içinde biter.
 */
import { create } from 'zustand';

export interface SweepConfig {
  componentId: string;
  componentLabel: string;
  paramKey: string;
  paramLabel: string;
  unit: string;
  start: number;
  end: number;
  steps: number;
}

export interface SweepRun {
  paramValue: number;
  totalFlowRate: number; // μL/min
  totalResistance: number;
  maxPressure: number; // Pa
  minPressure: number; // Pa
  maxVelocity: number; // m/s
  maxReynolds: number;
  /** Hedeflenen bileşenin kendi metrikleri (varsa). */
  componentFlowRate?: number;
  componentPressureDrop?: number;
  componentReynolds?: number;
  /** Hata varsa mesaj; varsa diğer alanlar 0 bırakılır. */
  error?: string;
}

interface SweepState {
  config: SweepConfig | null;
  runs: SweepRun[];
  running: boolean;
  progress: number; // 0..1
  currentIndex: number;
  cancelRequested: boolean;

  startSweep: (cfg: SweepConfig) => void;
  appendRun: (run: SweepRun) => void;
  setProgress: (idx: number, total: number) => void;
  finishSweep: () => void;
  requestCancel: () => void;
  reset: () => void;
}

export const useSweepStore = create<SweepState>()((set) => ({
  config: null,
  runs: [],
  running: false,
  progress: 0,
  currentIndex: 0,
  cancelRequested: false,

  startSweep: (cfg) =>
    set({
      config: cfg,
      runs: [],
      running: true,
      progress: 0,
      currentIndex: 0,
      cancelRequested: false,
    }),

  appendRun: (run) => set((s) => ({ runs: [...s.runs, run] })),

  setProgress: (idx, total) =>
    set({
      currentIndex: idx,
      progress: total > 0 ? idx / total : 0,
    }),

  finishSweep: () => set({ running: false, progress: 1 }),

  requestCancel: () => set({ cancelRequested: true }),

  reset: () =>
    set({
      config: null,
      runs: [],
      running: false,
      progress: 0,
      currentIndex: 0,
      cancelRequested: false,
    }),
}));

/** Lineer değer listesi üret (start ve end dahil). */
export function buildSweepValues(start: number, end: number, steps: number): number[] {
  const n = Math.max(2, Math.floor(steps));
  if (n === 1) return [start];
  const out: number[] = [];
  const dx = (end - start) / (n - 1);
  for (let i = 0; i < n; i++) out.push(start + dx * i);
  return out;
}
