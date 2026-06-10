/**
 * Ruler.tsx
 * Üst ve sol cetvel — μm biriminde pan/zoom'a göre dinamik.
 * HTML Canvas kullanıyor (Konva dışında, performans için).
 */
import React, { useRef, useEffect } from 'react';
import { TOKENS } from '../../theme/tokens';

const RULER_SIZE = 24; // px — cetvel kalınlığı
const BG_COLOR = TOKENS.panel;
const TICK_COLOR = TOKENS.borderStrong;
const TEXT_COLOR = TOKENS.textDim;
const CURSOR_COLOR = TOKENS.dye;

interface RulerProps {
  orientation: 'horizontal' | 'vertical';
  length: number; // px — canvas genişliği veya yüksekliği
  zoom: number;
  pan: number; // px — panX veya panY
  mousePos: number; // px — fare konumu (x veya y)
}

const Ruler: React.FC<RulerProps> = ({ orientation, length, zoom, pan, mousePos }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isHorizontal = orientation === 'horizontal';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas boyutunu ayarla
    if (isHorizontal) {
      canvas.width = length;
      canvas.height = RULER_SIZE;
    } else {
      canvas.width = RULER_SIZE;
      canvas.height = length;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Cetvel çizgisi
    ctx.strokeStyle = TICK_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (isHorizontal) {
      ctx.moveTo(0, RULER_SIZE - 1);
      ctx.lineTo(length, RULER_SIZE - 1);
    } else {
      ctx.moveTo(RULER_SIZE - 1, 0);
      ctx.lineTo(RULER_SIZE - 1, length);
    }
    ctx.stroke();

    // Uygun tick aralığını belirle (μm cinsinden)
    // Minimum 50px görünür aralık
    const minPxInterval = 50;
    const umPerPx = 1 / zoom; // 1 piksel kaç μm
    const minUmInterval = minPxInterval * umPerPx;

    // Güzel sayılar: 50, 100, 200, 500, 1000, 2000, 5000 μm ...
    const niceValues = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
    const tickUm = niceValues.find((v) => v >= minUmInterval) ?? 50000;
    const subTickUm = tickUm / 5;

    // Görünür aralık (μm)
    const startUm = Math.floor(-pan / zoom / tickUm) * tickUm - tickUm;
    const endUm = startUm + length / zoom + tickUm * 2;

    ctx.font = `9px "IBM Plex Mono", monospace`;
    ctx.fillStyle = TEXT_COLOR;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    for (let um = startUm; um <= endUm; um += subTickUm) {
      const px = pan + um * zoom;
      if (px < 0 || px > length) continue;

      const isMajor = Math.abs(um % tickUm) < 0.01;
      const tickLen = isMajor ? RULER_SIZE * 0.55 : RULER_SIZE * 0.25;

      ctx.strokeStyle = isMajor ? TICK_COLOR : `${TICK_COLOR}80`;
      ctx.lineWidth = isMajor ? 1 : 0.5;
      ctx.beginPath();

      if (isHorizontal) {
        ctx.moveTo(px, RULER_SIZE - tickLen);
        ctx.lineTo(px, RULER_SIZE);
        if (isMajor) {
          ctx.fillText(formatUm(um), px + 2, 2);
        }
      } else {
        ctx.moveTo(RULER_SIZE - tickLen, px);
        ctx.lineTo(RULER_SIZE, px);
        if (isMajor) {
          ctx.save();
          ctx.translate(12, px - 2);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(formatUm(um), 0, 0);
          ctx.restore();
        }
      }
      ctx.stroke();
    }

    // Fare göstergesi
    if (mousePos >= 0 && mousePos <= length) {
      ctx.strokeStyle = CURSOR_COLOR;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      if (isHorizontal) {
        ctx.moveTo(mousePos, 0);
        ctx.lineTo(mousePos, RULER_SIZE);
      } else {
        ctx.moveTo(0, mousePos);
        ctx.lineTo(RULER_SIZE, mousePos);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [length, zoom, pan, mousePos, isHorizontal]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        imageRendering: 'pixelated',
        flexShrink: 0,
      }}
    />
  );
};

function formatUm(um: number): string {
  if (Math.abs(um) >= 1000) return `${um / 1000}mm`;
  return `${um}μm`;
}

export { RULER_SIZE };
export default Ruler;
