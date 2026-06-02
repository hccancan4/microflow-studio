/**
 * experimentMetrics.ts — Simülasyon eğrisi vs deney noktaları
 * karşılaştırma metrikleri ve yardımcı enterpolatörler.
 *
 * Deney noktaları genellikle simülasyon gridi ile örtüşmediğinden, sim eğrisi
 * (xSim sıralı) doğrusal enterpolasyonla xExp'lere taşınır; metrikler bu
 * eşleştirilmiş çiftler üzerinde hesaplanır.
 */

export interface ComparisonMetrics {
  /** R² — kareli belirginlik. 1: mükemmel; 0: ortalamaya eşdeğer; < 0: kötü. */
  rSquared: number;
  /** Ortalama Karesel Hatanın karekökü. sim birimi. */
  rmse: number;
  /** Ortalama mutlak yüzde hata. `measured ≈ 0` dışlanır (küçük bölen). */
  meanAbsPctError: number;
  /** Mutlak maksimum hata. */
  maxAbsError: number;
  /** Kullanılan eşleştirilmiş nokta sayısı. */
  n: number;
}

/** xs monoton artan varsayılır. Dışarı çıkarsa en yakın kenara düşer. */
export function linearInterp(xs: number[], ys: number[], xq: number): number {
  const n = xs.length;
  if (n === 0) return NaN;
  if (n === 1) return ys[0];
  if (xq <= xs[0]) return ys[0];
  if (xq >= xs[n - 1]) return ys[n - 1];
  // Binary search
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= xq) lo = mid; else hi = mid;
  }
  const t = (xq - xs[lo]) / (xs[hi] - xs[lo]);
  return ys[lo] * (1 - t) + ys[hi] * t;
}

/** (x → y) çiftlerini x'e göre sırala ve aynı x'teki tekrarları ortalamayla birleştir. */
export function sortAndDedup(pairs: Array<[number, number]>): { xs: number[]; ys: number[] } {
  const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const [x, y] = sorted[i];
    if (xs.length > 0 && Math.abs(x - xs[xs.length - 1]) < 1e-9) {
      // Aynı x — ortalamaya katkı
      const k = xs.length - 1;
      ys[k] = (ys[k] + y) / 2;
    } else {
      xs.push(x); ys.push(y);
    }
  }
  return { xs, ys };
}

/**
 * Karşılaştırma metriği. `simX/simY` sim eğrisi (x'e göre sıralı olmalı),
 * `expX/expY` deney noktaları.
 */
export function computeMetrics(
  simX: number[], simY: number[],
  expX: number[], expY: number[],
): ComparisonMetrics {
  if (simX.length < 2 || expX.length === 0) {
    return { rSquared: NaN, rmse: NaN, meanAbsPctError: NaN, maxAbsError: NaN, n: 0 };
  }

  // Sim eğrisini deney x'lerine enterpole et
  const interp: number[] = expX.map((x) => linearInterp(simX, simY, x));

  // Geçerli (finite) eşleştirmeler
  const pairs: Array<[number, number]> = []; // (sim_at_x, exp_at_x)
  for (let i = 0; i < expX.length; i++) {
    if (Number.isFinite(interp[i]) && Number.isFinite(expY[i])) {
      pairs.push([interp[i], expY[i]]);
    }
  }
  const n = pairs.length;
  if (n === 0) {
    return { rSquared: NaN, rmse: NaN, meanAbsPctError: NaN, maxAbsError: NaN, n: 0 };
  }

  // Ortalamalar
  let sumExp = 0;
  for (const [, e] of pairs) sumExp += e;
  const meanExp = sumExp / n;

  // SSR (artık kareleri toplamı) ve SSTot (deneyin varyansı × n)
  let ssr = 0, ssTot = 0, maxAbs = 0, sumPct = 0, usedPct = 0;
  for (const [s, e] of pairs) {
    const diff = s - e;
    ssr += diff * diff;
    const dEx = e - meanExp;
    ssTot += dEx * dEx;
    const abs = Math.abs(diff);
    if (abs > maxAbs) maxAbs = abs;
    if (Math.abs(e) > 1e-12) {
      sumPct += abs / Math.abs(e);
      usedPct++;
    }
  }

  const rmse = Math.sqrt(ssr / n);
  const rSquared = ssTot > 0 ? 1 - ssr / ssTot : (ssr < 1e-18 ? 1 : NaN);
  const meanAbsPctError = usedPct > 0 ? (sumPct / usedPct) * 100 : NaN;

  return { rSquared, rmse, meanAbsPctError, maxAbsError: maxAbs, n };
}
