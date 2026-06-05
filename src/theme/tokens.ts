/**
 * tokens.ts — design-system.css'in JS-tarafı AYNASI.
 *
 * NEDEN: Konva canvas (2D context) ve SVG presentation attribute'leri
 * (`fill="..."`, `stroke="..."`) CSS custom property (`var(--x)`) OKUYAMAZ —
 * literal renk string'i gerekir. DOM (className / style) CSS var kullanır;
 * canvas + recharts SVG bu modülü kullanır.
 *
 * SENKRON KURALI: buradaki değerler design-system.css `--mf-*` / `--chart-*`
 * ile BİREBİR aynı olmalı. Bileşen renkleri için `componentColors.ts`.
 */

/** Yüzey / kenarlık / metin / sinyal — chrome renkleri (literal hex). */
export const TOKENS = {
  // Yüzeyler
  bg: '#0b0d10',
  surface: '#111418',
  panel: '#161a1f',
  elev: '#1d2228',
  // Kenarlıklar
  border: '#252b32',
  borderStrong: '#363d46',
  // Boya (aksan)
  dye: '#4fc3f7',
  dyeBright: '#67e8f9',
  dyeDim: '#2563a6',
  // Sinyal
  active: '#f59e0b',
  ok: '#22c55e',
  warn: '#eab308',
  error: '#ef4444',
  // Metin
  text: '#e6e8ea',
  textDim: '#9aa3ad',
  textDark: '#5c6571',
  // Grafik chrome
  chartGrid: '#252b32',
  chartAxis: '#9aa3ad',
  chartTooltipBg: '#161a1f',
  chartTooltipBorder: '#363d46',
} as const;

/**
 * Grafik veri-serisi renkleri (recharts). Metrik bazlı, semantik çakışmasız.
 * x-ekseni bileşen adı olduğundan bu renkler "metrik" anlamı taşır.
 */
export const CHART_SERIES = {
  flow: '#4fc3f7', // debi — boya teal
  pressure: '#a78bfa', // basınç — mor
  reynolds: '#14b8a6', // Re — koyu teal
  resistance: '#60a5fa', // direnç — mavi
  residual: '#eab308', // CFD yakınsama — uyarı sarısı
} as const;
