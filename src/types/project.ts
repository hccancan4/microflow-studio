// ============================================================
// Proje — .mflow dosya şeması (metadata + tasarım + sonuçlar)
// ============================================================
import type { CanvasState } from './canvas';
import type { ChipComponent, Connection } from './component';
import type { SimulationResult } from './simulation';
import type { ExperimentDataSet } from './experiment';

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
