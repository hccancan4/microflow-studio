/**
 * CanvasEditor.tsx — Ana canvas bileşeni (Faz 2)
 *
 * Katman mimarisi (performans için):
 *   Layer 0 — Grid          : listening=false, sadece grid çizgileri
 *   Layer 1 — Static        : bağlantılar + statik bileşenler
 *   Layer 2 — Active/Drag   : şu an sürüklenen bileşen(ler) — ayrı layer'da
 *   Layer 3 — Port Overlay  : portlar + pending bağlantı
 *
 * Özellikler:
 *  - Sonsuz canvas (pan + fare tekerleği zoom)
 *  - Grid snap (25/50/100μm)
 *  - Sürükle-bırak ile bileşen ekleme (sidebar'dan)
 *  - Tekli/çoklu seçim (Shift), rubber-band (çerçeve seçimi)
 *  - Taşıma (tek veya çoklu), döndürme (R tuşu, 15° snap)
 *  - Sağ tık context menü
 *  - Portlar arası snap-to-port bağlantı
 */
import React, { useRef, useCallback, useState, useEffect } from 'react';
import { Stage, Layer, Rect } from 'react-konva';
import Konva from 'konva';

import { useDesignStore, generateId, snapToGrid } from '../../stores/useDesignStore';
import { useProjectStore } from '../../stores/useProjectStore';
import { ComponentShape } from './shapes/ComponentShapes';
import PortOverlay from './PortOverlay';
import CfdOverlay from './CfdOverlay';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
import Ruler, { RULER_SIZE } from './Ruler';
import { buildGridLines } from './canvasGrid';
import { useSimulationStore } from '../../stores/useSimulationStore';
import { useCursorStore } from '../../stores/useCursorStore';

import type { ComponentType, ChipComponent } from '../../types';
import { getDefaultParams } from '../../utils/componentDefaults';
import { worldBbox, bboxesIntersect } from '../../utils/componentBbox';
import { TOKENS } from '../../theme/tokens';
import {
  FiTrash2, FiCopy, FiClipboard, FiRotateCw, FiRotateCcw,
} from 'react-icons/fi';

const CANVAS_BG = TOKENS.bg;

// Bbox hesabı componentBbox.ts modülüne taşındı (her tip için doğru AABB).

// ─── Tip tanımları ────────────────────────────────────────────────────────────
interface ContextMenuState {
  x: number; y: number;
  items: ContextMenuItem[];
}

interface RubberBand {
  startX: number; startY: number;
  currentX: number; currentY: number;
}

interface CanvasEditorProps {
  width: number;
  height: number;
}

// ─── Bileşen ──────────────────────────────────────────────────────────────────
const CanvasEditor: React.FC<CanvasEditorProps> = ({ width, height }) => {
  const stageRef = useRef<Konva.Stage>(null);

  const {
    components, canvas, selectedIds,
    addComponent, moveComponents, removeComponents,
    setSelected, toggleSelection, clearSelection, selectAll,
    updateComponent, copySelected, pasteClipboard, duplicateSelected,
    pendingConnection, startConnection, updateConnectionMouse, cancelConnection,
    updateCanvas, zoomBy, zoomReset, fitAll, rotateSelected,
    setSelectedConnection, setDragOffset,
  } = useDesignStore();

  const { setDirty } = useProjectStore();

  // CFD overlay bağlantısı
  const cfdField        = useSimulationStore((s) => s.result?.cfdField);
  const cfdTargetId     = useSimulationStore((s) => s.cfdTargetComponentId);
  const cfdFieldType    = useSimulationStore((s) => s.cfdFieldType);
  const cfdColormap     = useSimulationStore((s) => s.colormap);
  const cfdShow         = useSimulationStore(
    (s) => s.showVelocityField || s.showPressureField || s.showWallShear
  );
  const cfdTarget       = cfdTargetId ? components.find((c) => c.id === cfdTargetId) ?? null : null;

  // ── Yerel durum ──────────────────────────────────────────────────────────
  const [contextMenu, setContextMenu]   = useState<ContextMenuState | null>(null);
  const [rubberBand, setRubberBand]     = useState<RubberBand | null>(null);
  const [showPorts, setShowPorts]       = useState(true);
  const [mouseUm, setMouseUm]           = useState({ x: 0, y: 0 });
  const [mousePx, setMousePx]           = useState({ x: 0, y: 0 });

  // Sürükleme takibi: drag başlangıcında seçili bileşenlerin pozisyonları
  const dragStartPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const isDraggingSelection = useRef(false);
  const isRubberBanding = useRef(false);

  // ─── Pan state (spacebar / orta tık) ──────────────────────────────────────
  // 'idle': boş; 'space-held': spacebar basılı (cursor=grab); 'panning': aktif drag (cursor=grabbing)
  const panModeRef = useRef<'idle' | 'space-held' | 'panning'>('idle');
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  // Pan'dan sonra mouse-up click event'ini engellemek için
  const suppressNextClickRef = useRef(false);
  // Container ref — cursor değişimi için (re-render olmadan)
  const containerRef = useRef<HTMLDivElement>(null);

  // Cursor'u CSS class olarak set et — re-render maliyeti yok
  const setCursor = useCallback((cursor: string) => {
    if (containerRef.current) containerRef.current.style.cursor = cursor;
  }, []);

  // Mevcut moda göre uygun cursor — pendingConnection ve panMode birlikte
  const refreshCursor = useCallback(() => {
    if (pendingConnection) { setCursor('crosshair'); return; }
    if (panModeRef.current === 'panning') { setCursor('grabbing'); return; }
    if (panModeRef.current === 'space-held') { setCursor('grab'); return; }
    setCursor('default');
  }, [pendingConnection, setCursor]);

  // pendingConnection değiştiğinde cursor'u tazele
  useEffect(() => { refreshCursor(); }, [refreshCursor]);

  // ComponentShape hover-leave'inden cursor'u senkronize edebilmek için
  // Stage container DOM node'una refreshCursor'u attach et.
  useEffect(() => {
    const c = stageRef.current?.container() as
      (HTMLDivElement & { __refreshCursor?: () => void }) | undefined;
    if (c) c.__refreshCursor = refreshCursor;
    return () => {
      if (c) delete c.__refreshCursor;
    };
  }, [refreshCursor]);

  // ── Klavye kısayolları ───────────────────────────────────────────────────
  useEffect(() => {
    const isFormFocus = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
      if (el.closest('.monaco-editor')) return true;
      return false;
    };

    const onKey = (e: KeyboardEvent) => {
      if (isFormFocus()) return;

      // ── Spacebar: pan modu (basılı tutma) ───────────────────────────────
      if (e.key === ' ' && !e.repeat && panModeRef.current === 'idle') {
        e.preventDefault(); // sayfa scroll'unu önle
        panModeRef.current = 'space-held';
        refreshCursor();
        return;
      }

      // ── Delete: önce bağlantı seçili ise onu sil; yoksa bileşenler ─────
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selConn = useDesignStore.getState().selectedConnectionId;
        if (selConn) {
          useDesignStore.getState().removeConnection(selConn);
        } else if (selectedIds.length) {
          removeComponents(selectedIds);
        }
      }
      if (e.key === 'Escape') {
        cancelConnection();
        clearSelection();
        setSelectedConnection(null);
        setContextMenu(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); selectAll(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') { e.preventDefault(); copySelected(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') { e.preventDefault(); pasteClipboard(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); duplicateSelected(); }

      // ── Zoom kısayolları ────────────────────────────────────────────────
      // Stage gerçek alanı = width/height - RULER_SIZE (cetveller alan kaplıyor).
      // Anchor doğru viewport merkezine düşmeli.
      const stageW = Math.max(1, width  - RULER_SIZE);
      const stageH = Math.max(1, height - RULER_SIZE);
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomBy(1.25, undefined, { w: stageW, h: stageH });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        zoomBy(0.8, undefined, { w: stageW, h: stageH });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        zoomReset();
      }
      // F — fit-all (modifier'sız)
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        fitAll(stageW, stageH);
      }

      // ── G — grid toggle, P — port toggle, Shift+; → snap toggle ─────────
      if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.metaKey) {
        updateCanvas({ showGrid: !canvas.showGrid });
      }
      if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey) {
        setShowPorts((v) => !v);
      }
      // Shift+; → snap on/off (CAD: F9 alternatifi olabilir ama F9 OS-level'de takılır)
      if (e.key === ':' || (e.shiftKey && e.key === ';')) {
        updateCanvas({ snapEnabled: !canvas.snapEnabled });
      }

      // R — seçili bileşeni 15° döndür (history'e gider)
      if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) {
        rotateSelected(e.shiftKey ? -15 : 15);
      }

      // ── Ok tuşları: seçili bileşenleri grid step kadar nudge ─────────────
      // Shift = 5× (10× isteyenler için Ctrl+Shift gelecekte ayarlanabilir)
      // Snap kapalıysa 1μm hassasiyetinde, açıkken gridSize.
      if (selectedIds.length > 0 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const step = (canvas.snapEnabled ? canvas.gridSize : 1) * (e.shiftKey ? 5 : 1);
        let dx = 0, dy = 0;
        if (e.key === 'ArrowLeft')  dx = -step;
        if (e.key === 'ArrowRight') dx =  step;
        if (e.key === 'ArrowUp')    dy = -step;
        if (e.key === 'ArrowDown')  dy =  step;
        if (dx !== 0 || dy !== 0) {
          e.preventDefault();
          moveComponents(selectedIds.map((id) => ({ id, dx, dy })));
          setDirty(true);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        // Spacebar bırakıldı — eğer aktif pan yoksa idle'a dön
        if (panModeRef.current === 'space-held') {
          panModeRef.current = 'idle';
          refreshCursor();
        }
        // Pan aktifken spacebar bırakılırsa: pan devam ediyor; mouse-up'ta idle olacak
      }
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    selectedIds, removeComponents, cancelConnection, clearSelection,
    setSelectedConnection, selectAll, copySelected, pasteClipboard, duplicateSelected,
    rotateSelected, zoomBy, zoomReset, fitAll, updateCanvas, moveComponents, setDirty,
    canvas.showGrid, canvas.snapEnabled, canvas.gridSize, width, height, refreshCursor,
  ]);

  // ── Fareyi μm'ye çevir ───────────────────────────────────────────────────
  const pxToUm = useCallback((pxX: number, pxY: number) => ({
    x: (pxX - canvas.panX) / canvas.zoom,
    y: (pxY - canvas.panY) / canvas.zoom,
  }), [canvas.panX, canvas.panY, canvas.zoom]);

  // ── Fare tekerleği / touchpad zoom + pan ─────────────────────────────────
  // Figma / Miro / Google Maps standardı:
  //   • ctrlKey basılı  → zoom at cursor
  //       (Chromium pinch-to-zoom'u otomatik ctrlKey=true olarak sentezler.
  //        Klavyeden Ctrl+Wheel aynı yolu kullanır.)
  //   • shiftKey        → yatay pan (dikey delta'yı X'e yönlendir)
  //   • aksi            → pan (deltaX ve deltaY'yi 2D ötelemeye çevir)
  //
  // Bu ayrım tek bir güvenilir tarayıcı sinyaline dayanır (ctrlKey). Delta
  // büyüklüğüne göre heuristic yok → touchpad pinch ve iki-parmak kaydırma
  // asla birbirine karışmaz.
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const { deltaX, deltaY, ctrlKey, shiftKey } = e.evt;

    // ── Zoom yolu: ctrlKey (pinch VEYA Ctrl+Wheel) ────────────────────────
    if (ctrlKey) {
      // delta'yı [-50, 50] aralığına sıkıştır, üstel faktöre çevir.
      // k=0.01: pinch (deltaY≈5) → faktör 0.951 smooth;
      //         Ctrl+Wheel (deltaY≈100→50) → faktör 0.606 belirgin tık.
      const clamped = Math.max(-50, Math.min(50, deltaY));
      const zoomFactor = Math.exp(-clamped * 0.01);
      const oldZoom = canvas.zoom;
      const newZoom = Math.max(0.02, Math.min(20, oldZoom * zoomFactor));
      if (newZoom === oldZoom) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const mousePointTo = {
        x: (pointer.x - canvas.panX) / oldZoom,
        y: (pointer.y - canvas.panY) / oldZoom,
      };
      updateCanvas({
        zoom: newZoom,
        panX: pointer.x - mousePointTo.x * newZoom,
        panY: pointer.y - mousePointTo.y * newZoom,
      });
      return;
    }

    // ── Pan yolu: touchpad iki-parmak, mouse wheel, Shift+Wheel ──────────
    // Shift basılıysa dikey delta'yı yatay pan'a yönlendir (mouse kullanıcısı
    // için yatay kaydırma kısayolu). Aksi hâlde iki eksende ötele.
    const dx = shiftKey && deltaX === 0 ? deltaY : deltaX;
    const dy = shiftKey && deltaX === 0 ? 0 : deltaY;
    updateCanvas({
      panX: canvas.panX - dx,
      panY: canvas.panY - dy,
    });
  }, [canvas, updateCanvas]);

  // ── Sürükle-bırak ile bileşen ekle (sidebar'dan) ─────────────────────────
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('application/microflow-component');
    if (!data) return;

    try {
      const { type, label, portType } = JSON.parse(data) as {
        type: ComponentType; label: string; portType?: 'inlet' | 'outlet';
      };
      // currentTarget zaten ruler'dan SONRA gelen "Ana canvas" div'i —
      // rect.left/top ruler'ın dışında başladığı için ekstra RULER_SIZE çıkarılmamalı.
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const px   = e.clientX - rect.left;
      const py   = e.clientY - rect.top;
      const um   = pxToUm(px, py);

      // Port tipi: Sidebar'daki "Çıkış Portu" için outlet'e çevir
      const params = getDefaultParams(type);
      if (type === 'port' && portType) {
        (params as any).portType = portType;
      }

      const newComp: ChipComponent = {
        id:       generateId('comp'),
        type,
        label,
        position: {
          x: canvas.snapEnabled ? snapToGrid(um.x, canvas.gridSize) : um.x,
          y: canvas.snapEnabled ? snapToGrid(um.y, canvas.gridSize) : um.y,
        },
        rotation: 0,
        params,
        ports:    [],
      };

      addComponent(newComp);
      setDirty(true);
      setSelected([newComp.id]);
    } catch { /* yoksay */ }
  }, [canvas, pxToUm, addComponent, setDirty, setSelected]);

  // ── Stage tıklama — seçimi temizle ───────────────────────────────────────
  const handleStageClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    // Pan'dan sonraki click event'ini bastır (mouse-up'tan tetiklenebilir)
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (e.target !== e.target.getStage()) return;
    if (pendingConnection) { cancelConnection(); return; }
    clearSelection();
    setSelectedConnection(null);
    setContextMenu(null);
  }, [pendingConnection, cancelConnection, clearSelection, setSelectedConnection]);

  // ── Stage mouse move — pan + pending bağlantı + rubber-band ──────────────
  const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const ptr = stage.getPointerPosition()!;

    // Aktif pan: panStartRef üzerinden delta hesapla
    if (panModeRef.current === 'panning' && panStartRef.current) {
      const dx = ptr.x - panStartRef.current.x;
      const dy = ptr.y - panStartRef.current.y;
      updateCanvas({
        panX: panStartRef.current.panX + dx,
        panY: panStartRef.current.panY + dy,
      });
      return;
    }

    const um  = pxToUm(ptr.x, ptr.y);
    // Zoom-aware precision: küçük zoom → tam sayı, büyük → ondalık
    const z = canvas.zoom;
    const precision = z < 0.5 ? 0 : z < 2 ? 1 : 2;
    const factor = Math.pow(10, precision);
    const dispX = Math.round(um.x * factor) / factor;
    const dispY = Math.round(um.y * factor) / factor;

    setMousePx({ x: ptr.x, y: ptr.y });
    setMouseUm({ x: dispX, y: dispY });
    useCursorStore.getState().set(dispX, dispY, true, precision);

    if (pendingConnection) {
      updateConnectionMouse(um);
    }

    if (isRubberBanding.current && rubberBand) {
      setRubberBand((rb) => rb ? { ...rb, currentX: um.x, currentY: um.y } : null);
    }
  }, [pendingConnection, rubberBand, pxToUm, updateConnectionMouse, canvas.zoom, updateCanvas]);

  // ── Mouse-down: orta tık veya space-held → pan; sol tık → rubber-band ────
  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const ptr = stage.getPointerPosition()!;

    // Orta tık (button=1) → pan başlat (her zaman)
    // Sol tık + spacebar → pan başlat
    const isMiddle = e.evt.button === 1;
    const isLeftWithSpace = e.evt.button === 0 && panModeRef.current === 'space-held';
    if (isMiddle || isLeftWithSpace) {
      e.evt.preventDefault();
      panModeRef.current = 'panning';
      panStartRef.current = { x: ptr.x, y: ptr.y, panX: canvas.panX, panY: canvas.panY };
      refreshCursor();
      return;
    }

    if (e.target !== e.target.getStage()) return;
    if (e.evt.button !== 0) return; // sadece sol tık
    if (pendingConnection) return;

    const um = pxToUm(ptr.x, ptr.y);
    isRubberBanding.current = true;
    setRubberBand({ startX: um.x, startY: um.y, currentX: um.x, currentY: um.y });
  }, [pendingConnection, pxToUm, canvas.panX, canvas.panY, refreshCursor]);

  const handleMouseUp = useCallback((_e?: Konva.KonvaEventObject<MouseEvent>) => {
    // Pan bitir
    if (panModeRef.current === 'panning') {
      panModeRef.current = panStartRef.current && /* spacebar hala basılı mı? bilemeyiz; idle'a dön */ false
        ? 'space-held' : 'idle';
      panStartRef.current = null;
      // Pan biraz daha emin olunsun: bir sonraki click'i bastır
      suppressNextClickRef.current = true;
      refreshCursor();
      return;
    }

    if (isRubberBanding.current && rubberBand) {
      const minX = Math.min(rubberBand.startX, rubberBand.currentX);
      const maxX = Math.max(rubberBand.startX, rubberBand.currentX);
      const minY = Math.min(rubberBand.startY, rubberBand.currentY);
      const maxY = Math.max(rubberBand.startY, rubberBand.currentY);

      // Threshold: ekran-px bazlı (4px). World coordinate'da: 4/zoom μm.
      const minPx = 4;
      const minWorld = minPx / canvas.zoom;
      if ((maxX - minX) >= minWorld || (maxY - minY) >= minWorld) {
        // BBox-intersect testi: her bileşen tipi için componentBbox.ts'deki
        // doğru AABB hesabı kullanılır.
        const band = { minX, minY, maxX, maxY };
        const inBand = components.filter((c) =>
          bboxesIntersect(worldBbox(c), band)
        );
        if (inBand.length) setSelected(inBand.map((c) => c.id));
      }
    }
    isRubberBanding.current = false;
    setRubberBand(null);
  }, [rubberBand, components, setSelected, canvas.zoom, refreshCursor]);

  // ── Stage sağ tık — genel context menü ──────────────────────────────────
  const handleStageContextMenu = useCallback((e: Konva.KonvaEventObject<PointerEvent>) => {
    e.evt.preventDefault();
    if (e.target !== e.target.getStage()) return;

    const items: ContextMenuItem[] = [
      {
        label: 'Yapıştır',
        icon: <FiClipboard size={12} />,
        onClick: pasteClipboard,
        disabled: !useDesignStore.getState().clipboard,
      },
      { divider: true, label: '', onClick: () => {} },
      {
        label: 'Tümünü Seç',
        icon: <FiCopy size={12} />,
        onClick: selectAll,
      },
    ];

    setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, items });
  }, [pasteClipboard, selectAll]);

  // ── Bileşen event handler'ları ────────────────────────────────────────────
  const handleCompClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>, id: string) => {
    e.cancelBubble = true;
    setContextMenu(null);
    if (e.evt.shiftKey) {
      toggleSelection(id);
    } else {
      setSelected([id]);
    }
  }, [toggleSelection, setSelected]);

  const handleCompDblClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>, id: string) => {
    e.cancelBubble = true;
    // Çift tık → özellikleri göster (sağ panel otomatik güncellenecek)
    setSelected([id]);
  }, [setSelected]);

  const handleCompContextMenu = useCallback((e: Konva.KonvaEventObject<PointerEvent>, id: string) => {
    e.evt.preventDefault();
    e.cancelBubble = true;

    // Eğer sağ tıklanan seçili değilse, onu seç
    if (!selectedIds.includes(id)) setSelected([id]);

    const targetIds = selectedIds.includes(id) ? selectedIds : [id];
    const count = targetIds.length;

    const items: ContextMenuItem[] = [
      {
        label: `${count > 1 ? `${count} bileşeni` : 'Bileşeni'} Sil`,
        icon: <FiTrash2 size={12} />,
        onClick: () => removeComponents(targetIds),
        danger: true,
      },
      { divider: true, label: '', onClick: () => {} },
      {
        label: 'Kopyala',
        icon: <FiCopy size={12} />,
        onClick: copySelected,
      },
      {
        label: 'Çoğalt',
        icon: <FiCopy size={12} />,
        onClick: duplicateSelected,
      },
      { divider: true, label: '', onClick: () => {} },
      {
        label: 'Saat Yönünde Döndür (15°)',
        icon: <FiRotateCw size={12} />,
        onClick: () => rotateSelected(15),
      },
      {
        label: 'Saat Yönü Tersine Döndür (15°)',
        icon: <FiRotateCcw size={12} />,
        onClick: () => rotateSelected(-15),
      },
    ];

    setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, items });
  }, [selectedIds, components, setSelected, removeComponents, copySelected, duplicateSelected, rotateSelected]);

  // ── Bağlantı sağ tık menüsü ──────────────────────────────────────────────
  const handleConnectionContextMenu = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>, connectionId: string) => {
      e.evt.preventDefault();
      e.cancelBubble = true;
      // Bağlantıyı seç (görsel feedback)
      useDesignStore.getState().setSelectedConnection(connectionId);
      const conn = useDesignStore.getState().connections.find((c) => c.id === connectionId);
      if (!conn) return;
      const items: ContextMenuItem[] = [
        {
          label: 'Bağlantıyı Sil',
          icon: <FiTrash2 size={12} />,
          onClick: () => useDesignStore.getState().removeConnection(connectionId),
          danger: true,
        },
        { divider: true, label: '', onClick: () => {} },
        {
          label: 'Yönü Tersine Çevir',
          icon: <FiRotateCcw size={12} />,
          onClick: () => {
            // Aynı bağlantı id'sini koruyarak from↔to swap (history'e gider)
            const cur = useDesignStore.getState().connections.find((c) => c.id === connectionId);
            if (!cur) return;
            useDesignStore.getState().pushHistory('bağlantı tersine çevir');
            const swapped = {
              id: cur.id,
              fromComponentId: cur.toComponentId,
              fromPortIndex: cur.toPortIndex,
              toComponentId: cur.fromComponentId,
              toPortIndex: cur.fromPortIndex,
            };
            useDesignStore.setState((s) => ({
              connections: s.connections.map((c) => (c.id === connectionId ? swapped : c)),
            }));
          },
        },
      ];
      setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, items });
    },
    [],
  );

  // ── Bileşen sürükleme ─────────────────────────────────────────────────────
  // Snap'i conditional yap (canvas.snapEnabled true ise)
  const maybeSnap = useCallback((v: number) => {
    return canvas.snapEnabled ? snapToGrid(v, canvas.gridSize) : v;
  }, [canvas.snapEnabled, canvas.gridSize]);

  const handleCompDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>, id: string) => {
    e.cancelBubble = true;
    isDraggingSelection.current = true;

    // Sürüklenen seçili değilse seç
    if (!selectedIds.includes(id)) setSelected([id]);

    // Başlangıç pozisyonlarını kaydet
    const positions = new Map<string, { x: number; y: number }>();
    const ids = selectedIds.includes(id) ? selectedIds : [id];
    ids.forEach((sid) => {
      const comp = components.find((c) => c.id === sid);
      if (comp) positions.set(sid, { ...comp.position });
    });
    dragStartPositions.current = positions;

    // Drag offset (canlı bağlantı çizimi için) — başta hepsi 0
    const offset: Record<string, { dx: number; dy: number }> = {};
    ids.forEach((sid) => { offset[sid] = { dx: 0, dy: 0 }; });
    setDragOffset(offset);
  }, [selectedIds, components, setSelected, setDragOffset]);

  const handleCompDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>, id: string) => {
    e.cancelBubble = true;
    const group = e.target as Konva.Group;

    // Shift basılı: ilk hareket yönünü koru, diğer ekseni sıfırla
    const startPos = dragStartPositions.current.get(id);
    let rawX = group.x();
    let rawY = group.y();
    if (e.evt.shiftKey && startPos) {
      const dx = rawX - startPos.x;
      const dy = rawY - startPos.y;
      if (Math.abs(dx) > Math.abs(dy)) { rawY = startPos.y; }
      else                              { rawX = startPos.x; }
    }

    // Sürüklenen bileşen — grid snap (snap kapalıysa raw)
    const snappedX = maybeSnap(rawX);
    const snappedY = maybeSnap(rawY);
    group.x(snappedX);
    group.y(snappedY);

    // dragOffset'i tüm seçim için güncelle (PortOverlay canlı line için okuyor)
    if (startPos) {
      const dx = snappedX - startPos.x;
      const dy = snappedY - startPos.y;
      const ids = selectedIds.includes(id) ? selectedIds : [id];
      const offset: Record<string, { dx: number; dy: number }> = {};
      ids.forEach((sid) => { offset[sid] = { dx, dy }; });
      setDragOffset(offset);

      // Çoklu seçimde diğer Konva node'ları da taşı
      if (selectedIds.length > 1 && selectedIds.includes(id)) {
        selectedIds.filter((sid) => sid !== id).forEach((sid) => {
          const compNode = group.getStage()?.findOne(`#${sid}`);
          if (compNode) {
            const sp = dragStartPositions.current.get(sid);
            if (sp) {
              (compNode as Konva.Group).x(sp.x + dx);
              (compNode as Konva.Group).y(sp.y + dy);
            }
          }
        });
      }
    }
  }, [maybeSnap, selectedIds, setDragOffset]);

  const handleCompDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>, id: string) => {
    e.cancelBubble = true;
    isDraggingSelection.current = false;

    const group = e.target as Konva.Group;
    const finalX = maybeSnap(group.x());
    const finalY = maybeSnap(group.y());

    if (selectedIds.length > 1 && selectedIds.includes(id)) {
      const startPos = dragStartPositions.current.get(id);
      if (!startPos) {
        setDragOffset(null);
        return;
      }
      const dx = finalX - startPos.x;
      const dy = finalY - startPos.y;

      // Tek bir history kaydı + tüm seçimi taşı
      moveComponents(
        selectedIds.map((sid) => ({ id: sid, dx, dy }))
      );
      // Stage'den Konva node'larını sıfırla (store güncelledi)
      selectedIds.forEach((sid) => {
        const node = group.getStage()?.findOne(`#${sid}`);
        if (node) {
          const sp = dragStartPositions.current.get(sid);
          if (sp) {
            (node as Konva.Group).x(sp.x + dx);
            (node as Konva.Group).y(sp.y + dy);
          }
        }
      });
    } else {
      // Tek bileşen: history'e gitmesi için moveComponents kullan (updateComponent history pushlamaz)
      const startPos = dragStartPositions.current.get(id);
      if (startPos) {
        const dx = finalX - startPos.x;
        const dy = finalY - startPos.y;
        if (dx !== 0 || dy !== 0) {
          moveComponents([{ id, dx, dy }]);
        }
      }
    }

    setDragOffset(null);
    setDirty(true);
  }, [maybeSnap, selectedIds, moveComponents, setDragOffset, setDirty]);

  // ── Grid çizgileri — gövde canvasGrid.buildGridLines'a taşındı ───────────
  // useCallback sarmalayıcı: memo davranışı birebir (deps: canvas/width/height).
  const renderGrid = useCallback(
    () => buildGridLines(canvas, width, height),
    [canvas, width, height],
  );

  // ── Rubber-band dikdörtgeni (canvas koordinatlarında) ────────────────────
  const renderRubberBand = () => {
    if (!rubberBand) return null;
    const { startX, startY, currentX, currentY } = rubberBand;
    // Zoom-stable: ekranda sabit ~1.5px stroke, dash ~12/6px
    const z = canvas.zoom;
    return (
      <Rect
        x={Math.min(startX, currentX)}
        y={Math.min(startY, currentY)}
        width={Math.abs(currentX - startX)}
        height={Math.abs(currentY - startY)}
        fill="rgba(79, 195, 247, 0.08)"
        stroke={TOKENS.dye}
        strokeWidth={Math.max(1 / z, 1.5 / z)}
        dash={[12 / z, 6 / z]}
        listening={false}
      />
    );
  };

  const canvasWidth  = width  - RULER_SIZE;
  const canvasHeight = height - RULER_SIZE;

  return (
    <div
      className="flex flex-col w-full h-full overflow-hidden"
      style={{ backgroundColor: CANVAS_BG }}
    >
      {/* ─── Üst cetvel satırı ─────────────────────────────────────────── */}
      <div className="flex" style={{ height: RULER_SIZE }}>
        {/* Sol üst köşe karesi */}
        <div
          style={{ width: RULER_SIZE, height: RULER_SIZE, flexShrink: 0, backgroundColor: TOKENS.panel, borderRight: `1px solid ${TOKENS.border}`, borderBottom: `1px solid ${TOKENS.border}` }}
          title={`Grid: ${canvas.gridSize}μm`}
        >
          <div className="w-full h-full flex items-center justify-center text-mf-text-dark text-xs font-mono">μ</div>
        </div>
        {/* Yatay cetvel */}
        <Ruler
          orientation="horizontal"
          length={canvasWidth}
          zoom={canvas.zoom}
          pan={canvas.panX}
          mousePos={mousePx.x}
        />
      </div>

      {/* ─── Canvas + Dikey cetvel ──────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Dikey cetvel */}
        <Ruler
          orientation="vertical"
          length={canvasHeight}
          zoom={canvas.zoom}
          pan={canvas.panY}
          mousePos={mousePx.y}
        />

        {/* Ana canvas */}
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden"
          style={{ backgroundColor: CANVAS_BG }}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
          onMouseLeave={() => useCursorStore.getState().set(0, 0, false)}
        >
          <Stage
            ref={stageRef}
            width={canvasWidth}
            height={canvasHeight}
            x={canvas.panX}
            y={canvas.panY}
            scaleX={canvas.zoom}
            scaleY={canvas.zoom}
            onWheel={handleWheel}
            onClick={handleStageClick}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onContextMenu={handleStageContextMenu}
            draggable={false}
          >
            {/* ── Katman 0: Grid (listening=false — performans) ─────────── */}
            {canvas.showGrid && (
              <Layer listening={false} name="grid-layer">
                {renderGrid()}
              </Layer>
            )}

            {/* ── Katman 1: Statik bileşenler ───────────────────────────── */}
            <Layer name="static-layer">
              {/* CFD sonucu renk haritası (en alta bileşenlerin arkasına) */}
              {cfdField && cfdShow && cfdTarget && (
                <CfdOverlay
                  field={cfdField}
                  target={cfdTarget}
                  fieldType={cfdFieldType}
                  colormap={cfdColormap}
                />
              )}

              {/* Port overlay (BELOW): yalnızca bağlantı çizgileri — bileşenlerin altında */}
              <PortOverlay
                layer="below"
                components={components}
                zoom={canvas.zoom}
                pendingConnection={pendingConnection}
                showPorts={showPorts}
                onConnectionContextMenu={handleConnectionContextMenu}
              />

              {/* Tüm bileşenler */}
              {components.map((comp) => (
                <ComponentShape
                  key={comp.id}
                  comp={comp}
                  selected={selectedIds.includes(comp.id)}
                  zoom={canvas.zoom}
                  /* Stable useCallback'ler doğrudan geçilir (inline arrow yok)
                     → React.memo mousemove sırasında re-render'ı atlar */
                  onClick={handleCompClick}
                  onDblClick={handleCompDblClick}
                  onContextMenu={handleCompContextMenu}
                  onDragStart={handleCompDragStart}
                  onDragMove={handleCompDragMove}
                  onDragEnd={handleCompDragEnd}
                />
              ))}

              {/* Port overlay (ABOVE): port circles + pending wire — bileşenlerin üstünde */}
              <PortOverlay
                layer="above"
                components={components}
                zoom={canvas.zoom}
                pendingConnection={pendingConnection}
                showPorts={showPorts}
              />

              {/* Rubber-band seçim dikdörtgeni — en üstte */}
              {renderRubberBand()}
            </Layer>
          </Stage>

          {/* Boş canvas ipucu */}
          {components.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="text-5xl mb-2 opacity-25 font-mono text-mf-dye">μ</div>
                <div className="text-sm text-mf-text-dim">Boş tasarım</div>
                <div className="text-xs text-mf-text-dark mt-1">
                  Sol panelden bileşen sürükleyin · Script sekmesinde Lua yazın
                </div>
              </div>
            </div>
          )}

          {/* Sol-alt: hızlı toggle'lar — port / grid / snap */}
          <div className="absolute bottom-2 left-2 flex items-center gap-1.5 select-none">
            <CanvasToggleButton
              active={showPorts}
              label="Port"
              tooltip="Portları göster/gizle (P)"
              onClick={() => setShowPorts((v) => !v)}
            />
            <CanvasToggleButton
              active={canvas.showGrid}
              label="Grid"
              tooltip="Grid göster/gizle (G)"
              onClick={() => updateCanvas({ showGrid: !canvas.showGrid })}
            />
            <CanvasToggleButton
              active={canvas.snapEnabled}
              label="Snap"
              tooltip="Grid'e snap (Shift+;)"
              onClick={() => updateCanvas({ snapEnabled: !canvas.snapEnabled })}
            />
            <select
              value={canvas.gridSize}
              onChange={(e) => updateCanvas({ gridSize: Number(e.target.value) as 25 | 50 | 100 })}
              className="text-2xs bg-mf-surface/90 border border-mf-border text-mf-text-dim rounded-sm px-1 py-0.5 font-mono"
              title="Grid aralığı"
            >
              <option value={25}>25 μm</option>
              <option value={50}>50 μm</option>
              <option value={100}>100 μm</option>
            </select>
          </div>

          {/* Sağ-alt: zoom + koordinat (statusbar tamamlayıcı) */}
          <div className="absolute bottom-2 right-2 text-2xs text-mf-text-dim bg-mf-surface/85 px-2 py-1 rounded-sm border border-mf-border font-mono tabular tracking-tight pointer-events-none">
            <span className="tabular">
              {mouseUm.x.toFixed(canvas.zoom < 0.5 ? 0 : canvas.zoom < 2 ? 1 : 2)}, {mouseUm.y.toFixed(canvas.zoom < 0.5 ? 0 : canvas.zoom < 2 ? 1 : 2)} μm
            </span>
            <span className="text-mf-border mx-1.5">·</span>
            <span className="tabular">{(canvas.zoom * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* ─── Context menü ──────────────────────────────────────────────── */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};

// Canvas-içi minik toggle butonu — port/grid/snap için tutarlı görünüm
const CanvasToggleButton: React.FC<{
  active: boolean;
  label: string;
  tooltip: string;
  onClick: () => void;
}> = ({ active, label, tooltip, onClick }) => (
  <button
    title={tooltip}
    aria-label={tooltip}
    aria-pressed={active}
    onClick={onClick}
    className={
      'text-2xs uppercase tracking-caps font-semibold px-1.5 py-0.5 rounded-sm border transition-colors ' +
      (active
        ? 'border-mf-blue/60 text-mf-blue bg-mf-blue/10'
        : 'border-mf-border text-mf-text-dark hover:text-mf-text hover:border-mf-border-strong')
    }
  >
    {label}
  </button>
);

export default CanvasEditor;
