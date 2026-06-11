import { create } from 'zustand';
import type {
  SimulationParams,
  SimulationResult,
  SimulationStatus,
  FluidProperties,
  ColormapType,
  GridResolution,
} from '../types';

/** Script (mf.run_quick / mf.run_cfd) tarafından kuyruklanan koşu isteği.
 *  useSimulationRun içindeki tüketici effect, status müsait olunca işler. */
export interface RunRequest {
  mode: 'analytic' | 'cfd';
  resolution?: GridResolution;
}

// Akışkan ön tanımları — Rust aynası: src-tauri/src/simulation/hydraulic.rs
// fluid_by_key (anahtarlar + µ/ρ değerleri bire bir senkron; birlikte güncelle).
export const FLUID_PRESETS: Record<string, FluidProperties> = {
  water: { name: 'Su (DI)', viscosity: 0.001, density: 1000 },
  pbs: { name: 'PBS tamponu', viscosity: 0.00102, density: 1005 },
  plasma: { name: 'Kan plazması', viscosity: 0.0015, density: 1025 },
  etanol: { name: 'Etanol', viscosity: 0.0011, density: 789 },
  gliserol50: { name: 'Gliserol %50', viscosity: 0.006, density: 1126 },
  pdms: { name: 'PDMS (silikon yağı)', viscosity: 0.097, density: 970 },
  oil: { name: 'Mineral yağ', viscosity: 0.03, density: 860 },
};

interface SimulationState {
  params: SimulationParams;
  status: SimulationStatus;
  progress: number; // 0-100
  progressMessage: string;
  result: SimulationResult | null;
  error: string | null;

  // Görselleştirme
  colormap: ColormapType;
  /** CFD overlay'inde hangi saha gösterilsin? */
  cfdFieldType: 'magnitude' | 'pressure' | 'wallShear';
  /** CFD sonucu hangi bileşenin üzerine bindirilsin? (canvas hizalaması için) */
  cfdTargetComponentId: string | null;
  showVelocityField: boolean;
  showPressureField: boolean;
  showStreamlines: boolean;
  showWallShear: boolean;

  /** Bekleyen script koşu istekleri (FIFO) */
  runQueue: RunRequest[];

  // Eylemler
  setParams: (params: Partial<SimulationParams>) => void;
  setStatus: (status: SimulationStatus) => void;
  enqueueRun: (req: RunRequest) => void;
  dequeueRun: () => RunRequest | undefined;
  setProgress: (progress: number, message?: string) => void;
  setResult: (result: SimulationResult) => void;
  setError: (error: string | null) => void;
  reset: () => void;

  setColormap: (colormap: ColormapType) => void;
  setCfdFieldType: (f: 'magnitude' | 'pressure' | 'wallShear') => void;
  setCfdTargetComponentId: (id: string | null) => void;
  toggleVelocityField: () => void;
  togglePressureField: () => void;
  toggleStreamlines: () => void;
  toggleWallShear: () => void;
}

const DEFAULT_PARAMS: SimulationParams = {
  mode: 'analytic',
  fluid: 'water',
  fluidProperties: FLUID_PRESETS.water,
  inletPressure: 1000,
  gridResolution: 'medium',
  maxIterations: 500,
};

export const useSimulationStore = create<SimulationState>()((set, get) => ({
  params: DEFAULT_PARAMS,
  runQueue: [],
  status: 'idle',
  progress: 0,
  progressMessage: '',
  result: null,
  error: null,

  colormap: 'viridis',
  cfdFieldType: 'magnitude',
  cfdTargetComponentId: null,
  showVelocityField: true,
  showPressureField: false,
  showStreamlines: false,
  showWallShear: false,

  setParams: (params) =>
    set((state) => ({
      params: { ...state.params, ...params },
    })),

  setStatus: (status) => set({ status }),

  enqueueRun: (req) => set((s) => ({ runQueue: [...s.runQueue, req] })),
  dequeueRun: () => {
    const [head, ...rest] = get().runQueue;
    if (head) set({ runQueue: rest });
    return head;
  },

  setProgress: (progress, message) => set({ progress, progressMessage: message ?? '' }),

  setResult: (result) => set({ result, status: 'completed', progress: 100 }),

  setError: (error) => set({ error, status: 'error' }),

  reset: () =>
    set({
      status: 'idle',
      progress: 0,
      progressMessage: '',
      result: null,
      error: null,
    }),

  setColormap: (colormap) => set({ colormap }),
  setCfdFieldType: (cfdFieldType) => set({ cfdFieldType }),
  setCfdTargetComponentId: (cfdTargetComponentId) => set({ cfdTargetComponentId }),
  toggleVelocityField: () => set((s) => ({ showVelocityField: !s.showVelocityField })),
  togglePressureField: () => set((s) => ({ showPressureField: !s.showPressureField })),
  toggleStreamlines: () => set((s) => ({ showStreamlines: !s.showStreamlines })),
  toggleWallShear: () => set((s) => ({ showWallShear: !s.showWallShear })),
}));
