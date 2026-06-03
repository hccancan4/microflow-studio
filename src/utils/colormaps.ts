/**
 * colormaps.ts — Bilimsel renk haritaları
 *
 * Her harita, [0,1] aralığındaki bir skaler değeri [R,G,B] (0-255) renge eşler.
 * Viridis ve Plasma: algısal olarak uniform (matplotlib ≥2.0 varsayılanları).
 * Jet: klasik ama perceptual olarak ideal değil (referans için).
 * Coolwarm: diverging — sıfır civarı ayrımını vurgulamak için kullanılır.
 */

import type { ColormapType } from '../types';

type RGB = [number, number, number];

/** Perceptually-uniform viridis (8-stop yaklaşıklığı) */
const VIRIDIS_STOPS: RGB[] = [
  [68, 1, 84],
  [72, 40, 120],
  [62, 74, 137],
  [49, 104, 142],
  [38, 130, 142],
  [31, 158, 137],
  [53, 183, 121],
  [109, 205, 89],
  [180, 222, 44],
  [253, 231, 37],
];

const PLASMA_STOPS: RGB[] = [
  [13, 8, 135],
  [75, 3, 161],
  [125, 3, 168],
  [168, 34, 150],
  [203, 70, 121],
  [229, 107, 93],
  [248, 148, 65],
  [253, 195, 40],
  [240, 249, 33],
];

/** Coolwarm — 0.5 merkezli (mavi → beyaz → kırmızı) */
const COOLWARM_STOPS: RGB[] = [
  [59, 76, 192],
  [98, 132, 230],
  [142, 178, 253],
  [186, 214, 247],
  [221, 221, 221],
  [245, 193, 167],
  [245, 150, 107],
  [224, 99, 67],
  [180, 4, 38],
];

/** Piecewise-lineer renk enterpolasyonu: stops arasında pürüzsüz geçiş */
function interpolateStops(t: number, stops: RGB[]): RGB {
  const x = Math.max(0, Math.min(1, t));
  const n = stops.length - 1;
  const pos = x * n;
  const i = Math.floor(pos);
  const f = pos - i;
  const a = stops[i];
  const b = stops[Math.min(i + 1, n)];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

/** Jet — parçalı tanımlı klasik palet */
function jet(t: number): RGB {
  const x = Math.max(0, Math.min(1, t));
  const r = Math.round(255 * Math.max(0, Math.min(1, 1.5 - Math.abs(4 * x - 3))));
  const g = Math.round(255 * Math.max(0, Math.min(1, 1.5 - Math.abs(4 * x - 2))));
  const b = Math.round(255 * Math.max(0, Math.min(1, 1.5 - Math.abs(4 * x - 1))));
  return [r, g, b];
}

/** Ana API: değeri [0,1]'e normalize ettikten sonra RGB üret. */
export function colormap(t: number, type: ColormapType): RGB {
  switch (type) {
    case 'viridis':  return interpolateStops(t, VIRIDIS_STOPS);
    case 'plasma':   return interpolateStops(t, PLASMA_STOPS);
    case 'coolwarm': return interpolateStops(t, COOLWARM_STOPS);
    case 'jet':      return jet(t);
    default:         return interpolateStops(t, VIRIDIS_STOPS);
  }
}

// ── 256-girişli renk LUT'u (tip başına bir kez hesaplanır, memoize) ────────
// fieldToImageData her pikselde colormap() çağırmak yerine bu tablodan okur;
// CFD overlay render'ında belirgin hızlanma sağlar (interpolasyon tekrarı yok).
const LUT_SIZE = 256;
const lutCache = new Map<ColormapType, Uint8Array>();

function colormapLut(type: ColormapType): Uint8Array {
  const cached = lutCache.get(type);
  if (cached) return cached;
  const lut = new Uint8Array(LUT_SIZE * 3);
  for (let i = 0; i < LUT_SIZE; i++) {
    const [r, g, b] = colormap(i / (LUT_SIZE - 1), type);
    lut[i * 3] = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }
  lutCache.set(type, lut);
  return lut;
}

/**
 * 2D skaler sahayı (row-major, width×height) RGBA `Uint8ClampedArray` (ImageData uyumlu)
 * olarak renklendirir. `y` eksenini ters çevirmek için `flipY=true`.
 */
export function fieldToImageData(
  values: number[] | Float32Array | Float64Array,
  width: number,
  height: number,
  min: number,
  max: number,
  type: ColormapType,
  opts?: { flipY?: boolean; alpha?: number },
): Uint8ClampedArray {
  const alpha = opts?.alpha ?? 220;
  const flipY = opts?.flipY ?? true;
  const span = max - min;
  const inv = span > 0 ? 1 / span : 0;
  const out = new Uint8ClampedArray(width * height * 4);
  const lut = colormapLut(type);

  for (let j = 0; j < height; j++) {
    const jSrc = flipY ? height - 1 - j : j;
    for (let i = 0; i < width; i++) {
      const src = jSrc * width + i;
      const dst = (j * width + i) * 4;
      let t = (values[src] - min) * inv;
      t = t < 0 ? 0 : t > 1 ? 1 : t;          // [0,1] clamp (LUT indeksi için)
      const li = ((t * (LUT_SIZE - 1) + 0.5) | 0) * 3;
      out[dst + 0] = lut[li];
      out[dst + 1] = lut[li + 1];
      out[dst + 2] = lut[li + 2];
      out[dst + 3] = alpha;
    }
  }
  return out;
}

/** Legend için: N eşit aralıklı örnek renk döndür. */
export function colormapSamples(n: number, type: ColormapType): RGB[] {
  const out: RGB[] = [];
  for (let i = 0; i < n; i++) {
    out.push(colormap(i / Math.max(1, n - 1), type));
  }
  return out;
}

/** CSS gradient string'i — legend için hızlıca kullanılır */
export function colormapCssGradient(type: ColormapType, stops = 12): string {
  const samples = colormapSamples(stops, type);
  const parts = samples.map((rgb, i) => {
    const pct = ((i / (stops - 1)) * 100).toFixed(1);
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]}) ${pct}%`;
  });
  return `linear-gradient(to right, ${parts.join(', ')})`;
}
