/**
 * useValidationStore — çıkış başına HEDEF debiler (µL/min).
 *
 * Kaynaklar: `mf.set_target_flow` (script/copilot) ve Otomatik Tasarım dialogu.
 * Doğrulama sekmesi bu hedefleri analitik sonucun `outletFlows`'u ile
 * karşılaştırır. `clear_design` action'ı hedefleri de temizler (bayat hedef
 * yanlış "fail" üretmesin).
 */
import { create } from 'zustand';

export interface FlowTarget {
  q: number; // µL/min
  label?: string;
}

interface ValidationState {
  /** outletId → hedef */
  targets: Record<string, FlowTarget>;
  setTarget: (outletId: string, q: number, label?: string) => void;
  clearTargets: () => void;
}

export const useValidationStore = create<ValidationState>()((set) => ({
  targets: {},
  setTarget: (outletId, q, label) =>
    set((s) => ({ targets: { ...s.targets, [outletId]: { q, label } } })),
  clearTargets: () => set({ targets: {} }),
}));
