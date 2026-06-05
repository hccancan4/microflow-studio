/**
 * CfdOverlay.tsx — CFD saha (velocityMagnitude / pressure / wallShear)
 *                  renk haritası overlay katmanı (Faz 4B).
 *
 * CFD sonucu (CfdField) bir hedef bileşenin bounding-box'ı üzerine
 * offscreen canvas ImageData olarak render edilir, sonra Konva.Image
 * olarak canvas'a yerleştirilir. Bileşen rotation'ı ve konumu hesaba katılır.
 *
 * Kullanıcı ResultsPanel'den colormap + field type + visible flag'lerini kontrol eder.
 */
import React, { useMemo } from 'react';
import { Image as KonvaImage, Rect } from 'react-konva';
import type { CfdField, ChipComponent, ColormapType } from '../../types';
import { fieldToImageData } from '../../utils/colormaps';
import { TOKENS } from '../../theme/tokens';

interface CfdOverlayProps {
  field: CfdField;
  target: ChipComponent | null;
  fieldType: 'magnitude' | 'pressure' | 'wallShear';
  colormap: ColormapType;
  opacity?: number;
}

/**
 * Bileşen tipi → (bbox boyutu + lokal anchor offset).
 * `anchor` — bileşenin çizim origin'inden (ComponentShapes'teki lokal (0,0))
 *            bbox MERKEZİNE olan vektör. Konva Group'u `position` noktasında olduğundan
 *            overlay'in dünya merkezi = position + Rot(rotation) · anchor.
 *
 * Not: ComponentShapes'te straight_channel (0, -w/2) noktasından (length, +w/2)'ye
 * çizildiği için anchor = (length/2, 0). Diğer "inlet'ten çizilen" bileşenler benzer.
 */
function getComponentBbox(comp: ChipComponent): {
  w: number;
  h: number;
  anchor: { x: number; y: number };
} {
  const p: any = comp.params;
  switch (comp.type) {
    case 'straight_channel':
      return { w: p.length, h: p.width, anchor: { x: p.length / 2, y: 0 } };
    case 'curved_channel':
      return { w: p.radius * 2, h: p.radius * 2, anchor: { x: p.radius, y: -p.radius } };
    case 'serpentine_mixer':
      return {
        w: p.pitch * (p.turns + 1),
        h: p.pitch,
        anchor: { x: (p.pitch * (p.turns + 1)) / 2, y: 0 },
      };
    case 'expansion':
      return {
        w: p.length,
        h: Math.max(p.inletWidth, p.outletWidth),
        anchor: { x: p.length / 2, y: 0 },
      };
    case 't_junction':
      return { w: p.mainWidth * 3, h: p.mainWidth * 2.5, anchor: { x: 0, y: 0 } };
    case 'y_junction':
      return { w: p.mainWidth * 3, h: p.mainWidth * 2.5, anchor: { x: 0, y: 0 } };
    case 'droplet_generator':
      return { w: p.mainChannelWidth * 4, h: p.mainChannelWidth * 3, anchor: { x: 0, y: 0 } };
    case 'filter_array':
      return {
        w: p.columns * p.spacing,
        h: p.rows * p.spacing,
        anchor: { x: (p.columns * p.spacing) / 2, y: 0 },
      };
    case 'reservoir':
      return { w: p.width, h: p.height, anchor: { x: 0, y: 0 } };
    case 'port':
      return { w: p.diameter, h: p.diameter, anchor: { x: 0, y: 0 } };
    default:
      return { w: 1000, h: 200, anchor: { x: 500, y: 0 } };
  }
}

const CfdOverlay: React.FC<CfdOverlayProps> = ({
  field,
  target,
  fieldType,
  colormap,
  opacity = 0.75,
}) => {
  // İlgili saha dizisini seç + min/max hesapla
  const { values, min, max, unit, label } = useMemo(() => {
    const src =
      fieldType === 'magnitude'
        ? field.magnitude
        : fieldType === 'pressure'
          ? field.pressure
          : field.wallShear;
    let mn = Infinity,
      mx = -Infinity;
    for (let i = 0; i < src.length; i++) {
      const v = src[i];
      if (Number.isFinite(v)) {
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    }
    if (!Number.isFinite(mn) || !Number.isFinite(mx)) {
      mn = 0;
      mx = 1;
    }
    if (mx - mn < 1e-12) mx = mn + 1e-12;
    return {
      values: src,
      min: mn,
      max: mx,
      unit: fieldType === 'pressure' ? 'Pa' : fieldType === 'wallShear' ? 'Pa' : 'm/s',
      label:
        fieldType === 'pressure' ? 'Basınç' : fieldType === 'wallShear' ? 'Duvar kesme' : '|v|',
    };
  }, [field, fieldType]);

  // Offscreen canvas → renk haritalı bitmap
  const imageEl = useMemo<HTMLCanvasElement | null>(() => {
    if (!field.width || !field.height) return null;
    const rgba = fieldToImageData(values, field.width, field.height, min, max, colormap, {
      flipY: true, // dünya koordinatında y aşağı artar; görüntüde de aynı şekilde
      alpha: Math.round(opacity * 255),
    });
    const cv = document.createElement('canvas');
    cv.width = field.width;
    cv.height = field.height;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    const imgData = new ImageData(rgba, field.width, field.height);
    ctx.putImageData(imgData, 0, 0);
    return cv;
  }, [values, field.width, field.height, min, max, colormap, opacity]);

  if (!imageEl || !target) return null;

  const bbox = getComponentBbox(target);
  // Dünya merkezi = position + Rot(rotation) · anchor
  // anchor, bileşenin lokal origin noktasından bbox merkezine olan vektör.
  const rad = (target.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = target.position.x + bbox.anchor.x * cos - bbox.anchor.y * sin;
  const cy = target.position.y + bbox.anchor.x * sin + bbox.anchor.y * cos;

  return (
    <>
      <KonvaImage
        image={imageEl}
        x={cx}
        y={cy}
        width={bbox.w}
        height={bbox.h}
        offsetX={bbox.w / 2}
        offsetY={bbox.h / 2}
        rotation={target.rotation}
        listening={false}
      />
      {/* Görsel kenarlık (render alanını göstermek için) */}
      <Rect
        x={cx}
        y={cy}
        width={bbox.w}
        height={bbox.h}
        offsetX={bbox.w / 2}
        offsetY={bbox.h / 2}
        rotation={target.rotation}
        stroke={TOKENS.active}
        strokeWidth={20}
        dash={[60, 40]}
        listening={false}
        opacity={0.6}
      />
    </>
  );
};

// Hafif memoizasyon: field veya target değişmediyse yeniden renderlama
export default React.memo(
  CfdOverlay,
  (prev, next) =>
    prev.field === next.field &&
    prev.target === next.target &&
    prev.fieldType === next.fieldType &&
    prev.colormap === next.colormap &&
    prev.opacity === next.opacity,
);

/** Overlay konumunu hesaplama yardımcısı — CanvasEditor dışında da kullanışlı */
export { getComponentBbox };
