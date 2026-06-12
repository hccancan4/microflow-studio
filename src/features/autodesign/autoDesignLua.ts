/**
 * autoDesignLua — çözülmüş dal spec'lerinden mf.* Lua script'i üretir (saf).
 *
 * Topoloji: inlet → kısa ortak besleme kanalı (CFD hedefi olarak da
 * kullanılır) → N paralel serpantin → N outlet. Hedefler set_target_flow
 * ile bildirilir → Doğrulama sekmesi. solve_targets besleme direncini
 * zaten düştüğü için uzunluklar besleme dahil ağda hedefi tutturur.
 */
import type { BranchSpec } from './solveTargets';

export interface AutoDesignLuaInput {
  pInPa: number;
  /** FLUID_PRESETS anahtarı (water/pbs/plasma/etanol/gliserol50/pdms/oil) */
  fluidKey: string;
  wUm: number;
  hUm: number;
  /** Besleme kanalı geometrisi — solve_targets'a verilenle AYNI olmalı. */
  feed: { wUm: number; lUm: number };
  branches: BranchSpec[];
  /** true → sonda mf.run_cfd("kaba") da koşar (hedef: besleme kanalı). */
  runCfd?: boolean;
}

const FEED_X = 600;
/** Dallar arası düşey boşluk payı (µm). */
const BRANCH_GAP_UM = 2000;
/** Serpantin düşey ayak izi ≈ L / (2+π/2) (çözücünün uzunluk modeli). */
const SERP_K = 2 + Math.PI / 2;

const r = (v: number) => Math.round(v);

export function buildAutoDesignLua(input: AutoDesignLuaInput): string {
  const { pInPa, fluidKey, wUm, hUm, feed, branches, runCfd } = input;
  const feedEndX = FEED_X + feed.lUm;
  const serpX = r(feedEndX + 800);

  // Dal y-konumları: her dalın ayak izi kadar yer + boşluk bırak
  const heights = branches.map((b) => (b.l_mm * 1000) / SERP_K);
  const ys: number[] = [];
  let y = 200;
  for (const h of heights) {
    ys.push(r(y));
    y += h + BRANCH_GAP_UM;
  }
  const midY = r((ys[0] + ys[ys.length - 1]) / 2);

  const lines: string[] = [
    '-- ✦ Otomatik Tasarım — hedef debilerden üretildi (solve_targets)',
    `-- Akışkan: ${fluidKey} · P_in = ${pInPa} Pa · kesit ${wUm}×${hUm} µm`,
    'mf.clear()',
    `mf.set_fluid("${fluidKey}")`,
    `mf.set_inlet_pressure(${pInPa})`,
    '',
    `local inl = mf.add_inlet(0, ${midY}, { pressure = ${pInPa} })`,
    `local feed = mf.add_channel(${FEED_X}, ${midY}, ${r(feedEndX)}, ${midY}, { w = ${feed.wUm}, h = ${hUm}, label = "Besleme" })`,
    'mf.connect(inl, feed)',
    '',
  ];

  branches.forEach((b, i) => {
    const k = i + 1;
    lines.push(
      `-- ${b.label}: Q=${b.target_q_ul_min} µL/min → R=${b.r_disp.toFixed(2)} mbar/(µL/min) → L=${b.l_mm.toFixed(2)} mm`,
      `local s${k} = mf.add_serpentine(${serpX}, ${ys[i]}, { w = ${wUm}, h = ${hUm}, length_mm = ${b.l_mm.toFixed(2)} })`,
      `local o${k} = mf.add_outlet(${r(serpX + 2600)}, ${ys[i]}, { name = "${b.label}" })`,
      `mf.connect(feed, s${k}, { from = 1 })`,
      `mf.connect(s${k}, o${k})`,
      `mf.set_target_flow(o${k}, ${b.target_q_ul_min})`,
      '',
    );
  });

  lines.push('mf.run_quick()');
  if (runCfd) lines.push('mf.run_cfd("kaba")');
  return lines.join('\n') + '\n';
}
