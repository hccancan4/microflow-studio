/**
 * exportRenderer.tsx — Tasarımı gizli bir offscreen Konva Stage'ine render edip
 * `toDataURL()` ile PNG base64 üretir.
 *
 * Canvas'taki AKTİF Stage'i bozmamak için ayrı bir Stage hiding görünmez bir
 * `<div>` içinde monte edilir. Tasarımın bounding-box'ı hesaplanır, stage
 * o aralığa 1:1 mm-cinsinden hizalanır, sonra pixelRatio ile istenen DPI'a
 * ölçeklenir.
 *
 * Scale bar ve başlık overlay'i de bu stage içinde çizilir; onlar ekrandaki
 * canvas'ta YOK — yalnızca ihracat çıktısında görünür.
 */
import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Stage, Layer, Rect, Line, Text, Group } from 'react-konva';
import Konva from 'konva';

import { ComponentShape } from '../../components/Canvas/shapes/ComponentShapes';
import { getAllCanvasPorts } from '../../utils/portUtils';
import type { ChipComponent, Connection } from '../../types';
import { TOKENS } from '../../theme/tokens';

// ─────────────────────────────────────────────────────────────────────────────
// Tasarım bounding-box hesaplayıcı
// ─────────────────────────────────────────────────────────────────────────────

export interface DesignBBox {
  minX: number; minY: number;
  maxX: number; maxY: number;
}

/**
 * Tasarımın dünya-koordinatlarındaki (μm) bounding box'ını hesaplar.
 * Bileşen bbox'ları rotation sonrası AABB olarak alınır; portlar da dahil edilir.
 */
export function computeDesignBBox(components: ChipComponent[]): DesignBBox {
  if (components.length === 0) {
    return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  }
  let minX =  Infinity, minY =  Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  const consider = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const c of components) {
    const p: any = c.params;
    // Bileşen tipine göre lokal genişlik / yükseklik (kabaca)
    let w = 500, h = 500;
    switch (c.type) {
      case 'straight_channel':  w = p.length;                              h = p.width; break;
      case 'curved_channel':    w = p.radius * 2;                          h = p.radius * 2; break;
      case 'serpentine_mixer':  w = p.pitch * (p.turns + 1);               h = p.pitch * 2; break;
      case 'expansion':         w = p.length;                              h = Math.max(p.inletWidth, p.outletWidth); break;
      case 't_junction':
      case 'y_junction':        w = p.mainWidth * 3;                       h = p.mainWidth * 3; break;
      case 'droplet_generator': w = p.mainChannelWidth * 4;                h = p.mainChannelWidth * 3; break;
      case 'filter_array':      w = p.columns * p.spacing;                 h = p.rows * p.spacing; break;
      case 'reservoir':         w = p.width;                               h = p.height; break;
      case 'port':              w = p.diameter;                            h = p.diameter; break;
    }

    // Rotation sonrası AABB — dört köşeyi dön, min/max al.
    const rad = (c.rotation * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    // Lokal çizim köşeleri: çoğu bileşen origin'i sol uçta; güvenlik için geniş AABB kullan
    const corners = [
      { x: 0,     y: -h / 2 },
      { x: w,     y: -h / 2 },
      { x: w,     y:  h / 2 },
      { x: 0,     y:  h / 2 },
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
  } catch { /* port util çağrısı başarısızsa bileşen bbox'ı yeterli */ }

  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 1000; maxY = 1000; }
  return { minX, minY, maxX, maxY };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scale bar yardımcısı — ihracat çıktısına sağ-alt köşede mm/μm çizgisi ekler.
// ─────────────────────────────────────────────────────────────────────────────

/** Hedef pixel genişliğine en yakın "güzel" bir scale length (μm) döner: 1-2-5-10-20-50-100-... */
function chooseScaleLengthUm(targetUm: number): { value: number; label: string } {
  const steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
  let chosen = steps[0];
  for (const s of steps) if (s <= targetUm) chosen = s;
  const label = chosen >= 1000 ? `${chosen / 1000} mm` : `${chosen} μm`;
  return { value: chosen, label };
}

interface ScaleBarProps {
  bbox: DesignBBox;
  /** Bileşen/renk paleti koyu mu açık mı temada? */
  darkBg: boolean;
}

const ScaleBar: React.FC<ScaleBarProps> = ({ bbox, darkBg }) => {
  const designWidthUm = bbox.maxX - bbox.minX;
  // Hedef: scale bar tasarım genişliğinin ~%20'si kadar olsun
  const target = designWidthUm * 0.2;
  const { value, label } = chooseScaleLengthUm(target);

  const margin = Math.max(100, designWidthUm * 0.02);
  const rightX  = bbox.maxX - margin;
  const leftX   = rightX - value;
  const y       = bbox.maxY - margin;
  const tick    = Math.max(60, designWidthUm * 0.01);
  const sw      = Math.max(20, designWidthUm * 0.002);
  const fontSz  = Math.max(180, designWidthUm * 0.025);
  const color   = darkBg ? '#e6edf3' : '#0d1117';

  return (
    <Group listening={false}>
      <Line points={[leftX, y, rightX, y]}       stroke={color} strokeWidth={sw} />
      <Line points={[leftX, y - tick, leftX, y + tick]}   stroke={color} strokeWidth={sw} />
      <Line points={[rightX, y - tick, rightX, y + tick]} stroke={color} strokeWidth={sw} />
      <Text
        x={leftX}
        y={y - tick - fontSz * 1.1}
        width={value}
        align="center"
        text={label}
        fontSize={fontSz}
        fill={color}
        fontFamily="monospace"
      />
    </Group>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Offscreen Stage — bileşen + bağlantı + scale bar çizer, toDataURL çağırır.
// ─────────────────────────────────────────────────────────────────────────────

export interface ExportJob {
  components: ChipComponent[];
  connections: Connection[];
  options: {
    dpi: number;                         // 96 / 150 / 300 / 600
    background: 'white' | 'dark' | 'transparent';
    includeScaleBar: boolean;
    paddingUm: number;                   // bounding box'a eklenecek kenar payı
  };
  resolve: (dataUrl: string) => void;
  reject: (err: Error) => void;
}

interface ExportRendererProps {
  job: ExportJob;
}

/**
 * Gizli (off-screen) bir Konva Stage monte eder, bir tick sonra `toDataURL()`
 * ile PNG base64 üretir ve `job.resolve` ile geri döner.
 */
const ExportRenderer: React.FC<ExportRendererProps> = ({ job }) => {
  const stageRef = useRef<Konva.Stage | null>(null);
  const { components, connections, options } = job;

  const bbox = useMemo(() => computeDesignBBox(components), [components]);
  const pad = options.paddingUm;
  const wUm = (bbox.maxX - bbox.minX) + pad * 2;
  const hUm = (bbox.maxY - bbox.minY) + pad * 2;

  // 1 μm = 1 Konva birim. pixelRatio toDataURL'de DPI'yi uygular.
  // 96 DPI = 1 Konva birim ≈ 1 piksel (varsayılan). 300 DPI için 300/96 ≈ 3.125× çarpan.
  const stageW = wUm;
  const stageH = hUm;
  const basePxPerUm = 0.1; // 10 μm = 1 piksel — default ekran benzeri
  const pixelRatio = (options.dpi / 96) * basePxPerUm;

  // Tüm bağlantı çizgileri — bağlantı uçları port konumlarından hesaplanır
  const portIndex = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    try {
      const ports = getAllCanvasPorts(components);
      for (const p of ports) {
        m.set(`${p.compId}:${p.index}`, p.canvasPos);
      }
    } catch { /* ignore */ }
    return m;
  }, [components]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) { job.reject(new Error('Stage ref yok')); return; }
    // Bir frame bekle — alt layer'ların çizilmesi garanti olsun
    const raf = requestAnimationFrame(() => {
      try {
        stage.draw();
        const dataUrl = stage.toDataURL({
          mimeType: 'image/png',
          pixelRatio,
        });
        job.resolve(dataUrl);
      } catch (e: any) {
        job.reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [pixelRatio, job]);

  const bgColor =
    options.background === 'dark'        ? '#0d1117'
    : options.background === 'white'     ? '#ffffff'
    :                                      undefined; // transparent

  // Gizli portal — görünüm akışına girmesin
  return createPortal(
    <div style={{
      position: 'absolute', left: -99999, top: -99999,
      width: 1, height: 1, overflow: 'hidden', pointerEvents: 'none',
    }}>
      <Stage
        ref={stageRef as any}
        width={stageW}
        height={stageH}
        // Dünya koordinatlarındaki bbox'ı stage (0,0) ile hizala: translate(-minX+pad, -minY+pad)
        x={-bbox.minX + pad}
        y={-bbox.minY + pad}
        scaleX={1}
        scaleY={1}
      >
        <Layer listening={false}>
          {bgColor && (
            <Rect
              x={bbox.minX - pad}
              y={bbox.minY - pad}
              width={wUm}
              height={hUm}
              fill={bgColor}
            />
          )}

          {/* Bağlantılar (bileşenlerin altında) */}
          {connections.map((conn) => {
            const from = portIndex.get(`${conn.fromComponentId}:${conn.fromPortIndex}`);
            const to   = portIndex.get(`${conn.toComponentId}:${conn.toPortIndex}`);
            if (!from || !to) return null;
            return (
              <Line
                key={conn.id}
                points={[from.x, from.y, to.x, to.y]}
                stroke={TOKENS.dyeBright}
                strokeWidth={40}
                lineCap="round"
              />
            );
          })}

          {/* Bileşenler */}
          {components.map((comp) => (
            <ComponentShape
              key={comp.id}
              comp={comp}
              selected={false}
              zoom={1}
              onClick={() => {}}
              onDblClick={() => {}}
              onContextMenu={() => {}}
              onDragStart={() => {}}
              onDragMove={() => {}}
              onDragEnd={() => {}}
            />
          ))}

          {/* Scale bar */}
          {options.includeScaleBar && (
            <ScaleBar
              bbox={{
                minX: bbox.minX - pad, minY: bbox.minY - pad,
                maxX: bbox.maxX + pad, maxY: bbox.maxY + pad,
              }}
              darkBg={options.background === 'dark'}
            />
          )}
        </Layer>
      </Stage>
    </div>,
    document.body,
  );
};

export default ExportRenderer;
