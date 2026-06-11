import { describe, it, expect } from 'vitest';
import { computeValidationRows } from './validation';
import type { OutletFlow } from '../../types';

const flows: OutletFlow[] = [
  { outletId: 'o1', label: 'ÇIKIŞ 1', flowRate: 2.04 }, // hedef 2.0 → +%2 → ok
  { outletId: 'o2', label: 'ÇIKIŞ 2', flowRate: 0.9 }, // hedef 1.0 → -%10 → warn
  { outletId: 'o3', flowRate: 0.5 }, // hedef 1.0 → -%50 → fail
];

describe('computeValidationRows', () => {
  it('eşik durumları: ok ≤%5, warn ≤%15, fail üstü', () => {
    const rows = computeValidationRows({ o1: { q: 2.0 }, o2: { q: 1.0 }, o3: { q: 1.0 } }, flows);
    const byId = Object.fromEntries(rows.map((r) => [r.outletId, r]));
    expect(byId.o1.status).toBe('ok');
    expect(byId.o1.errPct).toBeCloseTo(2.0, 5);
    expect(byId.o2.status).toBe('warn');
    expect(byId.o2.errPct).toBeCloseTo(-10, 5);
    expect(byId.o3.status).toBe('fail');
  });

  it('hedefi olup sonucu olmayan çıkış missing+fail olur', () => {
    const rows = computeValidationRows({ yok: { q: 1.5, label: 'Kayıp' } }, flows);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      outletId: 'yok',
      label: 'Kayıp',
      qActual: null,
      errPct: null,
      status: 'fail',
      missing: true,
    });
  });

  it('etiket önceliği: hedef etiketi > sonuç etiketi > id', () => {
    const rows = computeValidationRows({ o1: { q: 2, label: 'Özel Ad' }, o3: { q: 0.5 } }, flows);
    const byId = Object.fromEntries(rows.map((r) => [r.outletId, r]));
    expect(byId.o1.label).toBe('Özel Ad'); // hedef etiketi kazanır
    expect(byId.o3.label).toBe('o3'); // ikisi de yoksa id
  });

  it('hedefsiz sonuçlar tabloya girmez; satırlar etikete göre sıralı', () => {
    const rows = computeValidationRows(
      { o2: { q: 1 }, o1: { q: 2 } }, // o3 hedefsiz
      flows,
    );
    expect(rows.map((r) => r.outletId)).toEqual(['o1', 'o2']); // ÇIKIŞ 1 < ÇIKIŞ 2
  });

  it('tam isabet %0 sapma ile ok', () => {
    const rows = computeValidationRows({ o1: { q: 2.04 } }, flows);
    expect(rows[0].errPct).toBeCloseTo(0, 9);
    expect(rows[0].status).toBe('ok');
  });
});
