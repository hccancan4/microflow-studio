/**
 * componentColors.ts — Bileşen renginin KANONİK TS kaynağı.
 *
 * Konva canvas literal hex string gerektirir (CSS custom property okuyamaz),
 * bu yüzden bileşen renkleri burada TS tarafında tek kaynaktan tanımlanır.
 * `src/styles/design-system.css` içindeki `--comp-*` değişkenleri bunu DOM
 * tarafı için yansıtır — İKİSİ BİREBİR SENKRON KALMALI.
 *
 * Tüketiciler (RAY 1+ sonrası):
 *   - Canvas:  ComponentShapes.tsx (stroke + fill)
 *   - Tablo:   ResultsPanel bileşen satırı renk noktası
 *   - Grafik:  recharts serisi rengi (bileşen bazlı)
 *   - Legend:  CFD / sweep legend
 * Böylece kullanıcının "teal = kanal" zihinsel haritası her yüzeyde tutarlı.
 *
 * KAVRAM (Laminar): teal/cyan = kanal boyası. Yeşil/kırmızı yalnız I/O.
 * Turuncu (#f59e0b) bilinçli olarak DIŞARIDA — o yalnız aktif/simülasyon.
 */
import type { ComponentType } from '../types';

export interface ComponentColor {
  /** Ana çizgi/dolu renk (canvas stroke, tablo noktası, grafik serisi). */
  stroke: string;
  /** Düşük-alfa dolgu (canvas shape fill). */
  fill: string;
}

/** hex → rgba(.., alpha) yardımcı (derleme-zamanı sabitleri için). */
function tint(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Kanonik hex değerleri — design-system.css --comp-* ile aynı olmalı.
const HEX = {
  channel:     '#4fc3f7',
  expansion:   '#38bdf8',
  mixer:       '#14b8a6',
  junction:    '#a78bfa',
  filter:      '#60a5fa',
  droplet:     '#f472b6',
  reservoir:   '#94a3b8',
  portInlet:   '#22c55e',
  portOutlet:  '#ef4444',
} as const;

/** Seçim vurgusu rengi (boya teal). */
export const SELECTED_COLOR = '#4fc3f7';

/** Bileşen tipi → { stroke, fill }. Fill alfa şekil tipine göre 0.08–0.15. */
export const COMPONENT_COLORS: Record<ComponentType, ComponentColor> = {
  straight_channel:  { stroke: HEX.channel,    fill: tint(HEX.channel, 0.08) },
  curved_channel:    { stroke: HEX.channel,    fill: tint(HEX.channel, 0.08) },
  expansion:         { stroke: HEX.expansion,  fill: tint(HEX.expansion, 0.08) },
  serpentine_mixer:  { stroke: HEX.mixer,      fill: tint(HEX.mixer, 0.08) },
  t_junction:        { stroke: HEX.junction,   fill: tint(HEX.junction, 0.08) },
  y_junction:        { stroke: HEX.junction,   fill: tint(HEX.junction, 0.08) },
  filter_array:      { stroke: HEX.filter,     fill: tint(HEX.filter, 0.08) },
  droplet_generator: { stroke: HEX.droplet,    fill: tint(HEX.droplet, 0.08) },
  reservoir:         { stroke: HEX.reservoir,  fill: tint(HEX.reservoir, 0.12) },
  port:              { stroke: HEX.portInlet,  fill: tint(HEX.portInlet, 0.15) },
};

/** Port tipine göre renk (inlet/outlet ayrımı — PortShape için). */
export const PORT_COLORS = {
  inlet:  { stroke: HEX.portInlet,  fill: tint(HEX.portInlet, 0.15) },
  outlet: { stroke: HEX.portOutlet, fill: tint(HEX.portOutlet, 0.15) },
} as const;

/** StyleGuide / legend için düz palet listesi (sıralı). */
export const COMPONENT_PALETTE: Array<{ key: string; label: string; hex: string }> = [
  { key: 'channel',     label: 'Kanal',        hex: HEX.channel },
  { key: 'expansion',   label: 'Genişleme',    hex: HEX.expansion },
  { key: 'mixer',       label: 'Mikser',       hex: HEX.mixer },
  { key: 'junction',    label: 'Birleşim',     hex: HEX.junction },
  { key: 'filter',      label: 'Filtre',       hex: HEX.filter },
  { key: 'droplet',     label: 'Damlacık',     hex: HEX.droplet },
  { key: 'reservoir',   label: 'Rezervuar',    hex: HEX.reservoir },
  { key: 'port-inlet',  label: 'Giriş Portu',  hex: HEX.portInlet },
  { key: 'port-outlet', label: 'Çıkış Portu',  hex: HEX.portOutlet },
];
