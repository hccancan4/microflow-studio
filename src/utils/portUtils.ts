/**
 * portUtils.ts
 * Her bileşen tipi için port konumlarını hesaplar.
 * Port konumları bileşenin yerel koordinat sistemindedir (rotation uygulanmadan).
 * Canvas'ta görüntülemek için bileşenin position + rotation'ı eklenmeli.
 */

import type { ChipComponent, Point } from '../types';
import type {
  StraightChannelParams, CurvedChannelParams, TJunctionParams, YJunctionParams,
  SerpentineMixerParams, PortParams, DropletGeneratorParams,
  FilterArrayParams, ExpansionParams, ReservoirParams,
} from '../types';

export interface PortInfo {
  index: number;
  localPos: Point;      // bileşen-yerel koordinatlar (μm)
  type: 'input' | 'output';
  label: string;
  diameter: number;     // μm — geçiş genişliği (uyumluluk kontrolü için)
}

/** Bileşen tipine göre port bilgilerini döndür */
export function getPortInfos(comp: ChipComponent): PortInfo[] {
  const p = comp.params as any;

  switch (comp.type) {
    case 'straight_channel': {
      const { length = 5000, width = 200 } = p as StraightChannelParams;
      return [
        { index: 0, localPos: { x: 0,      y: 0 }, type: 'input',  label: 'Giriş',  diameter: width },
        { index: 1, localPos: { x: length, y: 0 }, type: 'output', label: 'Çıkış',  diameter: width },
      ];
    }

    case 'curved_channel': {
      const { radius = 1000, angle = 90, width = 200 } = p as CurvedChannelParams;
      // Edge case clamp — şekille tutarlı (ComponentShapes.CurvedChannel ile aynı).
      const safeAngle  = Math.max(1, Math.min(359, Number.isFinite(angle) ? angle : 90));
      const safeRadius = Math.max(width / 2 + 1, Number.isFinite(radius) ? radius : 1000);
      const rad = (safeAngle * Math.PI) / 180;
      return [
        { index: 0, localPos: { x: 0,                          y: 0                              }, type: 'input',  label: 'Giriş', diameter: width },
        { index: 1, localPos: { x: safeRadius * Math.sin(rad), y: safeRadius * (1 - Math.cos(rad)) }, type: 'output', label: 'Çıkış', diameter: width },
      ];
    }

    case 't_junction': {
      const { mainWidth = 300, branchWidth = 200 } = p as TJunctionParams;
      const halfBranch = branchWidth / 2;
      return [
        { index: 0, localPos: { x: -mainWidth * 5, y: 0           }, type: 'input',  label: 'Sol',    diameter: mainWidth },
        { index: 1, localPos: { x:  mainWidth * 5, y: 0           }, type: 'output', label: 'Sağ',    diameter: mainWidth },
        { index: 2, localPos: { x: 0,              y: -branchWidth * 4 }, type: 'output', label: 'Dal', diameter: branchWidth },
      ];
    }

    case 'y_junction': {
      const { mainWidth = 300, branchWidth = 200, branchAngle = 45 } = p as YJunctionParams;
      const rad = (branchAngle * Math.PI) / 180;
      const armLen = mainWidth * 5;
      return [
        { index: 0, localPos: { x: 0,                          y:  armLen              }, type: 'input',  label: 'Ana',    diameter: mainWidth },
        { index: 1, localPos: { x: -armLen * Math.sin(rad),    y: -armLen * Math.cos(rad) }, type: 'output', label: 'Sol Dal', diameter: branchWidth },
        { index: 2, localPos: { x:  armLen * Math.sin(rad),    y: -armLen * Math.cos(rad) }, type: 'output', label: 'Sağ Dal', diameter: branchWidth },
      ];
    }

    case 'serpentine_mixer': {
      const { channelWidth = 200, turns = 5, pitch = 600 } = p as SerpentineMixerParams;
      const totalHeight = (turns + 1) * pitch;
      const totalWidth  = pitch * 4;
      return [
        { index: 0, localPos: { x: 0,          y: 0            }, type: 'input',  label: 'Giriş', diameter: channelWidth },
        { index: 1, localPos: { x: totalWidth,  y: totalHeight  }, type: 'output', label: 'Çıkış', diameter: channelWidth },
      ];
    }

    case 'port': {
      const { diameter = 500 } = p as PortParams;
      return [
        { index: 0, localPos: { x: 0, y: 0 }, type: p.portType === 'inlet' ? 'output' : 'input', label: p.portType === 'inlet' ? 'Çıkış' : 'Giriş', diameter },
      ];
    }

    case 'droplet_generator': {
      const { orificeWidth = 100, mainChannelWidth = 300, dispersedChannelWidth = 200 } = p as DropletGeneratorParams;
      return [
        { index: 0, localPos: { x: -mainChannelWidth * 6, y: 0                          }, type: 'input',  label: 'Ana Giriş',  diameter: mainChannelWidth },
        { index: 1, localPos: { x:  mainChannelWidth * 6, y: 0                          }, type: 'output', label: 'Çıkış',       diameter: orificeWidth },
        { index: 2, localPos: { x: 0,                     y: -dispersedChannelWidth * 6 }, type: 'input',  label: 'Dağılmış',   diameter: dispersedChannelWidth },
      ];
    }

    case 'filter_array': {
      const { columns = 10, spacing = 100, pillarDiameter = 50 } = p as FilterArrayParams;
      const totalW = columns * (spacing + pillarDiameter);
      return [
        { index: 0, localPos: { x: 0,       y: 0 }, type: 'input',  label: 'Giriş', diameter: spacing },
        { index: 1, localPos: { x: totalW,  y: 0 }, type: 'output', label: 'Çıkış', diameter: spacing },
      ];
    }

    case 'expansion': {
      const { inletWidth = 200, outletWidth = 500, length = 1000 } = p as ExpansionParams;
      return [
        { index: 0, localPos: { x: 0,      y: 0 }, type: 'input',  label: 'Giriş', diameter: inletWidth },
        { index: 1, localPos: { x: length, y: 0 }, type: 'output', label: 'Çıkış', diameter: outletWidth },
      ];
    }

    case 'reservoir': {
      const { width = 2000, height = 2000 } = p as ReservoirParams;
      return [
        { index: 0, localPos: { x: width / 2,  y: 0      }, type: 'input',  label: 'Üst',   diameter: 500 },
        { index: 1, localPos: { x: width / 2,  y: height  }, type: 'output', label: 'Alt',   diameter: 500 },
        { index: 2, localPos: { x: 0,           y: height / 2 }, type: 'input',  label: 'Sol', diameter: 500 },
        { index: 3, localPos: { x: width,       y: height / 2 }, type: 'output', label: 'Sağ', diameter: 500 },
      ];
    }

    default:
      return [];
  }
}

/** Bileşenin yerel port konumunu canvas koordinatına dönüştür (rotation dahil) */
export function localToCanvas(localPos: Point, comp: ChipComponent): Point {
  const rad = (comp.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: comp.position.x + localPos.x * cos - localPos.y * sin,
    y: comp.position.y + localPos.x * sin + localPos.y * cos,
  };
}

/** Tüm bileşenlerin düz port listesi (canvas koordinatlarında) */
export function getAllCanvasPorts(components: ChipComponent[]) {
  return components.flatMap((comp) =>
    getPortInfos(comp).map((port) => ({
      ...port,
      compId: comp.id,
      canvasPos: localToCanvas(port.localPos, comp),
    }))
  );
}

/** İki port birbirine bağlanabilir mi? (tip ve çap uyumluluk) */
export interface CompatibilityResult {
  compatible: boolean;
  warning?: string;
}

export function checkPortCompatibility(
  fromDiameter: number,
  toDiameter: number,
  fromType: 'input' | 'output',
  toType: 'input' | 'output',
): CompatibilityResult {
  // Aynı tipe bağlanmaya izin verme (output→output, input→input)
  if (fromType === toType) {
    return { compatible: false, warning: `İki ${fromType === 'output' ? 'çıkış' : 'giriş'} portu birbirine bağlanamaz.` };
  }

  // Boyut uyumsuzluğu: %50'den fazla fark uyarı verir ama engellemiyor
  const ratio = Math.max(fromDiameter, toDiameter) / Math.min(fromDiameter, toDiameter);
  if (ratio > 1.5) {
    return {
      compatible: true,
      warning: `Boyut uyumsuzluğu: ${fromDiameter}μm → ${toDiameter}μm (${ratio.toFixed(1)}x fark). Geçiş bölgesi önerilir.`,
    };
  }

  return { compatible: true };
}

/** İki nokta arası L-bend wire noktaları (manhattan routing) — eski API. */
export function lBendPoints(from: Point, to: Point): number[] {
  const midX = (from.x + to.x) / 2;
  return [from.x, from.y, midX, from.y, midX, to.y, to.x, to.y];
}

/**
 * Akıllı yönlendirme — port konumlarına göre uygun çizgi tipi seçer:
 *   - Çok yakın (<200μm) veya tam hizalı: tek doğru çizgi
 *   - Aksi: 4-segment manhattan (mevcut L-bend)
 *
 * Gelecekte port "facing direction" eklenirse buradan yönlendirilebilir
 * (örn. çıkış sağa bakıyorsa ve hedef solda → ek S-bükümü).
 */
export function smartRoute(from: Point, to: Point): number[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  // Çok yakın → S-büküm yerine direkt
  if (dist < 200) return [from.x, from.y, to.x, to.y];
  // Yatay/dikey hizalı (≤80μm tolerans) → direkt
  if (Math.abs(dy) < 80 || Math.abs(dx) < 80) return [from.x, from.y, to.x, to.y];
  // Genel: orta-X manhattan
  return lBendPoints(from, to);
}
