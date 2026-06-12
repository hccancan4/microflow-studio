import { describe, it, expect } from 'vitest';
import { buildAutoDesignLua } from './autoDesignLua';
import type { BranchSpec } from './solveTargets';

const branch = (label: string, q: number, lMm: number): BranchSpec => ({
  label,
  target_q_ul_min: q,
  r_si: 1e13,
  r_disp: 10 / q,
  l_mm: lMm,
  footprint_mm: lMm / 3.5708,
  fits_envelope: lMm <= 180,
  w_flag: false,
  re: 0.3,
});

describe('buildAutoDesignLua', () => {
  const lua = buildAutoDesignLua({
    pInPa: 1000,
    fluidKey: 'water',
    wUm: 100,
    hUm: 80,
    feed: { wUm: 300, lUm: 1000 },
    branches: [branch('ÇIKIŞ 1', 2, 63.5), branch('ÇIKIŞ 2', 1, 127)],
  });

  it('başlık + akışkan + basınç + temizlik içerir', () => {
    expect(lua).toContain('mf.clear()');
    expect(lua).toContain('mf.set_fluid("water")');
    expect(lua).toContain('mf.set_inlet_pressure(1000)');
  });

  it('topoloji: inlet + besleme + N serpantin + N outlet + bağlantılar', () => {
    expect(lua).toContain('mf.add_inlet(');
    expect(lua.match(/mf\.add_channel\(/g)).toHaveLength(1); // besleme
    expect(lua.match(/mf\.add_serpentine\(/g)).toHaveLength(2);
    expect(lua.match(/mf\.add_outlet\(/g)).toHaveLength(2);
    expect(lua).toContain('length_mm = 63.50');
    expect(lua).toContain('length_mm = 127.00');
    // Besleme fan-out'u açık port override ile
    expect(lua.match(/mf\.connect\(feed, s\d, \{ from = 1 \}\)/g)).toHaveLength(2);
  });

  it('hedefler bildirilir ve quick koşar; cfd opsiyonel', () => {
    expect(lua).toContain('mf.set_target_flow(o1, 2)');
    expect(lua).toContain('mf.set_target_flow(o2, 1)');
    expect(lua).toContain('mf.run_quick()');
    expect(lua).not.toContain('mf.run_cfd');

    const withCfd = buildAutoDesignLua({
      pInPa: 1000,
      fluidKey: 'water',
      wUm: 100,
      hUm: 80,
      feed: { wUm: 300, lUm: 1000 },
      branches: [branch('A', 1, 100)],
      runCfd: true,
    });
    expect(withCfd).toContain('mf.run_cfd("kaba")');
  });

  it('dallar düşeyde çakışmaz (ayak izi + boşluk kadar aralık)', () => {
    const ys = [...lua.matchAll(/mf\.add_serpentine\((\d+), (\d+)/g)].map((m) => parseInt(m[2]));
    expect(ys).toHaveLength(2);
    const minGap = (63.5 * 1000) / 3.5708; // ilk dalın ayak izi
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(minGap);
  });
});
