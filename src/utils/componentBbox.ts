/**
 * componentBbox.ts — Bileşen geometrisinin yerel/dünya koordinatlarındaki
 * doğru axis-aligned bounding box (AABB) hesabı.
 *
 * KULLANIM ALANLARI:
 *   - Rubber-band intersect testi (CanvasEditor)
 *   - fitAll() viewport hesabı (useDesignStore)
 *   - CFD overlay ortalama (CfdOverlay)
 *   - Selection visual extents
 *
 * KURAL: Yerel bbox bileşenin (0,0) origin'i etrafında tanımlıdır.
 * Bileşen rotation'ı uygulandıktan sonra dünya bbox'ı türetilir.
 */
import type { ChipComponent } from '../types';
import type {
  StraightChannelParams,
  CurvedChannelParams,
  TJunctionParams,
  YJunctionParams,
  SerpentineMixerParams,
  PortParams,
  DropletGeneratorParams,
  FilterArrayParams,
  ExpansionParams,
  ReservoirParams,
} from '../types';

/** Yerel bbox: bileşen koordinat sisteminde min/max köşeler. */
export interface LocalBbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Dünya bbox: world (canvas) koordinatlarında. */
export interface WorldBbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Bileşenin LOKAL koordinat sisteminde (rotation uygulanmadan) AABB. */
export function localBbox(comp: ChipComponent): LocalBbox {
  // Her case kendi tipini kullanır — TS union narrow'u nedeniyle direkt cast.
  switch (comp.type) {
    case 'straight_channel': {
      const { width = 200, length = 5000 } = comp.params as StraightChannelParams;
      // Shape: Rect(0, -w/2, length, w)
      return { minX: 0, minY: -width / 2, maxX: length, maxY: width / 2 };
    }

    case 'curved_channel': {
      // Yay merkezi (0, radius). Şekil ω=0..angle arası yay; cross-section ±width/2.
      // Doğru AABB = inner yarıçaplı yayın AABB'si ∪ outer yarıçaplı yayın AABB'si.
      const { radius = 1000, angle = 90, width = 200 } = comp.params as CurvedChannelParams;
      const rad = (clampAngle(angle) * Math.PI) / 180;
      const inner = Math.max(0, radius - width / 2);
      const outer = radius + width / 2;
      const center = { x: 0, y: radius };
      // Hem inner hem outer yay (radius=inner ve radius=outer) için iki uç noktayı
      // ve yayda kalan eksen-aşan noktaları (90°, 180°, 270°) dahil ederek bbox topla.
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      const sweepAngles: number[] = [0, rad];
      // Yayın geçtiği eksen noktaları (90°, 180°, 270° gibi) — bbox extremum'u burada olabilir
      for (let k = 1; k * (Math.PI / 2) < rad; k++) sweepAngles.push(k * (Math.PI / 2));
      // Konva path'inde y açısı yukarıdan saat yönünde, ama burada math sin/cos
      // ile parametrize ediyoruz: nokta = (R*sin(θ), R - R*cos(θ)) lokal sistemde.
      for (const r of [inner, outer]) {
        for (const θ of sweepAngles) {
          const x = r * Math.sin(θ);
          const y = center.y - r * Math.cos(θ);
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      return { minX, minY, maxX, maxY };
    }

    case 't_junction': {
      const { mainWidth = 300, branchWidth = 200 } = comp.params as TJunctionParams;
      const arm = mainWidth * 5;
      const branchLen = branchWidth * 4;
      // Ana kanal: x ∈ [-arm, arm], y ∈ [-mainWidth/2, mainWidth/2]
      // Dal: x ∈ [-branchWidth/2, branchWidth/2], y ∈ [-branchLen, mainWidth/2]
      return {
        minX: -arm,
        minY: -branchLen,
        maxX: arm,
        maxY: mainWidth / 2,
      };
    }

    case 'y_junction': {
      const {
        mainWidth = 300,
        branchWidth = 200,
        branchAngle = 45,
      } = comp.params as YJunctionParams;
      const armLen = mainWidth * 5;
      const rad = (branchAngle * Math.PI) / 180;
      // Ana kol: 0..armLen aşağı (y pozitif). x ∈ [-mainWidth/2, mainWidth/2].
      // Sol kol (rotation=-branchAngle, kol y=0..-armLen lokalde) tip: rotate(0,-armLen) → (-armLen*sin, -armLen*cos)
      // Sağ kol simetrik. Dal'ların extent'i ±armLen*sin yatay, -armLen*cos dikey + branchWidth pay.
      const tipX = armLen * Math.sin(rad);
      const tipY = -armLen * Math.cos(rad);
      const halfB = branchWidth / 2 + (Math.abs(Math.cos(rad)) * branchWidth) / 2;
      return {
        minX: Math.min(-mainWidth / 2, -tipX - halfB),
        minY: tipY - branchWidth / 2,
        maxX: Math.max(mainWidth / 2, tipX + halfB),
        maxY: armLen + branchWidth / 2,
      };
    }

    case 'serpentine_mixer': {
      const { turns = 5, pitch = 600, channelWidth = 200 } = comp.params as SerpentineMixerParams;
      const totalW = pitch * 4;
      const totalH = turns * pitch; // son yatay segment y = turns*pitch (portUtils ile aynı)
      // Kanal kalınlığı için ±channelWidth/2 pay (stroke şekli merkez çizgiden taşar)
      const half = channelWidth / 2;
      return { minX: -half, minY: -half, maxX: totalW + half, maxY: totalH + half };
    }

    case 'port': {
      const { diameter = 200 } = comp.params as PortParams;
      const r = diameter / 2;
      return { minX: -r, minY: -r, maxX: r, maxY: r };
    }

    case 'droplet_generator': {
      const { mainChannelWidth = 300, dispersedChannelWidth = 200 } =
        comp.params as DropletGeneratorParams;
      const armLen = mainChannelWidth * 6;
      const dispLen = dispersedChannelWidth * 6;
      return {
        minX: -armLen,
        minY: -dispLen,
        maxX: armLen,
        maxY: mainChannelWidth / 2,
      };
    }

    case 'filter_array': {
      const {
        columns = 10,
        rows = 5,
        spacing = 100,
        pillarDiameter = 50,
      } = comp.params as FilterArrayParams;
      const totalW = columns * (spacing + pillarDiameter);
      const totalH = rows * (spacing + pillarDiameter);
      return { minX: 0, minY: 0, maxX: totalW, maxY: totalH };
    }

    case 'expansion': {
      const { length = 1500, inletWidth = 200, outletWidth = 500 } = comp.params as ExpansionParams;
      const halfMax = Math.max(inletWidth, outletWidth) / 2;
      return { minX: 0, minY: -halfMax, maxX: length, maxY: halfMax };
    }

    case 'reservoir': {
      const { width = 2000, height = 2000 } = comp.params as ReservoirParams;
      return { minX: 0, minY: 0, maxX: width, maxY: height };
    }

    default:
      return { minX: -100, minY: -100, maxX: 100, maxY: 100 };
  }
}

/** Lokal bbox'ı rotation + position ile dünya AABB'sine dönüştür. */
export function worldBbox(comp: ChipComponent): WorldBbox {
  const lb = localBbox(comp);
  const rad = (comp.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // 4 köşeyi rotate et + translate, sonra min/max
  const corners = [
    { x: lb.minX, y: lb.minY },
    { x: lb.maxX, y: lb.minY },
    { x: lb.maxX, y: lb.maxY },
    { x: lb.minX, y: lb.maxY },
  ].map((pt) => ({
    x: comp.position.x + pt.x * cos - pt.y * sin,
    y: comp.position.y + pt.x * sin + pt.y * cos,
  }));
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const c of corners) {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.y > maxY) maxY = c.y;
  }
  return { minX, minY, maxX, maxY };
}

/** İki AABB kesişiyor mu? (rubber-band testi için) */
export function bboxesIntersect(a: WorldBbox, b: WorldBbox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** Açıyı [-360, 360] aralığında güvenli tutar; 0 ise minik epsilon ile değiştir. */
function clampAngle(angleDeg: number): number {
  if (!Number.isFinite(angleDeg)) return 90;
  if (Math.abs(angleDeg) < 0.5) return 0.5;
  return Math.max(-360, Math.min(360, angleDeg));
}
