/**
 * svgExporter.ts — Tasarımın vektör (SVG) temsilini üretir.
 *
 * Bu exporter, her bileşenin kaba footprint'ini (tip-başına şekil) ve
 * bağlantı hatlarını SVG olarak çizer. İhraç boyutu bbox'a göre otomatik
 * hesaplanır; koordinatlar μm cinsinden SVG `viewBox` içinde yazılır.
 *
 * Not: Ekrandaki Konva `ComponentShape` birebir kopyalanmamıştır — bu
 * export "semi-schematic" bir temsildir ve CAD/ürün dokümanı, sunum ve
 * yayımlanabilir vektör çizim üretmek için yeterlidir. Tam raster için
 * PNG exporter'ı (exportRenderer.tsx) kullanılmalıdır.
 */
import type { ChipComponent, Connection } from '../../types';
import { getAllCanvasPorts } from '../../utils/portUtils';
import { computeDesignBBox } from './exportRenderer';
import { COMPONENT_COLORS, PORT_COLORS } from '../../theme/componentColors';
import { TOKENS } from '../../theme/tokens';

export interface SvgExportOptions {
  background: 'white' | 'dark' | 'transparent';
  includeScaleBar: boolean;
  paddingUm: number;
}

// Export paleti — canvas ile birebir aynı (componentColors.ts tek kaynak).
// SVG export'un canvas görünümüyle tutarlı olması için.
const COLOR_CHANNEL = COMPONENT_COLORS.straight_channel.stroke;
const COLOR_CHANNEL_DRK = TOKENS.dyeDim;
const COLOR_JUNCTION = COMPONENT_COLORS.t_junction.stroke;
const COLOR_RESERVOIR = COMPONENT_COLORS.reservoir.stroke;
const COLOR_PORT = PORT_COLORS.inlet.stroke;
const COLOR_FILTER = COMPONENT_COLORS.filter_array.stroke;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Tek bir bileşenin SVG parçasını üretir (origin: bileşenin position'ı). */
function componentSvg(c: ChipComponent): string {
  const p: any = c.params;
  const t = c.type;
  const transform = `translate(${c.position.x} ${c.position.y}) rotate(${c.rotation})`;

  let body = '';
  switch (t) {
    case 'straight_channel': {
      // Lokal: (0, -w/2) → (length, +w/2)
      body = `<rect x="0" y="${-p.width / 2}" width="${p.length}" height="${p.width}"
              fill="${COLOR_CHANNEL}" fill-opacity="0.85" stroke="${COLOR_CHANNEL_DRK}" stroke-width="10" />`;
      break;
    }
    case 'curved_channel': {
      const r = p.radius;
      const ang = (p.angle * Math.PI) / 180;
      const ex = r * Math.sin(ang);
      const ey = r * (1 - Math.cos(ang));
      const halfW = p.width / 2;
      // Dış ve iç yaylar arasındaki şerit — path
      const rOut = r + halfW;
      const rIn = r - halfW;
      const ex1 = rOut * Math.sin(ang),
        ey1 = rOut * (1 - Math.cos(ang));
      const ex2 = rIn * Math.sin(ang),
        ey2 = rIn * (1 - Math.cos(ang));
      const largeArc = p.angle > 180 ? 1 : 0;
      body = `<path d="M 0 ${-halfW}
                      A ${rOut} ${rOut} 0 ${largeArc} 1 ${ex1} ${ey1 - halfW}
                      L ${ex2} ${ey2 + halfW}
                      A ${rIn} ${rIn} 0 ${largeArc} 0 0 ${halfW} Z"
                fill="${COLOR_CHANNEL}" fill-opacity="0.85"
                stroke="${COLOR_CHANNEL_DRK}" stroke-width="10" />
              <!-- endpoint markers: (${ex.toFixed(1)}, ${ey.toFixed(1)}) -->`;
      break;
    }
    case 't_junction': {
      const mw = p.mainWidth;
      const bw = p.branchWidth;
      const armLen = mw * 5;
      body = `<rect x="${-armLen}" y="${-mw / 2}" width="${armLen * 2}" height="${mw}"
              fill="${COLOR_JUNCTION}" fill-opacity="0.85" stroke="#8a4500" stroke-width="10" />
              <rect x="${-bw / 2}" y="${-bw * 4}" width="${bw}" height="${bw * 4}"
              fill="${COLOR_JUNCTION}" fill-opacity="0.85" stroke="#8a4500" stroke-width="10" />`;
      break;
    }
    case 'y_junction': {
      const mw = p.mainWidth;
      const armLen = mw * 5;
      body = `<polygon points="${-armLen},${mw / 2} ${armLen},${mw / 2} 0,${armLen + mw / 2}"
              fill="${COLOR_JUNCTION}" fill-opacity="0.85" stroke="#8a4500" stroke-width="10" />`;
      break;
    }
    case 'serpentine_mixer': {
      const cw = p.channelWidth;
      const pitch = p.pitch;
      const turns = p.turns;
      const totalW = pitch * (turns + 1);
      body = `<rect x="0" y="${-pitch}" width="${totalW}" height="${pitch * 2}"
              fill="${COLOR_CHANNEL}" fill-opacity="0.35" stroke="${COLOR_CHANNEL_DRK}" stroke-width="6" stroke-dasharray="40 20" />
              <text x="${totalW / 2}" y="0" font-family="monospace" font-size="${cw * 2}" text-anchor="middle"
              fill="${COLOR_CHANNEL_DRK}">serpentine ×${turns}</text>`;
      break;
    }
    case 'expansion': {
      const il = p.inletWidth,
        ol = p.outletWidth,
        L = p.length;
      body = `<polygon points="0,${-il / 2} ${L},${-ol / 2} ${L},${ol / 2} 0,${il / 2}"
              fill="${COLOR_CHANNEL}" fill-opacity="0.85" stroke="${COLOR_CHANNEL_DRK}" stroke-width="10" />`;
      break;
    }
    case 'droplet_generator': {
      const w = p.mainChannelWidth;
      body = `<rect x="0" y="${-w / 2}" width="${w * 4}" height="${w}"
              fill="${COLOR_JUNCTION}" fill-opacity="0.85" stroke="#8a4500" stroke-width="10" />
              <rect x="${w * 2 - w * 0.35}" y="${-w * 1.5}" width="${w * 0.7}" height="${w * 1.5}"
              fill="${COLOR_JUNCTION}" fill-opacity="0.85" stroke="#8a4500" stroke-width="10" />`;
      break;
    }
    case 'filter_array': {
      const cols = p.columns,
        rows = p.rows,
        sp = p.spacing,
        d = p.pillarDiameter;
      let circles = '';
      for (let r = 0; r < rows; r++) {
        for (let cc = 0; cc < cols; cc++) {
          circles += `<circle cx="${cc * sp + sp / 2}" cy="${r * sp + sp / 2}" r="${d / 2}"
                      fill="${COLOR_FILTER}" />`;
        }
      }
      body = `<rect x="0" y="0" width="${cols * sp}" height="${rows * sp}"
              fill="none" stroke="${COLOR_FILTER}" stroke-width="10" stroke-dasharray="30 20" />${circles}`;
      break;
    }
    case 'reservoir': {
      body = `<rect x="0" y="0" width="${p.width}" height="${p.height}"
              fill="${COLOR_RESERVOIR}" fill-opacity="0.6" stroke="#4a1259" stroke-width="12" rx="${Math.min(p.width, p.height) * 0.1}" />`;
      break;
    }
    case 'port': {
      const d = p.diameter;
      body = `<circle cx="0" cy="0" r="${d / 2}" fill="${COLOR_PORT}" fill-opacity="0.85" stroke="#1b5e20" stroke-width="10" />`;
      break;
    }
    default:
      body = `<rect x="0" y="0" width="500" height="500" fill="#888" opacity="0.3" />`;
  }

  const label = c.label ? `<title>${escapeXml(c.label)}</title>` : '';
  return `<g data-id="${escapeXml(c.id)}" data-type="${t}" transform="${transform}">${label}${body}</g>`;
}

function chooseScaleLengthUm(targetUm: number): { value: number; label: string } {
  const steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
  let chosen = steps[0];
  for (const s of steps) if (s <= targetUm) chosen = s;
  const label = chosen >= 1000 ? `${chosen / 1000} mm` : `${chosen} μm`;
  return { value: chosen, label };
}

function scaleBarSvg(
  bbox: { minX: number; minY: number; maxX: number; maxY: number },
  darkBg: boolean,
): string {
  const designWidthUm = bbox.maxX - bbox.minX;
  const target = designWidthUm * 0.2;
  const { value, label } = chooseScaleLengthUm(target);

  const margin = Math.max(100, designWidthUm * 0.02);
  const rightX = bbox.maxX - margin;
  const leftX = rightX - value;
  const y = bbox.maxY - margin;
  const tick = Math.max(60, designWidthUm * 0.01);
  const sw = Math.max(20, designWidthUm * 0.002);
  const fontSz = Math.max(180, designWidthUm * 0.025);
  const color = darkBg ? '#e6edf3' : '#0d1117';

  return `<g data-role="scalebar" fill="none" stroke="${color}" stroke-width="${sw}">
      <line x1="${leftX}" y1="${y}" x2="${rightX}" y2="${y}" />
      <line x1="${leftX}" y1="${y - tick}" x2="${leftX}" y2="${y + tick}" />
      <line x1="${rightX}" y1="${y - tick}" x2="${rightX}" y2="${y + tick}" />
      <text x="${(leftX + rightX) / 2}" y="${y - tick - fontSz * 0.4}"
            text-anchor="middle" font-family="monospace" font-size="${fontSz}"
            fill="${color}" stroke="none">${escapeXml(label)}</text>
    </g>`;
}

/**
 * Tasarımı SVG stringi olarak üret.
 * Koordinatlar μm; viewBox = (minX-pad, minY-pad, width+2pad, height+2pad).
 */
export function exportDesignAsSvg(
  components: ChipComponent[],
  connections: Connection[],
  options: SvgExportOptions,
): string {
  const bbox = computeDesignBBox(components);
  const pad = options.paddingUm;
  const vbX = bbox.minX - pad;
  const vbY = bbox.minY - pad;
  const vbW = bbox.maxX - bbox.minX + pad * 2;
  const vbH = bbox.maxY - bbox.minY + pad * 2;

  // Port konum indeksi — bağlantı uçlarını dünya koordinatlarında çekmek için
  const portIndex = new Map<string, { x: number; y: number }>();
  try {
    for (const p of getAllCanvasPorts(components)) {
      portIndex.set(`${p.compId}:${p.index}`, p.canvasPos);
    }
  } catch {
    /* ignore */
  }

  const bgRect =
    options.background === 'transparent'
      ? ''
      : `<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}"
         fill="${options.background === 'dark' ? '#0d1117' : '#ffffff'}" />`;

  const connectionLines = connections
    .map((conn) => {
      const from = portIndex.get(`${conn.fromComponentId}:${conn.fromPortIndex}`);
      const to = portIndex.get(`${conn.toComponentId}:${conn.toPortIndex}`);
      if (!from || !to) return '';
      return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"
                stroke="${COLOR_CHANNEL}" stroke-width="40" stroke-linecap="round" opacity="0.9" />`;
    })
    .join('\n  ');

  const componentGroups = components.map(componentSvg).join('\n  ');

  const scaleBar = options.includeScaleBar
    ? scaleBarSvg(
        { minX: vbX, minY: vbY, maxX: vbX + vbW, maxY: vbY + vbH },
        options.background === 'dark',
      )
    : '';

  // μm birimini koru: width/height attribute'larını vermek bazı viewer'larda
  // ölçeklendirme için yardımcı olur; gerçek birim viewBox tarafından belirlenir.
  const widthMm = (vbW / 1000).toFixed(3);
  const heightMm = (vbH / 1000).toFixed(3);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="${vbX} ${vbY} ${vbW} ${vbH}"
     width="${widthMm}mm" height="${heightMm}mm"
     data-generator="MicroFlow Studio"
     data-unit="um">
  <title>MicroFlow Studio — Chip Design</title>
  ${bgRect}
  <g data-role="connections">
    ${connectionLines}
  </g>
  <g data-role="components">
    ${componentGroups}
  </g>
  ${scaleBar}
</svg>
`;
}
