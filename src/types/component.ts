// ============================================================
// Bileşen tipleri — çip bileşenleri, portlar, parametreler, bağlantılar
// ============================================================

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
  width: number; // μm
  length: number; // μm
  depth: number; // μm
}

export interface CurvedChannelParams {
  radius: number; // μm
  angle: number; // derece
  width: number; // μm
  depth: number; // μm
}

export interface TJunctionParams {
  mainWidth: number; // μm
  branchWidth: number; // μm
  angle: number; // derece
  depth: number; // μm
}

export interface YJunctionParams {
  mainWidth: number; // μm
  branchWidth: number; // μm
  branchAngle: number; // derece
  depth: number; // μm
}

export interface SerpentineMixerParams {
  channelWidth: number; // μm
  turns: number;
  pitch: number; // μm
  depth: number; // μm
}

export interface PortParams {
  diameter: number; // μm
  portType: PortType;
}

export interface DropletGeneratorParams {
  orificeWidth: number; // μm
  mainChannelWidth: number; // μm
  dispersedChannelWidth: number; // μm
  depth: number; // μm
}

export interface FilterArrayParams {
  pillarDiameter: number; // μm
  spacing: number; // μm
  rows: number;
  columns: number;
  depth: number; // μm
}

export interface ExpansionParams {
  inletWidth: number; // μm
  outletWidth: number; // μm
  length: number; // μm
  depth: number; // μm
}

export interface ReservoirParams {
  width: number; // μm
  height: number; // μm
  depth: number; // μm
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
  position: Point; // canvas koordinatları (μm)
  rotation: number; // derece
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
