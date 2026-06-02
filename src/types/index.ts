// ============================================================
// MicroFlow Studio — Temel TypeScript Tip Tanımları
// ============================================================

// --- Bileşen tipleri ---
export type ComponentType =
  | 'straight_channel'
  | 'curved_channel'
  | 't_junction'
  | 'y_junction'
  | 'serpentine_mixer'
  | 'port'
  | 'droplet_generator'
  | 'filter_array'
  | 'expansion'
  | 'reservoir';

export type PortType = 'inlet' | 'outlet';

export interface Point {
  x: number; // μm
  y: number; // μm
}

export interface Port {
  id: string;
  componentId: string;
  portIndex: number;
  position: Point; // bileşen koordinat sisteminde
  type: 'input' | 'output';
  diameter: number; // μm
  connected: boolean;
}

// --- Bileşen parametreleri ---
export interface StraightChannelParams {
  width: number;   // μm
  length: number;  // μm
  depth: number;   // μm
}

export interface CurvedChannelParams {
  radius: number;  // μm
  angle: number;   // derece
  width: number;   // μm
  depth: number;   // μm
}

export interface TJunctionParams {
  mainWidth: number;   // μm
  branchWidth: number; // μm
  angle: number;       // derece
  depth: number;       // μm
}

export interface YJunctionParams {
  mainWidth: number;   // μm
  branchWidth: number; // μm
  branchAngle: number; // derece
  depth: number;       // μm
}

export interface SerpentineMixerParams {
  channelWidth: number; // μm
  turns: number;
  pitch: number;        // μm
  depth: number;        // μm
}

export interface PortParams {
  diameter: number; // μm
  portType: PortType;
}

export interface DropletGeneratorParams {
  orificeWidth: number;        // μm
  mainChannelWidth: number;    // μm
  dispersedChannelWidth: number; // μm
  depth: number;               // μm
}

export interface FilterArrayParams {
  pillarDiameter: number; // μm
  spacing: number;        // μm
  rows: number;
  columns: number;
  depth: number;          // μm
}

export interface ExpansionParams {
  inletWidth: number;  // μm
  outletWidth: number; // μm
  length: number;      // μm
  depth: number;       // μm
}

export interface ReservoirParams {
  width: number;  // μm
  height: number; // μm
  depth: number;  // μm
}

export type ComponentParams =
  | StraightChannelParams
  | CurvedChannelParams
  | TJunctionParams
  | YJunctionParams
  | SerpentineMixerParams
  | PortParams
  | DropletGeneratorParams
  | FilterArrayParams
  | ExpansionParams
  | ReservoirParams;

// --- Çip bileşeni ---
export interface ChipComponent {
  id: string;
  type: ComponentType;
  position: Point;     // canvas koordinatları (μm)
  rotation: number;    // derece
  params: ComponentParams;
  ports: Port[];
  label?: string;
}

// --- Bağlantı ---
export interface Connection {
  id: string;
  fromComponentId: string;
  fromPortIndex: number;
  toComponentId: string;
  toPortIndex: number;
}

// --- Canvas durumu ---
export interface CanvasState {
  width: number;  // μm
  height: number; // μm
  unit: 'um';
  gridSize: 25 | 50 | 100; // μm
  showGrid: boolean;
  showRuler: boolean;
  /** Drag/drop sırasında grid'e snap uygula. Toggle: Shift+; */
  snapEnabled: boolean;
  zoom: number;
  panX: number;
  panY: number;
}

// --- Simülasyon ---
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
  /** Ağ çözümündeki inlet→outlet yolları (Faz 4A) */
  networkPaths?: PathInfo[];
  /** Her bileşen için parabolik hız profili (Faz 4A) */
  velocityProfiles?: VelocityProfile[];
  summary: {
    maxVelocity: number;   // m/s
    minPressure: number;   // Pa
    maxPressure: number;   // Pa
    totalFlowRate: number; // μL/min
  };
}

// --- Proje ---
export interface ProjectMetadata {
  name: string;
  author: string;
  created: string;
  modified: string;
  description: string;
  tags: string[];
}

export interface MFlowProject {
  version: string;
  metadata: ProjectMetadata;
  canvas: CanvasState;
  components: ChipComponent[];
  connections: Connection[];
  simulationResults?: SimulationResult;
  experimentData: ExperimentDataSet[];
  script: string;
}

/**
 * Rust'tan gelen ham proje verisi — Rust serde snake_case gönderir.
 * `invoke<RawMFlowProject>('load_project_file', ...)` için kullanılır.
 */
export interface RawMFlowProject {
  version: string;
  metadata: ProjectMetadata;
  canvas: CanvasState;
  components: ChipComponent[];
  connections: Connection[];
  simulation_results?: unknown;
  experiment_data: ExperimentDataSet[];
  script?: string;
}

// --- Deney verisi ---
export interface ExperimentDataPoint {
  x: number;
  y: number;
  value: number;
  uncertainty?: number;
}

export interface ExperimentDataSet {
  id: string;
  name: string;
  filename: string;
  xColumn: string;
  yColumn: string;
  valueColumn: string;
  dataType: 'velocity' | 'pressure' | 'concentration';
  points: ExperimentDataPoint[];
  color: string;
}

// --- UI durumu ---
export type ActiveTab = 'canvas' | 'script';
export type PanelSide = 'left' | 'right' | 'bottom';

export interface UIState {
  activeTab: ActiveTab;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  bottomPanelOpen: boolean;
  leftPanelWidth: number;
  rightPanelWidth: number;
  bottomPanelHeight: number;
  selectedComponentIds: string[];
  colormap: ColormapType;
  showVelocityField: boolean;
  showPressureField: boolean;
  showStreamlines: boolean;
}
