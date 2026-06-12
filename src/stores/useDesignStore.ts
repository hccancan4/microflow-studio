import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { ChipComponent, Connection, CanvasState } from '../types';
import { worldBbox } from '../utils/componentBbox';

// ─── Undo/Redo geçmişi ───────────────────────────────────────────────────────
interface HistoryEntry {
  components: ChipComponent[];
  connections: Connection[];
  label: string; // hangi eylem olduğunu açıklar (debug için)
}

/** Maksimum geri-al adımı. Aşılınca en eski undo girdisi düşer. */
const MAX_HISTORY = 50;

/** Mevcut tasarımın derin-kopya snapshot'ı (history girdisi — referans paylaşmaz). */
function makeSnapshot(
  components: ChipComponent[],
  connections: Connection[],
  label: string,
): HistoryEntry {
  return {
    components: JSON.parse(JSON.stringify(components)),
    connections: JSON.parse(JSON.stringify(connections)),
    label,
  };
}

// ─── Clipboard ───────────────────────────────────────────────────────────────
interface ClipboardEntry {
  components: ChipComponent[];
  connections: Connection[]; // kopyalanan bileşenler arası iç bağlantılar
}

// ─── Bağlantı çizme ara durumu ───────────────────────────────────────────────
export interface PendingConnection {
  fromComponentId: string;
  fromPortIndex: number;
  fromPortPos: { x: number; y: number }; // canvas koordinatları (μm)
  currentMousePos: { x: number; y: number };
}

interface DesignState {
  // ── Veriler ────────────────────────────────────────────────────────────────
  components: ChipComponent[];
  connections: Connection[];
  canvas: CanvasState;

  // ── Seçim ─────────────────────────────────────────────────────────────────
  selectedIds: string[];
  /** Tek bir bağlantının seçimi — bileşen seçiminden bağımsız.
   *  Line click → buraya yazılır; Delete tuşu önce bağlantıyı siler. */
  selectedConnectionId: string | null;

  // ── Geçmiş — iki yığın (maks MAX_HISTORY adım) ────────────────────────────
  /** Geri alınabilir durumlar — her biri bir mutasyondan ÖNCEki snapshot. */
  undoStack: HistoryEntry[];
  /** İleri alınabilir durumlar — undo ile terk edilen; yeni aksiyonda temizlenir. */
  redoStack: HistoryEntry[];

  // ── Clipboard ─────────────────────────────────────────────────────────────
  clipboard: ClipboardEntry | null;

  // ── Bağlantı çizme ara durumu ─────────────────────────────────────────────
  pendingConnection: PendingConnection | null;

  // ── Drag esnasında geçici offset (history'e GİRMEZ) ──────────────────────
  /** Sürüklenen bileşenlerin canlı dx/dy delta'sı. Bağlantı çizgilerinin
   *  drag esnasında dinamik render edilmesi için. */
  dragOffset: Record<string, { dx: number; dy: number }> | null;

  // ─── Eylemler ──────────────────────────────────────────────────────────────

  // Bileşenler
  addComponent: (component: ChipComponent) => void;
  addComponents: (components: ChipComponent[]) => void;
  updateComponent: (id: string, updates: Partial<ChipComponent>) => void;
  moveComponents: (moves: { id: string; dx: number; dy: number }[]) => void;
  removeComponent: (id: string) => void;
  removeComponents: (ids: string[]) => void;

  // Bağlantılar
  addConnection: (connection: Connection) => void;
  removeConnection: (id: string) => void;
  removeConnectionsByComponent: (compId: string) => void;
  setSelectedConnection: (id: string | null) => void;

  // Seçim
  setSelected: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  selectAll: () => void;

  // Canvas
  updateCanvas: (updates: Partial<CanvasState>) => void;
  /** Cursor (veya viewport merkezi) etrafında zoom uygula. */
  zoomBy: (
    factor: number,
    anchorScreenPx?: { x: number; y: number },
    viewport?: { w: number; h: number },
  ) => void;
  /** Zoom 100% + pan'ı default'a sıfırla. */
  zoomReset: () => void;
  /** Tüm bileşenleri kapsayan bbox'ı viewport'a sığdır. */
  fitAll: (viewportW: number, viewportH: number) => void;
  /** Viewport'u bilmeyen katmanlar (script dispatcher) fit-all İSTER;
   *  CanvasEditor sayacı izleyip gerçek fitAll'u çağırır. */
  fitAllRequest: number;
  requestFitAll: () => void;

  // Transform
  /** Seçili bileşenleri delta derece kadar döndür — tek history kaydı. */
  rotateSelected: (deltaDeg: number) => void;

  // Drag offset (canlı bağlantı çizimi için)
  setDragOffset: (offset: Record<string, { dx: number; dy: number }> | null) => void;

  // Undo / Redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  pushHistory: (label: string) => void;

  // Copy / Paste
  copySelected: () => void;
  pasteClipboard: () => void;
  duplicateSelected: () => void;

  // Bağlantı çizme
  startConnection: (pending: PendingConnection) => void;
  updateConnectionMouse: (pos: { x: number; y: number }) => void;
  cancelConnection: () => void;

  // Proje
  clearDesign: () => void;
  loadDesign: (components: ChipComponent[], connections: Connection[]) => void;
}

// ─── Sabitler ────────────────────────────────────────────────────────────────
const DEFAULT_CANVAS: CanvasState = {
  width: 50000,
  height: 30000,
  unit: 'um',
  gridSize: 50,
  showGrid: true,
  showRuler: true,
  snapEnabled: true,
  zoom: 1,
  panX: 40,
  panY: 40,
};

// Canvas zoom clamp — tek kaynak. CanvasEditor wheel-zoom da bunları kullanır
// (önceden inline 0.02/20 olarak tekrarlanıyordu).
export const ZOOM_MIN = 0.02;
export const ZOOM_MAX = 20;

let _nextId = 1;
export function generateId(prefix = 'comp'): string {
  return `${prefix}_${Date.now()}_${_nextId++}`;
}

/** Grid'e snap et */
export function snapToGrid(val: number, grid: number): number {
  return Math.round(val / grid) * grid;
}

// ─── Store ───────────────────────────────────────────────────────────────────
export const useDesignStore = create<DesignState>()(
  subscribeWithSelector((set, get) => ({
    components: [],
    connections: [],
    canvas: DEFAULT_CANVAS,
    selectedIds: [],
    selectedConnectionId: null,
    undoStack: [],
    redoStack: [],
    clipboard: null,
    pendingConnection: null,
    dragOffset: null,

    // ── Geçmiş — iki yığın modeli ──────────────────────────────────────────
    // pushHistory mutasyondan ÖNCE çağrılır: mevcut (mutasyon-öncesi) durumu
    // undo yığınına iter ve redo dalını terk eder. undo/redo, geçişten önce
    // mevcut durumu karşı yığına kaydeder → her ikisi de tam bir adım hareket eder.
    pushHistory: (label = '') => {
      const { components, connections, undoStack } = get();
      const newUndo = [...undoStack, makeSnapshot(components, connections, label)];
      if (newUndo.length > MAX_HISTORY) newUndo.shift(); // en eski adım düşer
      set({ undoStack: newUndo, redoStack: [] }); // yeni aksiyon redo'yu temizler
    },

    undo: () => {
      const { components, connections, undoStack, redoStack } = get();
      if (undoStack.length === 0) return; // sınırda no-op
      const prev = undoStack[undoStack.length - 1];
      // Mevcut durumu redo yığınına kaydet, sonra önceki duruma dön.
      const current = makeSnapshot(components, connections, prev.label);
      set({
        components: JSON.parse(JSON.stringify(prev.components)),
        connections: JSON.parse(JSON.stringify(prev.connections)),
        undoStack: undoStack.slice(0, -1),
        redoStack: [...redoStack, current],
        selectedIds: [],
        pendingConnection: null,
      });
    },

    redo: () => {
      const { components, connections, undoStack, redoStack } = get();
      if (redoStack.length === 0) return; // sınırda no-op
      const next = redoStack[redoStack.length - 1];
      // Mevcut durumu undo yığınına geri koy, sonra ileri duruma git.
      const current = makeSnapshot(components, connections, next.label);
      set({
        components: JSON.parse(JSON.stringify(next.components)),
        connections: JSON.parse(JSON.stringify(next.connections)),
        undoStack: [...undoStack, current],
        redoStack: redoStack.slice(0, -1),
        selectedIds: [],
        pendingConnection: null,
      });
    },

    canUndo: () => get().undoStack.length > 0,
    canRedo: () => get().redoStack.length > 0,

    // ── Bileşenler ───────────────────────────────────────────────────────────
    addComponent: (component) => {
      get().pushHistory('bileşen ekle');
      set((s) => ({ components: [...s.components, component] }));
    },

    addComponents: (components) => {
      get().pushHistory('bileşenler ekle');
      set((s) => ({ components: [...s.components, ...components] }));
    },

    updateComponent: (id, updates) => {
      set((s) => ({
        components: s.components.map((c) => (c.id === id ? { ...c, ...updates } : c)),
      }));
    },

    /** Seçili bileşenleri toplu taşı — tek history kaydı */
    moveComponents: (moves) => {
      get().pushHistory('taşı');
      const delta = new Map(moves.map((m) => [m.id, { dx: m.dx, dy: m.dy }]));
      set((s) => ({
        components: s.components.map((c) => {
          const d = delta.get(c.id);
          if (!d) return c;
          return { ...c, position: { x: c.position.x + d.dx, y: c.position.y + d.dy } };
        }),
      }));
    },

    removeComponent: (id) => {
      get().pushHistory('bileşen sil');
      set((s) => ({
        components: s.components.filter((c) => c.id !== id),
        connections: s.connections.filter(
          (cn) => cn.fromComponentId !== id && cn.toComponentId !== id,
        ),
        selectedIds: s.selectedIds.filter((sid) => sid !== id),
      }));
    },

    removeComponents: (ids) => {
      get().pushHistory('bileşenler sil');
      const idSet = new Set(ids);
      set((s) => ({
        components: s.components.filter((c) => !idSet.has(c.id)),
        connections: s.connections.filter(
          (cn) => !idSet.has(cn.fromComponentId) && !idSet.has(cn.toComponentId),
        ),
        selectedIds: s.selectedIds.filter((sid) => !idSet.has(sid)),
      }));
    },

    // ── Bağlantılar ──────────────────────────────────────────────────────────
    addConnection: (connection) => {
      // Aynı port-çifti (veya tersi) zaten bağlıysa sessizce yok say — kullanıcı
      // iki kez tıklamış olabilir. Her port tek bağlantı tutar.
      const {
        fromComponentId: a,
        fromPortIndex: ap,
        toComponentId: b,
        toPortIndex: bp,
      } = connection;
      // Self-loop guard: bir port kendine bağlanamaz (analytic.rs'de DFS'i sonsuz dolaştırır)
      if (a === b && ap === bp) return;
      const exists = get().connections.some(
        (c) =>
          (c.fromComponentId === a &&
            c.fromPortIndex === ap &&
            c.toComponentId === b &&
            c.toPortIndex === bp) ||
          (c.fromComponentId === b &&
            c.fromPortIndex === bp &&
            c.toComponentId === a &&
            c.toPortIndex === ap),
      );
      if (exists) return;
      // Bir ucu zaten başka bir bağlantıda olan port'lara ek bağlantı kurmayı
      // engelle — port-başına tek bağlantı invariant'ı.
      const portBusy = (cid: string, pi: number) =>
        get().connections.some(
          (c) =>
            (c.fromComponentId === cid && c.fromPortIndex === pi) ||
            (c.toComponentId === cid && c.toPortIndex === pi),
        );
      if (portBusy(a, ap) || portBusy(b, bp)) return;

      get().pushHistory('bağlantı ekle');
      set((s) => ({ connections: [...s.connections, connection] }));
    },

    removeConnection: (id) => {
      get().pushHistory('bağlantı sil');
      set((s) => ({
        connections: s.connections.filter((c) => c.id !== id),
        selectedConnectionId: s.selectedConnectionId === id ? null : s.selectedConnectionId,
      }));
    },

    removeConnectionsByComponent: (compId) => {
      set((s) => ({
        connections: s.connections.filter(
          (c) => c.fromComponentId !== compId && c.toComponentId !== compId,
        ),
      }));
    },

    setSelectedConnection: (id) => set({ selectedConnectionId: id }),

    // ── Seçim ────────────────────────────────────────────────────────────────
    setSelected: (ids) => set({ selectedIds: ids }),

    addToSelection: (id) =>
      set((s) => ({
        selectedIds: s.selectedIds.includes(id) ? s.selectedIds : [...s.selectedIds, id],
      })),

    toggleSelection: (id) =>
      set((s) => ({
        selectedIds: s.selectedIds.includes(id)
          ? s.selectedIds.filter((x) => x !== id)
          : [...s.selectedIds, id],
      })),

    clearSelection: () => set({ selectedIds: [] }),

    selectAll: () => set((s) => ({ selectedIds: s.components.map((c) => c.id) })),

    // ── Canvas ───────────────────────────────────────────────────────────────
    updateCanvas: (updates) => set((s) => ({ canvas: { ...s.canvas, ...updates } })),

    /** Anchor (ekran-px) etrafında zoom uygula. anchor verilmezse viewport
     *  merkezinde zoom yapar (klavye Ctrl+= / Ctrl+- için). */
    zoomBy: (factor, anchorScreenPx, viewport) => {
      const c = get().canvas;
      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, c.zoom * factor));
      if (newZoom === c.zoom) return;
      // Anchor varsayılanı: viewport merkezi (varsa); yoksa pan'a göre 400×300
      const ax = anchorScreenPx?.x ?? (viewport ? viewport.w / 2 : 400);
      const ay = anchorScreenPx?.y ?? (viewport ? viewport.h / 2 : 300);
      const worldX = (ax - c.panX) / c.zoom;
      const worldY = (ay - c.panY) / c.zoom;
      set({
        canvas: {
          ...c,
          zoom: newZoom,
          panX: ax - worldX * newZoom,
          panY: ay - worldY * newZoom,
        },
      });
    },

    /** Zoom 100%, pan default'a sıfırla. */
    zoomReset: () =>
      set((s) => ({
        canvas: { ...s.canvas, zoom: 1, panX: DEFAULT_CANVAS.panX, panY: DEFAULT_CANVAS.panY },
      })),

    fitAllRequest: 0,
    requestFitAll: () => set((s) => ({ fitAllRequest: s.fitAllRequest + 1 })),

    /** Tüm bileşenleri kapsayan bbox → viewport'a sığdır (10% padding). */
    fitAll: (viewportW, viewportH) => {
      const { components, canvas } = get();
      if (components.length === 0 || viewportW <= 0 || viewportH <= 0) return;
      // componentBbox helper'ı her tip için doğru AABB döndürür
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const c of components) {
        const wb = worldBbox(c);
        if (wb.minX < minX) minX = wb.minX;
        if (wb.minY < minY) minY = wb.minY;
        if (wb.maxX > maxX) maxX = wb.maxX;
        if (wb.maxY > maxY) maxY = wb.maxY;
      }
      if (!Number.isFinite(minX)) return;
      const bboxW = Math.max(1, maxX - minX);
      const bboxH = Math.max(1, maxY - minY);
      const padX = bboxW * 0.1;
      const padY = bboxH * 0.1;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const zoom = Math.max(
        ZOOM_MIN,
        Math.min(
          ZOOM_MAX,
          Math.min(viewportW / (bboxW + 2 * padX), viewportH / (bboxH + 2 * padY)),
        ),
      );
      set({
        canvas: {
          ...canvas,
          zoom,
          panX: viewportW / 2 - cx * zoom,
          panY: viewportH / 2 - cy * zoom,
        },
      });
    },

    /** Seçili bileşenleri delta derece kadar döndür — tek history kaydı.
     *  Tek seçim: kendi origin'i etrafında.
     *  Çoklu seçim: seçim centroid'i (bbox merkezi) etrafında — bileşenlerin
     *  konumları da rotate olur, kendi rotation'ları da delta kadar artar. */
    rotateSelected: (deltaDeg) => {
      const { selectedIds, components } = get();
      if (selectedIds.length === 0) return;
      get().pushHistory('döndür');
      const idSet = new Set(selectedIds);

      if (selectedIds.length === 1) {
        // Tek bileşen: sadece kendi rotation
        set({
          components: components.map((c) =>
            idSet.has(c.id) ? { ...c, rotation: (((c.rotation + deltaDeg) % 360) + 360) % 360 } : c,
          ),
        });
        return;
      }

      // Çoklu seçim: ortak merkez (worldBbox toplama centroid)
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const c of components) {
        if (!idSet.has(c.id)) continue;
        const wb = worldBbox(c);
        if (wb.minX < minX) minX = wb.minX;
        if (wb.minY < minY) minY = wb.minY;
        if (wb.maxX > maxX) maxX = wb.maxX;
        if (wb.maxY > maxY) maxY = wb.maxY;
      }
      if (!Number.isFinite(minX)) return;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const rad = (deltaDeg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      set({
        components: components.map((c) => {
          if (!idSet.has(c.id)) return c;
          // Position'u centroid etrafında rotate et
          const dx = c.position.x - cx;
          const dy = c.position.y - cy;
          return {
            ...c,
            position: {
              x: cx + dx * cos - dy * sin,
              y: cy + dx * sin + dy * cos,
            },
            rotation: (((c.rotation + deltaDeg) % 360) + 360) % 360,
          };
        }),
      });
    },

    /** Drag esnasında geçici offset — bağlantı çizgileri canlı render edilebilsin. */
    setDragOffset: (offset) => set({ dragOffset: offset }),

    // ── Copy / Paste ─────────────────────────────────────────────────────────
    copySelected: () => {
      const { selectedIds, components, connections } = get();
      if (!selectedIds.length) return;
      const idSet = new Set(selectedIds);
      const copiedComponents = components
        .filter((c) => idSet.has(c.id))
        .map((c) => JSON.parse(JSON.stringify(c)));
      // Kopyalanan bileşenler arası iç bağlantıları da kopyala
      const copiedConnections = connections.filter(
        (cn) => idSet.has(cn.fromComponentId) && idSet.has(cn.toComponentId),
      );
      set({ clipboard: { components: copiedComponents, connections: copiedConnections } });
    },

    pasteClipboard: () => {
      const { clipboard, canvas } = get();
      if (!clipboard || !clipboard.components.length) return;
      const OFFSET = canvas.gridSize * 4; // 200μm kaydır
      const idMap = new Map<string, string>();

      get().pushHistory('yapıştır');

      const newComponents = clipboard.components.map((c) => {
        const newId = generateId('comp');
        idMap.set(c.id, newId);
        return {
          ...c,
          id: newId,
          position: {
            x: snapToGrid(c.position.x + OFFSET, canvas.gridSize),
            y: snapToGrid(c.position.y + OFFSET, canvas.gridSize),
          },
        };
      });

      const newConnections = clipboard.connections.map((cn) => ({
        ...cn,
        id: generateId('conn'),
        fromComponentId: idMap.get(cn.fromComponentId)!,
        toComponentId: idMap.get(cn.toComponentId)!,
      }));

      set((s) => ({
        components: [...s.components, ...newComponents],
        connections: [...s.connections, ...newConnections],
        selectedIds: newComponents.map((c) => c.id),
      }));
    },

    duplicateSelected: () => {
      const { selectedIds } = get();
      if (!selectedIds.length) return;
      get().copySelected();
      get().pasteClipboard();
    },

    // ── Bağlantı çizme ───────────────────────────────────────────────────────
    startConnection: (pending) => set({ pendingConnection: pending }),

    updateConnectionMouse: (pos) =>
      set((s) => ({
        pendingConnection: s.pendingConnection
          ? { ...s.pendingConnection, currentMousePos: pos }
          : null,
      })),

    cancelConnection: () => set({ pendingConnection: null }),

    // ── Proje ────────────────────────────────────────────────────────────────
    clearDesign: () =>
      set({
        components: [],
        connections: [],
        selectedIds: [],
        selectedConnectionId: null,
        undoStack: [],
        redoStack: [],
        clipboard: null,
        pendingConnection: null,
        dragOffset: null,
      }),

    loadDesign: (components, connections) =>
      set({
        components,
        connections,
        selectedIds: [],
        selectedConnectionId: null,
        undoStack: [],
        redoStack: [],
        clipboard: null,
        pendingConnection: null,
        dragOffset: null,
      }),
  })),
);
