// ============================================================
// Canvas durumu — zoom, pan, grid, snap
// ============================================================

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
