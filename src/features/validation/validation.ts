/**
 * validation.ts — hedef-vs-fiili debi karşılaştırma satırları (saf mantık).
 *
 * Girdiler: useValidationStore.targets (mf.set_target_flow / Oto-Tasarım) ve
 * analitik sonucun outletFlows'u. Eşikler (µFG-paritesi, spec §5):
 *   |sapma| ≤ %5  → ok (yeşil)   ≤ %15 → warn (sarı)   üstü → fail (kırmızı)
 * Hedefi olup sonucu olmayan çıkış "missing" bayrağıyla fail olur.
 */
import type { OutletFlow } from '../../types';
import type { FlowTarget } from './useValidationStore';

export type ValidationStatus = 'ok' | 'warn' | 'fail';

export interface ValidationRow {
  outletId: string;
  label: string;
  qTarget: number; // µL/min
  qActual: number | null; // µL/min — sonuçta yoksa null
  errPct: number | null; // (fiili-hedef)/hedef · 100
  status: ValidationStatus;
  /** Sonuçta karşılığı bulunamadı (bağlantısız çıkış / silinmiş port). */
  missing: boolean;
}

export const ERR_OK_PCT = 5;
export const ERR_WARN_PCT = 15;

export function computeValidationRows(
  targets: Record<string, FlowTarget>,
  outletFlows: OutletFlow[],
): ValidationRow[] {
  const flowById = new Map(outletFlows.map((o) => [o.outletId, o]));

  return Object.entries(targets)
    .map(([outletId, t]) => {
      const actual = flowById.get(outletId);
      const label = t.label ?? actual?.label ?? outletId;
      if (!actual) {
        return {
          outletId,
          label,
          qTarget: t.q,
          qActual: null,
          errPct: null,
          status: 'fail' as const,
          missing: true,
        };
      }
      const errPct = t.q > 0 ? ((actual.flowRate - t.q) / t.q) * 100 : null;
      const abs = errPct === null ? Infinity : Math.abs(errPct);
      const status: ValidationStatus =
        abs <= ERR_OK_PCT ? 'ok' : abs <= ERR_WARN_PCT ? 'warn' : 'fail';
      return {
        outletId,
        label,
        qTarget: t.q,
        qActual: actual.flowRate,
        errPct,
        status,
        missing: false,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'tr'));
}
