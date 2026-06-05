/**
 * ComponentShapes.tsx
 * Her mikroakışkan bileşen tipi için Konva şekilleri.
 * Tüm ölçüler μm cinsinden — Konva'ya doğrudan geçiliyor.
 */
import React from 'react';
import { Rect, Arc, Path, Circle, Group, Line, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { ChipComponent } from '../../../types';
import { COMPONENT_COLORS, PORT_COLORS, SELECTED_COLOR } from '../../../theme/componentColors';
import { TOKENS } from '../../../theme/tokens';
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
} from '../../../types';

// ─── Renk şeması — TEK KAYNAK: theme/componentColors.ts ─────────────────────
// (Konva literal hex gerektirir; CSS var okuyamaz. Canvas ↔ tablo ↔ grafik
//  ↔ sidebar renk tutarlılığı bu modülden gelir.)
const COLORS = {
  channel: COMPONENT_COLORS.straight_channel,
  expansion: COMPONENT_COLORS.expansion,
  junction: COMPONENT_COLORS.t_junction,
  mixer: COMPONENT_COLORS.serpentine_mixer,
  port_inlet: PORT_COLORS.inlet,
  port_outlet: PORT_COLORS.outlet,
  droplet: COMPONENT_COLORS.droplet_generator,
  filter: COMPONENT_COLORS.filter_array,
  reservoir: COMPONENT_COLORS.reservoir,
  selected: { stroke: SELECTED_COLOR, fill: 'rgba(79, 195, 247, 0.15)' },
};

interface ShapeProps {
  comp: ChipComponent;
  selected: boolean;
  zoom: number;
  // Handler'lar id parametresi alır → CanvasEditor stable useCallback'leri
  // doğrudan geçebilir (inline arrow yok) → React.memo etkili olur.
  onClick: (e: KonvaEventObject<MouseEvent>, id: string) => void;
  onDblClick: (e: KonvaEventObject<MouseEvent>, id: string) => void;
  onContextMenu: (e: KonvaEventObject<PointerEvent>, id: string) => void;
  // sürükleme için
  onDragStart: (e: KonvaEventObject<DragEvent>, id: string) => void;
  onDragMove: (e: KonvaEventObject<DragEvent>, id: string) => void;
  onDragEnd: (e: KonvaEventObject<DragEvent>, id: string) => void;
}

const ComponentShapeBase: React.FC<ShapeProps> = ({
  comp,
  selected,
  zoom,
  onClick,
  onDblClick,
  onContextMenu,
  onDragStart,
  onDragMove,
  onDragEnd,
}) => {
  const sw = Math.max(0.8, 1.5 / zoom); // stroke width — zoom'a göre sabit görünüm
  // Hover state — local React state (her bileşenin kendi durumu)
  const [hovered, setHovered] = React.useState(false);

  // Zoom-stable selection: çok düşük zoomda gölge kaybolmaz, ekstra outline ekle
  // Hover: subtle mavi glow (selection'dan daha hafif).
  const glow = selected
    ? { shadowColor: SELECTED_COLOR, shadowBlur: Math.max(8, 12 / zoom), shadowOpacity: 0.55 }
    : hovered
      ? { shadowColor: SELECTED_COLOR, shadowBlur: Math.max(4, 6 / zoom), shadowOpacity: 0.35 }
      : {};

  // Hover cursor + state — Stage container'a doğrudan yaz (panMode-aware refresh için
  // CanvasEditor refreshCursor'ünü container'a attach etmiş)
  const handleEnter = (e: KonvaEventObject<MouseEvent>) => {
    setHovered(true);
    const c = e.target.getStage()?.container();
    if (c) c.style.cursor = 'move';
  };
  const handleLeave = (e: KonvaEventObject<MouseEvent>) => {
    setHovered(false);
    const c = e.target.getStage()?.container() as
      | (HTMLDivElement & { __refreshCursor?: () => void })
      | undefined;
    if (!c) return;
    if (typeof c.__refreshCursor === 'function') c.__refreshCursor();
    else c.style.cursor = 'default';
  };

  const inner = (() => {
    switch (comp.type) {
      case 'straight_channel':
        return <StraightChannel comp={comp} sw={sw} selected={selected} />;
      case 'curved_channel':
        return <CurvedChannel comp={comp} sw={sw} selected={selected} />;
      case 't_junction':
        return <TJunction comp={comp} sw={sw} selected={selected} />;
      case 'y_junction':
        return <YJunction comp={comp} sw={sw} selected={selected} />;
      case 'serpentine_mixer':
        return <SerpentineMixer comp={comp} sw={sw} selected={selected} />;
      case 'port':
        return <PortShape comp={comp} sw={sw} selected={selected} zoom={zoom} />;
      case 'droplet_generator':
        return <DropletGenerator comp={comp} sw={sw} selected={selected} />;
      case 'filter_array':
        return <FilterArray comp={comp} sw={sw} selected={selected} />;
      case 'expansion':
        return <ExpansionShape comp={comp} sw={sw} selected={selected} />;
      case 'reservoir':
        return <ReservoirShape comp={comp} sw={sw} selected={selected} />;
      default:
        return <FallbackShape comp={comp} sw={sw} />;
    }
  })();

  return (
    <Group
      x={comp.position.x}
      y={comp.position.y}
      rotation={comp.rotation}
      draggable
      onClick={(e) => onClick(e, comp.id)}
      onDblClick={(e) => onDblClick(e, comp.id)}
      onContextMenu={(e) => onContextMenu(e, comp.id)}
      onDragStart={(e) => onDragStart(e, comp.id)}
      onDragMove={(e) => onDragMove(e, comp.id)}
      onDragEnd={(e) => onDragEnd(e, comp.id)}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      {...glow}
    >
      {inner}
      {/* Etiket — ekran üzerinde hedef ~13px, dünya boyutunda 14/zoom.
          Zoom çok düşükse (uzaktan görüş) etiket gizlenir (aksi halde okunamaz hale gelir). */}
      {comp.label &&
        zoom > 0.12 &&
        (() => {
          // Hedef ekran piksel boyutu: 13px. Dünya uzayında: 13/zoom.
          // Üst sınır 80μm (çok yakın zoom'da yazı bileşene hakim olmasın).
          const fontPx = Math.min(80, Math.max(6, 13 / zoom));
          // Kaba metin genişliği tahmini (her karakter ≈ 0.55 × fontSize)
          const textWidth = comp.label.length * fontPx * 0.55;
          // Etiket bileşenin 18 screen-px üstüne yerleşsin
          const gap = 18 / zoom;
          return (
            <Text
              text={comp.label}
              fontSize={fontPx}
              fontStyle="600"
              fill={selected ? SELECTED_COLOR : TOKENS.textDim}
              align="center"
              offsetX={textWidth / 2}
              offsetY={fontPx + gap}
              listening={false}
            />
          );
        })()}
    </Group>
  );
};

/**
 * React.memo — prop'lar (comp, selected, zoom, stable handler'lar) değişmedikçe
 * yeniden render etme. Canvas'taki fare hareketi (mousePx state) tüm bileşenleri
 * gereksiz re-render etmesini önler. Handler'lar CanvasEditor'de stable
 * useCallback olduğundan default shallow karşılaştırma yeterli.
 */
export const ComponentShape = React.memo(ComponentShapeBase);

// ─── Şekil tipleri ────────────────────────────────────────────────────────────

interface BaseProps {
  comp: ChipComponent;
  sw: number;
  selected: boolean;
}

const StraightChannel: React.FC<BaseProps> = ({ comp, sw, selected }) => {
  const { width = 200, length = 5000 } = comp.params as StraightChannelParams;
  const c = selected ? COLORS.selected : COLORS.channel;
  return (
    <Rect
      x={0}
      y={-width / 2}
      width={length}
      height={width}
      fill={c.fill}
      stroke={c.stroke}
      strokeWidth={sw}
      cornerRadius={width / 4}
    />
  );
};

/**
 * CurvedChannel — Konva.Arc tabanlı annular sektör.
 *
 * Geometri:
 *   - Arc merkezi: (0, radius) (lokal origin'in altında)
 *   - rotation=-90° → sweep 12 o'clock konumundan başlar (lokal origin'e değer)
 *   - angle° saat yönünde sweep eder; output port (R·sinθ, R(1-cosθ)) konumunda
 *   - innerRadius / outerRadius cross-section ±width/2 sağlar
 *
 * Edge case clamp: angle ∈ [1, 359], radius ≥ width/2 + ε.
 * SVG path manipülasyonu yerine Konva.Arc kullanmak rotation/snap durumunda
 * çok daha kararlı sonuç verir (çoklu port hayaleti gibi sorunları engeller).
 */
const CurvedChannel: React.FC<BaseProps> = ({ comp, sw, selected }) => {
  const { radius = 1000, angle = 90, width = 200 } = comp.params as CurvedChannelParams;
  const c = selected ? COLORS.selected : COLORS.channel;
  const safeAngle = Math.max(1, Math.min(359, Number.isFinite(angle) ? angle : 90));
  const safeRadius = Math.max(width / 2 + 1, Number.isFinite(radius) ? radius : 1000);
  return (
    <Arc
      x={0}
      y={safeRadius}
      innerRadius={Math.max(0, safeRadius - width / 2)}
      outerRadius={safeRadius + width / 2}
      angle={safeAngle}
      rotation={-90}
      fill={c.fill}
      stroke={c.stroke}
      strokeWidth={sw}
    />
  );
};

const TJunction: React.FC<BaseProps> = ({ comp, sw, selected }) => {
  const { mainWidth = 300, branchWidth = 200 } = comp.params as TJunctionParams;
  const arm = mainWidth * 5;
  const branchLen = branchWidth * 4;
  const c = selected ? COLORS.selected : COLORS.junction;

  const pathData = [
    // Ana kanal (yatay)
    `M ${-arm} ${-mainWidth / 2}`,
    `L ${arm} ${-mainWidth / 2}`,
    `L ${arm} ${mainWidth / 2}`,
    // Sağ → dal çatalı
    `L ${branchWidth / 2} ${mainWidth / 2}`,
    `L ${branchWidth / 2} ${-branchLen}`,
    `L ${-branchWidth / 2} ${-branchLen}`,
    `L ${-branchWidth / 2} ${mainWidth / 2}`,
    // Sol geri
    `L ${-arm} ${mainWidth / 2}`,
    'Z',
  ].join(' ');

  return <Path data={pathData} fill={c.fill} stroke={c.stroke} strokeWidth={sw} />;
};

const YJunction: React.FC<BaseProps> = ({ comp, sw, selected }) => {
  const { mainWidth = 300, branchWidth = 200, branchAngle = 45 } = comp.params as YJunctionParams;
  const c = selected ? COLORS.selected : COLORS.junction;
  const rad = (branchAngle * Math.PI) / 180;
  const armLen = mainWidth * 5;

  // Basit 3 dikdörtgen kollu Y şekli
  return (
    <Group>
      {/* Ana kol (aşağı) */}
      <Rect
        x={-mainWidth / 2}
        y={0}
        width={mainWidth}
        height={armLen}
        fill={c.fill}
        stroke={c.stroke}
        strokeWidth={sw}
      />
      {/* Sol kol */}
      <Group rotation={-branchAngle}>
        <Rect
          x={-branchWidth / 2}
          y={-armLen}
          width={branchWidth}
          height={armLen}
          fill={c.fill}
          stroke={c.stroke}
          strokeWidth={sw}
        />
      </Group>
      {/* Sağ kol */}
      <Group rotation={branchAngle}>
        <Rect
          x={-branchWidth / 2}
          y={-armLen}
          width={branchWidth}
          height={armLen}
          fill={c.fill}
          stroke={c.stroke}
          strokeWidth={sw}
        />
      </Group>
      {/* Merkez dolgu */}
      <Circle radius={mainWidth * 0.6} fill={c.fill} stroke={c.stroke} strokeWidth={sw} />
    </Group>
  );
};

const SerpentineMixer: React.FC<BaseProps> = ({ comp, sw, selected }) => {
  const { channelWidth = 200, turns = 5, pitch = 600 } = comp.params as SerpentineMixerParams;
  const c = selected ? COLORS.selected : COLORS.mixer;
  const totalW = pitch * 4;
  const lines: React.ReactNode[] = [];

  // Zigzag çizgileri
  for (let i = 0; i <= turns; i++) {
    const y = i * pitch;
    const isEven = i % 2 === 0;
    // Yatay segment
    lines.push(
      <Line
        key={`h${i}`}
        points={isEven ? [0, y, totalW, y] : [totalW, y, 0, y]}
        stroke={c.stroke}
        strokeWidth={channelWidth}
        lineCap="round"
        opacity={0.4}
      />,
    );
    lines.push(
      <Line
        key={`hb${i}`}
        points={isEven ? [0, y, totalW, y] : [totalW, y, 0, y]}
        stroke={c.stroke}
        strokeWidth={sw * 2}
        lineCap="round"
      />,
    );
    // Dikey bağlantı (son segment hariç)
    if (i < turns) {
      const x = isEven ? totalW : 0;
      lines.push(
        <Line
          key={`v${i}`}
          points={[x, y, x, y + pitch]}
          stroke={c.stroke}
          strokeWidth={channelWidth}
          opacity={0.4}
        />,
        <Line
          key={`vb${i}`}
          points={[x, y, x, y + pitch]}
          stroke={c.stroke}
          strokeWidth={sw * 2}
        />,
      );
    }
  }

  return <Group>{lines}</Group>;
};

interface PortProps extends BaseProps {
  zoom?: number;
}
const PortShape: React.FC<PortProps> = ({ comp, sw, selected }) => {
  const { diameter = 500, portType = 'inlet' } = comp.params as PortParams;
  const r = diameter / 2;
  const c = selected
    ? COLORS.selected
    : portType === 'inlet'
      ? COLORS.port_inlet
      : COLORS.port_outlet;
  const label = portType === 'inlet' ? 'G' : 'Ç';
  // Harf port yarıçapının %45'i — her zaman port içinde kalır, karakter genişliğinin
  // yarısı kadar sola kaydırarak yaklaşık ortaya getirir.
  const fontPx = r * 0.45;

  return (
    <Group>
      <Circle radius={r} fill={c.fill} stroke={c.stroke} strokeWidth={sw} />
      <Circle radius={r * 0.3} fill={c.stroke} opacity={0.55} />
      <Text
        text={label}
        fontSize={fontPx}
        fontStyle="700"
        fill={c.stroke}
        offsetX={fontPx * 0.28}
        offsetY={fontPx * 0.55}
        listening={false}
      />
    </Group>
  );
};

const DropletGenerator: React.FC<BaseProps> = ({ comp, sw, selected }) => {
  const {
    orificeWidth = 100,
    mainChannelWidth = 300,
    dispersedChannelWidth = 200,
  } = comp.params as DropletGeneratorParams;
  const c = selected ? COLORS.selected : COLORS.droplet;
  const armLen = mainChannelWidth * 6;
  const dispLen = dispersedChannelWidth * 6;

  return (
    <Group>
      {/* Ana kanal (yatay) */}
      <Rect
        x={-armLen}
        y={-mainChannelWidth / 2}
        width={armLen * 2}
        height={mainChannelWidth}
        fill={c.fill}
        stroke={c.stroke}
        strokeWidth={sw}
      />
      {/* Dağılmış kanal (dikey) */}
      <Rect
        x={-dispersedChannelWidth / 2}
        y={-dispLen}
        width={dispersedChannelWidth}
        height={dispLen}
        fill={c.fill}
        stroke={c.stroke}
        strokeWidth={sw}
      />
      {/* Orifis çizgisi */}
      <Rect
        x={-orificeWidth / 2}
        y={-mainChannelWidth / 2}
        width={orificeWidth}
        height={mainChannelWidth}
        fill={c.stroke}
        opacity={0.3}
      />
      {/* Damla örneği */}
      <Circle x={armLen * 0.5} y={0} radius={orificeWidth * 1.5} fill={c.stroke} opacity={0.25} />
    </Group>
  );
};

const FilterArray: React.FC<BaseProps> = ({ comp, sw, selected }) => {
  const {
    pillarDiameter = 50,
    spacing = 100,
    rows = 5,
    columns = 10,
  } = comp.params as FilterArrayParams;
  const c = selected ? COLORS.selected : COLORS.filter;
  const cellSize = pillarDiameter + spacing;
  const totalW = columns * cellSize;
  const totalH = rows * cellSize;

  const pillars: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < columns; col++) {
      pillars.push(
        <Circle
          key={`p${r}-${col}`}
          x={col * cellSize + cellSize / 2}
          y={r * cellSize + cellSize / 2}
          radius={pillarDiameter / 2}
          fill={c.stroke}
          opacity={0.5}
        />,
      );
    }
  }

  return (
    <Group>
      <Rect
        x={0}
        y={0}
        width={totalW}
        height={totalH}
        fill={c.fill}
        stroke={c.stroke}
        strokeWidth={sw}
      />
      {pillars}
    </Group>
  );
};

const ExpansionShape: React.FC<BaseProps> = ({ comp, sw, selected }) => {
  const { inletWidth = 200, outletWidth = 500, length = 1000 } = comp.params as ExpansionParams;
  const c = selected ? COLORS.selected : COLORS.expansion;

  const pathData = [
    `M 0 ${-inletWidth / 2}`,
    `L ${length} ${-outletWidth / 2}`,
    `L ${length} ${outletWidth / 2}`,
    `L 0 ${inletWidth / 2}`,
    'Z',
  ].join(' ');

  return <Path data={pathData} fill={c.fill} stroke={c.stroke} strokeWidth={sw} />;
};

const ReservoirShape: React.FC<BaseProps> = ({ comp, sw, selected }) => {
  const { width = 2000, height = 2000 } = comp.params as ReservoirParams;
  const c = selected ? COLORS.selected : COLORS.reservoir;

  return (
    <Group>
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill={c.fill}
        stroke={c.stroke}
        strokeWidth={sw}
        cornerRadius={width * 0.05}
      />
      {/* İç dolgu çizgisi */}
      <Rect
        x={width * 0.1}
        y={height * 0.1}
        width={width * 0.8}
        height={height * 0.8}
        fill="rgba(120,144,156,0.05)"
        stroke={c.stroke}
        strokeWidth={sw * 0.5}
        opacity={0.5}
        cornerRadius={width * 0.03}
      />
    </Group>
  );
};

const FallbackShape: React.FC<{ comp: ChipComponent; sw: number }> = ({ comp, sw }) => (
  <Rect
    x={-300}
    y={-200}
    width={600}
    height={400}
    fill="rgba(100,100,100,0.1)"
    stroke={TOKENS.textDark}
    strokeWidth={sw}
    dash={[100, 50]}
  />
);
