import { create } from 'zustand';
import type {
  SimulationParams,
  SimulationResult,
  SimulationStatus,
  FluidProperties,
  ColormapType,
} from '../types';

// Akışkan ön tanımları
export const FLUID_PRESETS: Record<string, FluidProperties> = {
  water: { name: 'Su', viscosity: 0.001, density: 1000 },
  pdms: { name: 'PDMS (silikon yağı)', viscosity: 0.097, density: 970 },
  oil: { name: 'Mineral yağ', viscosity: 0.03, density: 860 },
};

interface SimulationState {
  params: SimulationParams;
  status: SimulationStatus;
  progress: number;       // 0-100
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

  // Eylemler
  setParams: (params: Partial<SimulationParams>) => void;
  setStatus: (status: SimulationStatus) => void;
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

export const useSimulationStore = create<SimulationState>()((set) => ({
  params: DEFAULT_PARAMS,
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

  setProgress: (progress, message) =>
    set({ progress, progressMessage: message ?? '' }),

  setResult: (result) =>
    set({ result, status: 'completed', progress: 100 }),

  setError: (error) =>
    set({ error, status: 'error' }),

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
  toggleVelocityField: () =>
    set((s) => ({ showVelocityField: !s.showVelocityField })),
  togglePressureField: () =>
    set((s) => ({ showPressureField: !s.showPressureField })),
  toggleStreamlines: () =>
    set((s) => ({ showStreamlines: !s.showStreamlines })),
  toggleWallShear: () =>
    set((s) => ({ showWallShear: !s.showWallShear })),
}));
