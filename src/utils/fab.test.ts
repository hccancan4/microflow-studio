import { describe, it, expect } from 'vitest';
import { paToMbar, widthBelowFabLimit, W_FAB_MIN_UM, CELL_MM_MIN, CELL_MM_MAX } from './fab';
import { FLUID_PRESETS } from '../stores/useSimulationStore';

describe('fab sabitleri ve birim çevrimi', () => {
  it('paToMbar: 1000 Pa = 10 mbar', () => {
    expect(paToMbar(1000)).toBe(10);
    expect(paToMbar(0)).toBe(0);
    expect(paToMbar(250)).toBe(2.5);
  });

  it('zarf sabitleri spec değerleri', () => {
    expect(W_FAB_MIN_UM).toBe(40);
    expect(CELL_MM_MIN).toBe(10);
    expect(CELL_MM_MAX).toBe(180);
  });

  it('widthBelowFabLimit: dar kanal yakalanır, genişler geçer', () => {
    expect(widthBelowFabLimit({ width: 39 })).toBe(true);
    expect(widthBelowFabLimit({ width: 40 })).toBe(false);
    expect(widthBelowFabLimit({ channelWidth: 30, turns: 8 })).toBe(true);
    expect(widthBelowFabLimit({ orificeWidth: 20 })).toBe(true);
    expect(widthBelowFabLimit({ length: 5, depth: 10 })).toBe(false); // genişlik-dışı alanlar sayılmaz
  });
});

describe('FLUID_PRESETS — spec tablosu (Rust hydraulic.rs ile senkron)', () => {
  it('5 spec akışkanı doğru µ/ρ ile mevcut', () => {
    expect(FLUID_PRESETS.water).toMatchObject({ viscosity: 0.001, density: 1000 });
    expect(FLUID_PRESETS.pbs).toMatchObject({ viscosity: 0.00102, density: 1005 });
    expect(FLUID_PRESETS.plasma).toMatchObject({ viscosity: 0.0015, density: 1025 });
    expect(FLUID_PRESETS.etanol).toMatchObject({ viscosity: 0.0011, density: 789 });
    expect(FLUID_PRESETS.gliserol50).toMatchObject({ viscosity: 0.006, density: 1126 });
  });

  it('mevcut akışkanlar korunur (geriye dönük uyum)', () => {
    expect(FLUID_PRESETS.pdms).toMatchObject({ viscosity: 0.097, density: 970 });
    expect(FLUID_PRESETS.oil).toMatchObject({ viscosity: 0.03, density: 860 });
  });

  it('her preset Türkçe etikete sahip', () => {
    for (const f of Object.values(FLUID_PRESETS)) {
      expect(f.name.length).toBeGreaterThan(0);
    }
  });
});
