/**
 * PortOverlay.tsx
 * Portları canvas üzerinde görüntüler.
 * Hover: büyür + renk değişir; bağlantı çizme sırasında snap hedeflerini gösterir.
 */
import React, { useState } from 'react';
import { Circle, Group, Text, Line } from 'react-konva';
import type { ChipComponent } from '../../types';
import { getAllCanvasPorts, checkPortCompatibility, smartRoute } from '../../utils/portUtils';
import { useDesignStore, generateId } from '../../stores/useDesignStore';
import type { PendingConnection } from '../../stores/useDesignStore';

const PORT_R_SCREEN_PX = 9;   // port overlay dairesi ekran boyutu (piksel)
const PORT_R_MAX_UM    = 120; // çok uzak zoom'da port overlay dünya-uzayı üst sınırı (μm)
const PORT_R_MIN_UM    = 4;   // çok yakın zoom'da port overlay dünya-uzayı alt sınırı (μm)
const SNAP_DISTANCE    = 400; // μm — bu mesafe içindeyse snap

interface PortOverlayProps {
  components: ChipComponent[];
  zoom: number;
  pendingConnection: PendingConnection | null;
  showPorts: boolean;      // portlar görünür mü?
  /** Bağlantı çizgisinde sağ tık → CanvasEditor context menu'sünü açar. */
  onConnectionContextMenu?: (e: import('konva/lib/Node').KonvaEventObject<PointerEvent>, connectionId: string) => void;
  /** Z-order: 'below' = sadece bağlantı çizgileri (component'lerin altında render);
   *  'above' = port circles + pending wire + uyarı (component'lerin üstünde).
   *  CanvasEditor her iki modda da çağırır. */
  layer?: 'below' | 'above';
}

const PortOverlay: React.FC<PortOverlayProps> = ({
  components,
  zoom,
  pendingConnection,
  showPorts,
  onConnectionContextMenu,
  layer = 'above',
}) => {
  const { startConnection, cancelConnection, addConnection, updateConnectionMouse } = useDesignStore();
  const [hoveredPort, setHoveredPort] = useState<string | null>(null);
  const [compatWarning, setCompatWarning] = useState<string | null>(null);

  const allPorts = getAllCanvasPorts(components);

  /** Port üzerine fare gelince */
  const handlePortEnter = (portKey: string, compId: string, portIndex: number, type: 'input' | 'output', diameter: number) => {
    setHoveredPort(portKey);

    if (pendingConnection) {
      const fromComp = components.find(c => c.id === pendingConnection.fromComponentId);
      if (!fromComp || compId === pendingConnection.fromComponentId) return;

      // Uyumluluk kontrolü
      const { compatible, warning } = checkPortCompatibility(
        pendingConnection ? getPortDiameter(pendingConnection.fromComponentId, pendingConnection.fromPortIndex, components) : 0,
        diameter,
        getPortType(pendingConnection.fromComponentId, pendingConnection.fromPortIndex, components),
        type,
      );
      setCompatWarning(warning ?? null);
    }
  };

  const handlePortLeave = () => {
    setHoveredPort(null);
    setCompatWarning(null);
  };

  /** Port'a tıklama */
  const handlePortClick = (
    e: any,
    compId: string,
    portIndex: number,
    canvasPos: { x: number; y: number },
    type: 'input' | 'output',
    diameter: number,
  ) => {
    e.cancelBubble = true;

    if (!pendingConnection) {
      // Bağlantı çizmeye başla — sadece output portlarından başla
      if (type === 'output') {
        startConnection({
          fromComponentId: compId,
          fromPortIndex: portIndex,
          fromPortPos: canvasPos,
          currentMousePos: canvasPos,
        });
      }
      return;
    }

    // Bağlantıyı tamamla
    if (compId === pendingConnection.fromComponentId) {
      cancelConnection();
      return;
    }

    const { compatible, warning } = checkPortCompatibility(
      getPortDiameter(pendingConnection.fromComponentId, pendingConnection.fromPortIndex, components),
      diameter,
      getPortType(pendingConnection.fromComponentId, pendingConnection.fromPortIndex, components),
      type,
    );

    if (!compatible) {
      setCompatWarning(warning ?? null);
      cancelConnection();
      return;
    }

    if (warning) {
      // Uyarı göster ama bağlantıya izin ver
      console.warn('[MicroFlow] Bağlantı uyarısı:', warning);
    }

    addConnection({
      id: generateId('conn'),
      fromComponentId: pendingConnection.fromComponentId,
      fromPortIndex: pendingConnection.fromPortIndex,
      toComponentId: compId,
      toPortIndex: portIndex,
    });
  };

  // Port overlay dairesinin ekran boyutunu sabit ~PORT_R_SCREEN_PX piksele tutar.
  // Dünya-uzayı boyutu: screen_px / zoom. Zoom out → küçük dünya değeri değil,
  // büyük dünya değeri olur; bu yüzden üst sınırı PORT_R_MAX_UM ile kesiyoruz,
  // böylece çok uzakta küçücük bileşenlerin üstünde devasa çemberler oluşmaz.
  const portRadius = Math.min(
    PORT_R_MAX_UM,
    Math.max(PORT_R_MIN_UM, PORT_R_SCREEN_PX / zoom),
  );

  // ── Z-order: 'below' modu yalnızca bağlantı çizgilerini render eder ─────
  if (layer === 'below') {
    return (
      <ConnectionLines
        components={components}
        zoom={zoom}
        onConnectionContextMenu={onConnectionContextMenu}
      />
    );
  }

  // ── 'above' modu: port circles + pending wire + uyarı ──────────────────
  return (
    <>
      {/* Aktif çizilen bağlantı (pending) — port'ların altında */}
      {pendingConnection && (
        <PendingWire pending={pendingConnection} zoom={zoom} />
      )}

      {/* Port daireleri */}
      {showPorts && allPorts.map((port) => {
        const key = `${port.compId}-${port.index}`;
        const isHovered = hoveredPort === key;
        const isFromPort = pendingConnection?.fromComponentId === port.compId
          && pendingConnection?.fromPortIndex === port.index;

        // Bağlantı çiziliyorken uygun hedef portları vurgula
        let portColor = port.type === 'output' ? '#66bb6a' : '#ef5350';
        let opacity = 0.7;
        let isSnapTarget = false;  // Pending connection için uyumlu hedef mi?

        if (pendingConnection) {
          const fromType = getPortType(pendingConnection.fromComponentId, pendingConnection.fromPortIndex, components);
          // Karşı tip portları parlat, aynı bileşen portları soldur
          if (port.compId === pendingConnection.fromComponentId) {
            opacity = 0.2;
          } else if (port.type !== fromType) {
            opacity = 1;
            portColor = '#ffd54f'; // sarı: snap hedefi
            isSnapTarget = true;
          } else {
            opacity = 0.15; // ters tip — daha sönük (kullanıcı yanlış porta tıklamasın)
          }
        }

        if (isFromPort) { portColor = '#4fc3f7'; opacity = 1; }
        if (isHovered)  { opacity = 1; }

        const r = isHovered ? portRadius * 1.4 : portRadius;

        return (
          <Group key={key}>
            {/* Snap halo: pending bağlantıda uyumlu hedefler ekstra görünür halo */}
            {isSnapTarget && (
              <Circle
                x={port.canvasPos.x}
                y={port.canvasPos.y}
                radius={portRadius * 2.4}
                fill="transparent"
                stroke="#ffd54f"
                strokeWidth={Math.max(0.8, 1.5 / zoom)}
                opacity={isHovered ? 0.9 : 0.45}
                dash={[Math.max(4, 6 / zoom), Math.max(3, 4 / zoom)]}
                listening={false}
              />
            )}
            {/* From-port halo: kullanıcının tıkladığı kaynak port */}
            {isFromPort && (
              <Circle
                x={port.canvasPos.x}
                y={port.canvasPos.y}
                radius={portRadius * 2.0}
                fill="transparent"
                stroke="#4fc3f7"
                strokeWidth={Math.max(0.8, 1.5 / zoom)}
                opacity={0.6}
                listening={false}
              />
            )}
            <Circle
              x={port.canvasPos.x}
              y={port.canvasPos.y}
              radius={r}
              fill={portColor}
              opacity={opacity}
              stroke="#1a1a2e"
              strokeWidth={Math.max(0.5, 1 / zoom)}
              onMouseEnter={() => handlePortEnter(key, port.compId, port.index, port.type, port.diameter)}
              onMouseLeave={handlePortLeave}
              onClick={(e) => handlePortClick(e, port.compId, port.index, port.canvasPos, port.type, port.diameter)}
              style={{ cursor: 'crosshair' }}
            />
            {/* Port etiketi (yakın zoom'da göster) */}
            {zoom > 3 && (
              <Text
                x={port.canvasPos.x}
                y={port.canvasPos.y - portRadius * 2.5}
                text={port.label}
                fontSize={portRadius * 1.2}
                fill="#9e9e9e"
                align="center"
                offsetX={portRadius * 1.5}
                listening={false}
              />
            )}
          </Group>
        );
      })}

      {/* Uyumluluk uyarısı */}
      {compatWarning && (
        <CompatWarningTooltip
          message={compatWarning}
          pos={pendingConnection?.currentMousePos ?? { x: 0, y: 0 }}
          zoom={zoom}
        />
      )}
    </>
  );
};

// ─── Bağlantı çizgileri ───────────────────────────────────────────────────────
interface ConnectionLinesProps {
  components: ChipComponent[];
  zoom: number;
  onConnectionContextMenu?: (e: import('konva/lib/Node').KonvaEventObject<PointerEvent>, connectionId: string) => void;
}

const ConnectionLines: React.FC<ConnectionLinesProps> = ({ components, zoom, onConnectionContextMenu }) => {
  const connections          = useDesignStore((s) => s.connections);
  const selectedConnectionId = useDesignStore((s) => s.selectedConnectionId);
  const setSelectedConnection = useDesignStore((s) => s.setSelectedConnection);
  const clearSelection        = useDesignStore((s) => s.clearSelection);
  const dragOffset            = useDesignStore((s) => s.dragOffset);
  const allPorts = getAllCanvasPorts(components);

  const portMap = new Map(
    allPorts.map((p) => [`${p.compId}-${p.index}`, { pos: p.canvasPos, compId: p.compId }])
  );

  return (
    <>
      {connections.map((conn) => {
        const fromEntry = portMap.get(`${conn.fromComponentId}-${conn.fromPortIndex}`);
        const toEntry   = portMap.get(`${conn.toComponentId}-${conn.toPortIndex}`);
        if (!fromEntry || !toEntry) return null;

        // Drag esnasında bağlantı uçlarını dinamik kaydır
        const fromOff = dragOffset?.[fromEntry.compId];
        const toOff   = dragOffset?.[toEntry.compId];
        const from = fromOff
          ? { x: fromEntry.pos.x + fromOff.dx, y: fromEntry.pos.y + fromOff.dy }
          : fromEntry.pos;
        const to = toOff
          ? { x: toEntry.pos.x + toOff.dx, y: toEntry.pos.y + toOff.dy }
          : toEntry.pos;

        const pts = smartRoute(from, to);
        const isSelected = selectedConnectionId === conn.id;
        const stroke = isSelected ? '#ffd54f' : '#4fc3f7';
        const sw     = Math.max(isSelected ? 1.0 : 0.7, (isSelected ? 2.5 : 1.5) / zoom);

        return (
          <Line
            key={conn.id}
            points={pts}
            stroke={stroke}
            strokeWidth={sw}
            opacity={isSelected ? 1.0 : 0.85}
            lineCap="round"
            lineJoin="round"
            hitStrokeWidth={Math.max(6, 10 / zoom)}
            onClick={(e) => {
              e.cancelBubble = true;
              // Bileşen seçimini temizle, bağlantıyı seç
              clearSelection();
              setSelectedConnection(conn.id);
            }}
            onContextMenu={(e) => onConnectionContextMenu?.(e, conn.id)}
            onMouseEnter={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'pointer';
            }}
            onMouseLeave={(e) => {
              const stage = e.target.getStage() as
                (Konva_Stage_with_refresh) | null;
              if (!stage) return;
              const c = stage.container() as
                (HTMLDivElement & { __refreshCursor?: () => void });
              if (typeof c.__refreshCursor === 'function') c.__refreshCursor();
              else c.style.cursor = 'default';
            }}
          />
        );
      })}
    </>
  );
};

// Konva.Stage tip referansı (cycle import'tan kaçınmak için minimal interface)
type Konva_Stage_with_refresh = {
  container: () => HTMLDivElement & { __refreshCursor?: () => void };
};

// ─── Çizilen bağlantı (pending wire) ─────────────────────────────────────────
interface PendingWireProps {
  pending: PendingConnection;
  zoom: number;
}

const PendingWire: React.FC<PendingWireProps> = ({ pending, zoom }) => {
  const pts = smartRoute(pending.fromPortPos, pending.currentMousePos);
  // Zoom-stable: stroke 1.5px, dash 10/6px ekran biriminde sabit
  const sw  = 1.5 / zoom;

  return (
    <Line
      points={pts}
      stroke="#ffd54f"
      strokeWidth={sw}
      opacity={0.9}
      dash={[10 / zoom, 6 / zoom]}
      lineCap="round"
      lineJoin="round"
      listening={false}
    />
  );
};

// ─── Uyarı tooltip ────────────────────────────────────────────────────────────
interface CompatWarningTooltipProps {
  message: string;
  pos: { x: number; y: number };
  zoom: number;
}

const CompatWarningTooltip: React.FC<CompatWarningTooltipProps> = ({ message, pos, zoom }) => {
  const fontSize = Math.max(60, 160 / zoom);
  return (
    <Text
      x={pos.x + 200 / zoom}
      y={pos.y - 200 / zoom}
      text={`⚠ ${message}`}
      fontSize={fontSize}
      fill="#ffd54f"
      background="#1a1a2e"
      padding={20 / zoom}
      listening={false}
    />
  );
};

// ─── Yardımcı fonksiyonlar ────────────────────────────────────────────────────
import { getPortInfos } from '../../utils/portUtils';

function getPortDiameter(compId: string, portIndex: number, components: ChipComponent[]): number {
  const comp = components.find(c => c.id === compId);
  if (!comp) return 0;
  return getPortInfos(comp)[portIndex]?.diameter ?? 0;
}

function getPortType(compId: string, portIndex: number, components: ChipComponent[]): 'input' | 'output' {
  const comp = components.find(c => c.id === compId);
  if (!comp) return 'output';
  return getPortInfos(comp)[portIndex]?.type ?? 'output';
}

export default PortOverlay;
