/**
 * canvasGrid — adaptif arka plan grid'inin Konva çizgilerini üretir.
 *
 * Minor çizgiler yakınlaştıkça belirginleşir, çok sıkışınca (zoom-out) gizlenir
 * (fade-out). Major çizgiler (her 5 hücre) her zaman görünür ve daha belirgin.
 * Ek olarak origin (0,0) için ince çapraz referans işareti (CAD geleneği).
 *
 * Saf fonksiyon — CanvasEditor `renderGrid` useCallback'i bunu sarar (memo aynı).
 */
import React from 'react';
import { Line } from 'react-konva';
import { RULER_SIZE } from './Ruler';
import { TOKENS } from '../../theme/tokens';
import type { CanvasState } from '../../types';

const MAJOR_EVERY = 5; // her 5 hücrede bir kalın çizgi

export function buildGridLines(canvas: CanvasState, width: number, height: number): React.ReactNode[] {
  const els: React.ReactNode[] = [];
  const { gridSize, zoom: z, panX, panY } = canvas;

  const startX = Math.floor(-panX / z / gridSize) * gridSize - gridSize;
  const startY = Math.floor(-panY / z / gridSize) * gridSize - gridSize;
  const endX   = startX + (width  - RULER_SIZE) / z + gridSize * 2;
  const endY   = startY + (height - RULER_SIZE) / z + gridSize * 2;

  const minorSpacingPx = gridSize * z;         // minor çizgiler arası ekran-px
  const showMinor = minorSpacingPx >= 7;       // çok sıkıysa minor'ı gizle (fade-out)
  const minorOpacity = Math.min(0.45, Math.max(0, (minorSpacingPx - 7) / 36));
  const swMinor = 0.5 / z;
  const swMajor = 0.9 / z;

  const isMajor = (v: number) => (((Math.round(v / gridSize) % MAJOR_EVERY) + MAJOR_EVERY) % MAJOR_EVERY) === 0;

  for (let x = startX; x <= endX; x += gridSize) {
    const major = isMajor(x);
    if (!major && !showMinor) continue;
    els.push(<Line key={`v${x}`} points={[x, startY, x, endY]}
      stroke={major ? TOKENS.borderStrong : TOKENS.border}
      strokeWidth={major ? swMajor : swMinor}
      opacity={major ? 0.7 : minorOpacity} listening={false} />);
  }
  for (let y = startY; y <= endY; y += gridSize) {
    const major = isMajor(y);
    if (!major && !showMinor) continue;
    els.push(<Line key={`h${y}`} points={[startX, y, endX, y]}
      stroke={major ? TOKENS.borderStrong : TOKENS.border}
      strokeWidth={major ? swMajor : swMinor}
      opacity={major ? 0.7 : minorOpacity} listening={false} />);
  }

  // Origin (0,0) referans işareti — ince çapraz (CAD geleneği)
  if (startX <= 0 && endX >= 0 && startY <= 0 && endY >= 0) {
    const o = gridSize * 0.6;
    const swO = 0.9 / z;
    els.push(
      <Line key="ox" points={[-o, 0, o, 0]} stroke={TOKENS.dyeDim} strokeWidth={swO} opacity={0.55} listening={false} />,
      <Line key="oy" points={[0, -o, 0, o]} stroke={TOKENS.dyeDim} strokeWidth={swO} opacity={0.55} listening={false} />,
    );
  }
  return els;
}
