/**
 * gdsGeometry.ts — Bileşen listesinden GDS-II için poligon listesi üretir.
 *
 * GDS-II yalnızca **düz kenarlı poligonlar** tanır; eğri kanallar, dairesel
 * portlar ve pillar'lar `arcResolution` parametresine göre düzgün çokgen
 * (regular polygon) olarak ayrıklaştırılır.
 *
 * Koordinatlar μm cinsinden mutlak (dünya) koordinatlardır — Rust tarafı
 * db-unit'e ölçekleyip i32 olarak yazar.
 *
 * Layer/datatype dağılımı (tek katmanlı basit kiralık; ileride çoklu katman):
 *   layer 1 / datatype 0  → akışkan kanalı (her bileşenin aktif alanı)
 *   layer 2 / datatype 0  → rezervuar / port açıklıkları (through-holes)
 */
import type { ChipComponent } from '../../types';

export interface GdsPolygon {
  layer: number;
  datatype: number;
  /** [x, y] çiftleri μm, dünya-koordinat sisteminde. */
  points_um: Array<[number, number]>;
}

// ─── Temel dönüşüm helper'ları ──────────────────────────────────────────────

/** Bileşen-yerel noktayı dünyaya taşı (rotation + position). */
function toWorld(comp: ChipComponent, lx: number, ly: number): [number, number] {
  const rad = (comp.rotation * Math.PI) / 180;
  const cos = Math.cos(rad),
    sin = Math.sin(rad);
  return [comp.position.x + lx * cos - ly * sin, comp.position.y + lx * sin + ly * cos];
}

/** Dikdörtgen (lokal): sol-alt (x,y), genişlik w, yükseklik h. */
function rectLocal(x: number, y: number, w: number, h: number): Array<[number, number]> {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

/** Daire (lokal), n köşeli düzgün çokgenle yaklaşıtır. */
function circleLocal(cx: number, cy: number, r: number, n: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI;
    pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return pts;
}

/**
 * Yay şeridi (annular sector) — iç yarıçap r-w/2, dış yarıçap r+w/2,
 * açı aralığı [0, angleRad], merkez (0, r). Lokal portUtils kuralıyla
 * aynı: giriş (0,0), çıkış (r·sinθ, r·(1-cosθ)).
 * Toplam nokta sayısı ~2·n_arc; n_arc = arcResolution · (angle / 2π).
 */
function arcStrip(
  radius: number,
  width: number,
  angleDeg: number,
  arcResolution: number,
): Array<[number, number]> {
  const angleRad = (angleDeg * Math.PI) / 180;
  const nArc = Math.max(4, Math.round((arcResolution * Math.abs(angleDeg)) / 360));
  const rOut = radius + width / 2;
  const rIn = radius - width / 2;
  // Merkez (0, r): dış yay saat yönünde giriş→çıkış, iç yay çıkış→giriş.
  const outer: Array<[number, number]> = [];
  const inner: Array<[number, number]> = [];
  for (let i = 0; i <= nArc; i++) {
    const t = (i / nArc) * angleRad;
    const cx = rOut * Math.sin(t);
    const cy = radius - rOut * Math.cos(t);
    outer.push([cx, cy]);
  }
  for (let i = nArc; i >= 0; i--) {
    const t = (i / nArc) * angleRad;
    const cx = rIn * Math.sin(t);
    const cy = radius - rIn * Math.cos(t);
    inner.push([cx, cy]);
  }
  return [...outer, ...inner];
}

/** Lokal bir poligonu bileşen koordinat sisteminden dünyaya taşı. */
function toWorldPolygon(
  comp: ChipComponent,
  localPoints: Array<[number, number]>,
): Array<[number, number]> {
  return localPoints.map(([lx, ly]) => toWorld(comp, lx, ly));
}

// ─── Bileşen-başı tessellation ──────────────────────────────────────────────

function buildComponentPolygons(comp: ChipComponent, arcResolution: number): GdsPolygon[] {
  const p: any = comp.params;
  const out: GdsPolygon[] = [];
  const push = (local: Array<[number, number]>, layer = 1, datatype = 0) => {
    if (local.length < 3) return;
    out.push({ layer, datatype, points_um: toWorldPolygon(comp, local) });
  };

  switch (comp.type) {
    case 'straight_channel': {
      // Lokal (0, -w/2) → (length, +w/2)
      push(rectLocal(0, -p.width / 2, p.length, p.width));
      break;
    }

    case 'curved_channel': {
      push(arcStrip(p.radius, p.width, p.angle, arcResolution));
      break;
    }

    case 't_junction': {
      const mw = p.mainWidth;
      const bw = p.branchWidth;
      const armLen = mw * 5;
      // Ana kanal — yatay, merkezli
      push(rectLocal(-armLen, -mw / 2, armLen * 2, mw));
      // Branch — aşağı doğru
      push(rectLocal(-bw / 2, -bw * 4, bw, bw * 4));
      break;
    }

    case 'y_junction': {
      const mw = p.mainWidth;
      const bw = p.branchWidth;
      const branchAngleRad = ((p.branchAngle ?? 45) * Math.PI) / 180;
      const armLen = mw * 5;
      // Yatay ana kanal (iki branch arası)
      push(rectLocal(-armLen, -mw / 2, armLen * 2, mw));
      // Alt giriş (aşağı, y=armLen yönünde)
      push(rectLocal(-bw / 2, 0, bw, armLen));
      // İki çapraz branch şeridi — her birini "rotated rect" olarak üret.
      // Branch uç noktası (±armLen·sin, -armLen·cos).
      const mkAngled = (sign: 1 | -1) => {
        // Lokal şerit: (0, 0) → (sign·L·sin, -L·cos), genişlik bw
        // Önce (0,0)→(L,0) şeridi olarak ürettik, sonra manuel döndür.
        const L = armLen;
        const rectRaw = rectLocal(0, -bw / 2, L, bw);
        const a = branchAngleRad * sign;
        const cos = Math.cos(a),
          sin = Math.sin(a);
        // Ek rotasyon: şerit ekseni +y'ye çevrilmeli (şu an +x).
        // Açıyı "(-π/2) + sign·branchAngle" olarak düşün.
        const theta = -Math.PI / 2 + a;
        const ct = Math.cos(theta),
          st = Math.sin(theta);
        const _ = [cos, sin];
        void _;
        return rectRaw.map(
          ([lx, ly]) => [lx * ct - ly * st, lx * st + ly * ct] as [number, number],
        );
      };
      push(mkAngled(-1));
      push(mkAngled(+1));
      break;
    }

    case 'serpentine_mixer': {
      const cw = p.channelWidth;
      const pitch = p.pitch;
      const turns = Math.max(1, p.turns);
      const totalW = pitch * (turns + 1);
      // Basit zig-zag: yatay segmentler + dikey bağlantılar.
      // Her "U-dönüş" pitch genişliğinde.
      // Yatay segmentleri (turns+1 tane) ve dikey bağlantıları (turns tane) üret.
      for (let i = 0; i <= turns; i++) {
        const yTop = i % 2 === 0 ? -pitch / 2 : pitch / 2 - cw;
        // Yatay şerit — sol-sağ
        const xStart = i === 0 ? 0 : i * pitch - pitch; // örtüşmeyi önlemek için kaba
        const xEnd = i === turns ? totalW : (i + 1) * pitch;
        const x0 = Math.min(xStart, xEnd);
        const x1 = Math.max(xStart, xEnd);
        push(rectLocal(x0, yTop, x1 - x0, cw));
      }
      // Dikey bağlantılar (basitleştirilmiş)
      for (let i = 1; i <= turns; i++) {
        const x = i * pitch - cw / 2;
        push(rectLocal(x, -pitch / 2, cw, pitch));
      }
      break;
    }

    case 'expansion': {
      const il = p.inletWidth,
        ol = p.outletWidth,
        L = p.length;
      // Trapezoid (ikizkenar yamuk)
      push([
        [0, -il / 2],
        [L, -ol / 2],
        [L, ol / 2],
        [0, il / 2],
      ]);
      break;
    }

    case 'droplet_generator': {
      const w = p.mainChannelWidth;
      const d = p.dispersedChannelWidth ?? w;
      const ori = p.orificeWidth ?? w / 3;
      // Ana kanal
      push(rectLocal(-w * 6, -w / 2, w * 12, w));
      // Dağılmış faz kanalı (dikey)
      push(rectLocal(-d / 2, -d * 6, d, d * 6));
      // Orifis daralmasını ayrı bir küçük dikdörtgen olarak ekle (bilgi amaçlı)
      push(rectLocal(-ori / 2, -w / 2, ori, w));
      break;
    }

    case 'filter_array': {
      const cols = p.columns ?? 10;
      const rows = p.rows ?? 5;
      const sp = p.spacing ?? 100;
      const d = p.pillarDiameter ?? 50;
      // Dış çerçeve
      push(rectLocal(0, 0, cols * sp, rows * sp), 2, 0);
      // Her pillar — layer 1
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          push(circleLocal(c * sp + sp / 2, r * sp + sp / 2, d / 2, arcResolution));
        }
      }
      break;
    }

    case 'reservoir': {
      push(rectLocal(0, 0, p.width, p.height), 2, 0);
      break;
    }

    case 'port': {
      push(circleLocal(0, 0, p.diameter / 2, arcResolution), 2, 0);
      break;
    }
  }

  return out;
}

// ─── Dışa aktarılan API ─────────────────────────────────────────────────────

export interface BuildGdsOptions {
  /** Arc→polyline ayrıklaştırma nokta sayısı (tam 360° için). */
  arcResolution: number;
}

/** Tüm tasarımı GDS-II poligonlarına çevir. */
export function buildGdsPolygons(
  components: ChipComponent[],
  options: BuildGdsOptions,
): GdsPolygon[] {
  const arcRes = Math.max(8, Math.min(512, Math.round(options.arcResolution)));
  const all: GdsPolygon[] = [];
  for (const c of components) {
    all.push(...buildComponentPolygons(c, arcRes));
  }
  return all;
}
