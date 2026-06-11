/**
 * fab.ts — üretilebilirlik (fabrication) zarfı sabitleri + birim yardımcıları.
 *
 * Rust aynası: src-tauri/src/simulation/hydraulic.rs sabitleri — birlikte
 * güncelle. Kanonik kaynak Rust'tır (solve_targets bayrakları oradan gelir);
 * buradakiler yalnız anlık UI uyarıları içindir (PropertiesPanel vb.).
 */

/** Üretilebilir minimum kanal genişliği (µm). */
export const W_FAB_MIN_UM = 40;
/** Serpantin hücre boyutu zarfı (mm). */
export const CELL_MM_MIN = 10;
export const CELL_MM_MAX = 180;

/** Pa → mbar (1 mbar = 100 Pa). */
export function paToMbar(pa: number): number {
  return pa / 100;
}

/** Seçili bileşenin genişlik-tipi parametresi üretim limitinin altında mı?
 *  Bileşen tipine göre ilgili "en dar kanal" parametresine bakar. */
export function widthBelowFabLimit(params: Record<string, unknown>): boolean {
  const candidates = ['width', 'channelWidth', 'branchWidth', 'orificeWidth', 'inletWidth'];
  return candidates.some((k) => {
    const v = params[k];
    return typeof v === 'number' && Number.isFinite(v) && v < W_FAB_MIN_UM;
  });
}
