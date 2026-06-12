/**
 * solveTargets — Rust `solve_targets` komutunun tipli sarmalayıcısı.
 *
 * Tek hidrolik çekirdek ilkesi: dal direnci/uzunluğu HER ZAMAN backend'de
 * çözülür (channel_resistance'ın yapısal tersi). Oto-Tasarım dialogu ve
 * LocalRuleProvider aynı fonksiyonu kullanır.
 */
import { invoke } from '@tauri-apps/api/core';

/** Rust BranchSpec (snake_case — serde) */
export interface BranchSpec {
  label: string;
  target_q_ul_min: number;
  r_si: number; // Pa·s/m³
  r_disp: number; // mbar/(µL·min⁻¹)
  l_mm: number; // 0.01 mm'ye AŞAĞI yuvarlanmış (µFG 1.05× fazla-direnç cezası: hedefe alttan yaklaş)
  footprint_mm: number;
  fits_envelope: boolean;
  w_flag: boolean;
  re: number;
}

export interface SolveTargetsInput {
  pInPa: number;
  fluid: { viscosity: number; density: number };
  wUm: number;
  hUm: number;
  cellMm?: number;
  /** Ortak besleme kanalı — direnci dal hesaplarından düşülür. */
  feed?: { wUm: number; lUm: number };
  targets: { label: string; qUlMin: number }[];
}

export async function solveTargets(input: SolveTargetsInput): Promise<BranchSpec[]> {
  return invoke<BranchSpec[]>('solve_targets', {
    req: {
      p_in_pa: input.pInPa,
      fluid_viscosity: input.fluid.viscosity,
      fluid_density: input.fluid.density,
      w_um: input.wUm,
      h_um: input.hUm,
      cell_mm: input.cellMm ?? null,
      feed: input.feed ? { w_um: input.feed.wUm, l_um: input.feed.lUm } : null,
      targets: input.targets.map((t) => ({ label: t.label, q_ul_min: t.qUlMin })),
    },
  });
}
