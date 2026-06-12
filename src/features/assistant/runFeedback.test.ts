import { describe, it, expect } from 'vitest';
import { formatRunFeedback } from './runFeedback';
import type { ValidationRow } from '../validation/validation';

const row = (over: Partial<ValidationRow>): ValidationRow => ({
  outletId: 'o1',
  label: 'ÇIKIŞ 1',
  qTarget: 2,
  qActual: 1.96,
  errPct: -2,
  status: 'ok',
  missing: false,
  ...over,
});

describe('formatRunFeedback', () => {
  it('uygun/sınırda durumları işaret ve yüzdeyle özetler', () => {
    const text = formatRunFeedback(
      [
        row({}),
        row({
          outletId: 'o2',
          label: 'ÇIKIŞ 2',
          qActual: 1.12,
          qTarget: 1,
          errPct: 12,
          status: 'warn',
        }),
      ],
      3.08,
    );
    expect(text).toContain('ÇIKIŞ 1: hedef 2.00 → fiili 1.96 µL/min (-2.0%, uygun)');
    expect(text).toContain('ÇIKIŞ 2: hedef 1.00 → fiili 1.12 µL/min (+12.0%, sınırda)');
    expect(text).toContain('Toplam 3.08 µL/min');
  });

  it('eksik çıkış bağlantı uyarısıyla raporlanır', () => {
    const text = formatRunFeedback(
      [row({ missing: true, qActual: null, errPct: null, status: 'fail' })],
      0,
    );
    expect(text).toContain('sonuç yok (bağlantıyı kontrol edin)');
  });
});
