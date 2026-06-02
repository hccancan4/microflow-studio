/**
 * useCursorStore — Canvas üzerindeki canlı fare koordinatı (μm).
 *
 * Status bar gibi yan-bilgi göstergeleri bu store'a abone olur. Fare
 * her hareket ettiğinde re-render tetiklenir; bu nedenle yalnızca cursor
 * koordinatı gösteren bileşenler subscribe etmelidir.
 */
import { create } from 'zustand';

interface CursorState {
  /** Canvas içinde mi (false → status bar koordinat göstermez) */
  inCanvas: boolean;
  /** Fare μm koordinatları (canvas dünyasında) */
  x: number;
  y: number;
  /** Zoom-aware ondalık hassasiyet (status bar gösterimi için). */
  precision: number;
  set: (x: number, y: number, inCanvas: boolean, precision?: number) => void;
}

export const useCursorStore = create<CursorState>()((set) => ({
  inCanvas: false,
  x: 0,
  y: 0,
  precision: 0,
  set: (x, y, inCanvas, precision = 0) => set({ x, y, inCanvas, precision }),
}));
