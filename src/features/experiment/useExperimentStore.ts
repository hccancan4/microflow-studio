/**
 * useExperimentStore — Yüklenen deney veri setlerinin state'i.
 *
 * Birden fazla ExperimentDataSet tutulur; her birinin görünürlüğü, rengi ve
 * hangi bileşen / eksene ait olduğu (velocity profile, CFD 2D, vs.) bağımsız
 * yönetilir. ResultsPanel bu store'dan okur; Faz 6A karşılaştırma iş akışının
 * tek kaynağıdır.
 *
 * Not: Kalıcılık — dataset'ler MFlowProject.experimentData'ya `buildProjectPayload`
 * içinden eklenir (Faz 6A sonunda); yükleme sırasında bu store doldurulur.
 */
import { create } from 'zustand';
import type { ExperimentDataSet, ExperimentDataPoint } from '../../types';

const PALETTE = [
  '#ff7043', '#ba68c8', '#ffd54f', '#4dd0e1',
  '#aed581', '#f06292', '#7986cb', '#a1887f',
];

interface ExperimentState {
  datasets: ExperimentDataSet[];
  /** Görünür (checkbox açık) dataset id'leri. */
  visibleIds: Set<string>;
  /** Hangi bileşenin profil kesitine iliştirilecek (velocity dataset filtresi). */
  linkedComponentId: Record<string, string | null>; // dataset.id → componentId

  addDataset: (d: ExperimentDataSet) => void;
  removeDataset: (id: string) => void;
  updateDataset: (id: string, patch: Partial<ExperimentDataSet>) => void;
  toggleVisible: (id: string) => void;
  setVisible: (id: string, v: boolean) => void;
  linkComponent: (datasetId: string, componentId: string | null) => void;
  clear: () => void;
  replaceAll: (datasets: ExperimentDataSet[]) => void;

  /** Palette'den bir sonraki rengi seç. */
  nextColor: () => string;
}

export const useExperimentStore = create<ExperimentState>()((set, get) => ({
  datasets: [],
  visibleIds: new Set<string>(),
  linkedComponentId: {},

  addDataset: (d) =>
    set((s) => {
      const vis = new Set(s.visibleIds);
      vis.add(d.id);
      return { datasets: [...s.datasets, d], visibleIds: vis };
    }),

  removeDataset: (id) =>
    set((s) => {
      const vis = new Set(s.visibleIds); vis.delete(id);
      const lnk = { ...s.linkedComponentId }; delete lnk[id];
      return {
        datasets: s.datasets.filter((d) => d.id !== id),
        visibleIds: vis,
        linkedComponentId: lnk,
      };
    }),

  updateDataset: (id, patch) =>
    set((s) => ({
      datasets: s.datasets.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    })),

  toggleVisible: (id) =>
    set((s) => {
      const vis = new Set(s.visibleIds);
      if (vis.has(id)) vis.delete(id); else vis.add(id);
      return { visibleIds: vis };
    }),

  setVisible: (id, v) =>
    set((s) => {
      const vis = new Set(s.visibleIds);
      if (v) vis.add(id); else vis.delete(id);
      return { visibleIds: vis };
    }),

  linkComponent: (datasetId, componentId) =>
    set((s) => ({
      linkedComponentId: { ...s.linkedComponentId, [datasetId]: componentId },
    })),

  clear: () => set({ datasets: [], visibleIds: new Set(), linkedComponentId: {} }),

  replaceAll: (datasets) =>
    set({
      datasets,
      visibleIds: new Set(datasets.map((d) => d.id)),
      linkedComponentId: {},
    }),

  nextColor: () => {
    const n = get().datasets.length;
    return PALETTE[n % PALETTE.length];
  },
}));

/** Yardımcı: bir dataset'i (x, value) çiftleri olarak sırayla döndür. */
export function datasetAsPairs(d: ExperimentDataSet): Array<[number, number]> {
  return d.points.map((p: ExperimentDataPoint) => [p.x, p.value] as [number, number]);
}
