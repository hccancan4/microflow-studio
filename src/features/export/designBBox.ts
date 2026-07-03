/**
 * designBBox.ts — Tasarımın dünya-koordinatlarındaki (μm) bounding box'ını
 * hesaplar. exportRenderer.tsx ve svgExporter.ts buradan tüketir.
 */
import { getAllCanvasPorts } from '../../utils/portUtils';
import type {
  ChipComponent,
  StraightChannelParams,
  CurvedChannelParams,
  SerpentineMixerParams,
  ExpansionParams,
  TJunctionParams,
  DropletGeneratorParams,
  FilterArrayParams,
  ReservoirParams,
  PortParams,
} from '../../types';

export interface DesignBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Tasarımın dünya-koordinatlarındaki (μm) bounding box'ını hesaplar.
 * Bileşen bbox'ları rotation sonrası AABB olarak alınır; portlar da dahil edilir.
 */
export function computeDesignBBox(components: ChipComponent[]): DesignBBox {
  if (components.length === 0) {
    return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  }
  let minX = Infinity,
    minY = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity;

  const consider = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const c of components) {
    // Bileşen tipine göre lokal genişlik / yükseklik (kabaca)
    let w = 500,
      h = 500;
    switch (c.type) {
      case 'straight_channel': {
        const p = c.params as StraightChannelParams;
        w = p.length;
        h = p.width;
        break;
      }
      case 'curved_channel': {
        const p = c.params as CurvedChannelParams;
        w = p.radius * 2;
        h = p.radius * 2;
        break;
      }
      case 'serpentine_mixer': {
        const p = c.params as SerpentineMixerParams;
        w = p.pitch * (p.turns + 1);
        h = p.pitch * 2;
        break;
      }
      case 'expansion': {
        const p = c.params as ExpansionParams;
        w = p.length;
        h = Math.max(p.inletWidth, p.outletWidth);
        break;
      }
      case 't_junction':
      case 'y_junction': {
        const p = c.params as TJunctionParams;
        w = p.mainWidth * 3;
        h = p.mainWidth * 3;
        break;
      }
      case 'droplet_generator': {
        const p = c.params as DropletGeneratorParams;
        w = p.mainChannelWidth * 4;
        h = p.mainChannelWidth * 3;
        break;
      }
      case 'filter_array': {
        const p = c.params as FilterArrayParams;
        w = p.columns * p.spacing;
        h = p.rows * p.spacing;
        break;
      }
      case 'reservoir': {
        const p = c.params as ReservoirParams;
        w = p.width;
        h = p.height;
        break;
      }
      case 'port': {
        const p = c.params as PortParams;
        w = p.diameter;
        h = p.diameter;
        break;
      }
    }

    // Rotation sonrası AABB — dört köşeyi dön, min/max al.
    const rad = (c.rotation * Math.PI) / 180;
    const cos = Math.cos(rad),
      sin = Math.sin(rad);
    // Lokal çizim köşeleri: çoğu bileşen origin'i sol uçta; güvenlik için geniş AABB kullan
    const corners = [
      { x: 0, y: -h / 2 },
      { x: w, y: -h / 2 },
      { x: w, y: h / 2 },
      { x: 0, y: h / 2 },
    ];
    for (const pt of corners) {
      const wx = c.position.x + pt.x * cos - pt.y * sin;
      const wy = c.position.y + pt.x * sin + pt.y * cos;
      consider(wx, wy);
    }
  }

  // Tüm portları da dahil et (bağlantı uçları zaten port konumlarını kullanır)
  try {
    const ports = getAllCanvasPorts(components);
    for (const p of ports) {
      consider(p.canvasPos.x, p.canvasPos.y);
    }
  } catch {
    /* port util çağrısı başarısızsa bileşen bbox'ı yeterli */
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 1000;
    maxY = 1000;
  }
  return { minX, minY, maxX, maxY };
}
