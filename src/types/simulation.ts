// ============================================================
// Simülasyon — analitik + CFD parametreleri, sonuçları, ham serde tipleri
// ============================================================

export type SimulationMode = 'analytic' | 'cfd';
export type SimulationStatus = 'idle' | 'running' | 'completed' | 'error';
export type FluidPreset = 'water' | 'pdms' | 'oil';
export type GridResolution = 'coarse' | 'medium' | 'fine';
export type ColormapType = 'jet' | 'viridis' | 'plasma' | 'coolwarm';

export interface FluidProperties {
  viscosity: number;  // Pa·s
  density: number;    // kg/m³
  name: string;
}

export interface SimulationParams {
  mode: SimulationMode;
  fluid: FluidPreset;
  fluidProperties: FluidProperties;
  inletPressure?: number;   // Pa
  inletFlowRate?: number;   // μL/min
  gridResolution: GridResolution;
  maxIterations: number;
}

export interface AnalyticResult {
  componentId: string;
  flowRate: number;       // μL/min
  pressureDrop: number;   // Pa
  reynoldsNumber: number;
  resistance: number;     // Pa·s/m³
  deanNumber?: number;    // eğri kanallar için
  mixingEfficiency?: number; // mikserler için 0-1
}

/** Ağ çözümünde tek bir inlet→outlet yolu */
export interface PathInfo {
  components: string[];
  total_resistance: number;
  flow_rate: number;
}

/** Bileşen kesitinde parabolik hız profili (y vs v) */
export interface ProfilePoint {
  y_um: number;
  velocity: number; // m/s
}

export interface VelocityProfile {
  component_id: string;
  width_um: number;
  depth_um: number;
  mean_velocity: number;
  peak_velocity: number;
  points: ProfilePoint[];
}

/**
 * Rust'tan gelen ham serde çıktısı — snake_case alan isimleri.
 * App.tsx'te camelCase `AnalyticResult[]`'e dönüştürülür.
 */
export interface RawAnalyticResult {
  component_id: string;
  flow_rate: number;
  pressure_drop: number;
  reynolds_number: number;
  resistance: number;
  dean_number?: number;
  mixing_efficiency?: number;
}

/** Rust analyze_design ham çıktısı (invoke<> için) */
export interface RawAnalyticDesignResult {
  results: RawAnalyticResult[];
  total_flow_rate: number;
  total_resistance: number;
  max_velocity: number;
  max_pressure: number;
  min_pressure: number;
  paths: PathInfo[];
  profiles: VelocityProfile[];
}

/** Frontend'in kullandığı camelCase analitik sonuç (RawAnalyticDesignResult'tan türetilir) */
export interface AnalyticDesignResult {
  results: AnalyticResult[];
  total_flow_rate: number;
  total_resistance: number;
  max_velocity: number;
  max_pressure: number;
  min_pressure: number;
  paths: PathInfo[];
  profiles: VelocityProfile[];
}

export interface CfdField {
  width: number;
  height: number;
  dx: number; // μm
  dy: number; // μm
  velocityX: number[];   // düzleştirilmiş 2D dizi
  velocityY: number[];
  pressure: number[];
  magnitude: number[];
  wallShear: number[];
  /** Her 5 iterasyonda bir kaydedilmiş maksimum diverjans normu */
  residuals: number[];
  /** Gerçekleştirilen iterasyon sayısı */
  iterations: number;
  /** Tolerans altına inildi mi? */
  converged: boolean;
}

export interface SimulationResult {
  mode: SimulationMode;
  timestamp: string;
  analyticResults?: AnalyticResult[];
  cfdField?: CfdField;
  /** Ağ çözümündeki inlet→outlet yolları */
  networkPaths?: PathInfo[];
  /** Her bileşen için parabolik hız profili */
  velocityProfiles?: VelocityProfile[];
  summary: {
    maxVelocity: number;   // m/s
    minPressure: number;   // Pa
    maxPressure: number;   // Pa
    totalFlowRate: number; // μL/min
  };
}
