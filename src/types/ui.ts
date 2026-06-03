// ============================================================
// UI durumu — sekme, panel görünürlük/boyut, görselleştirme bayrakları
// ============================================================
import type { ColormapType } from './simulation';

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
