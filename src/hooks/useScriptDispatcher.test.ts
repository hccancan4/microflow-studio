import { describe, it, expect, beforeEach } from 'vitest';
import { applyActionBatch, type DesignAction } from './useScriptDispatcher';
import { useDesignStore } from '../stores/useDesignStore';
import { useProjectStore } from '../stores/useProjectStore';
import { useSimulationStore, FLUID_PRESETS } from '../stores/useSimulationStore';
import { useValidationStore } from '../features/validation/useValidationStore';
import type { ChipComponent } from '../types';

// applyActionBatch'in PARTITION davranışı: tasarım eylemleri tek history'li
// batch; meta eylemler (set_fluid/pressure/target/run) history-dirty ÜRETMEZ.

function comp(id: string): ChipComponent {
  return {
    id,
    type: 'port',
    position: { x: 0, y: 0 },
    rotation: 0,
    params: { diameter: 500, portType: 'inlet' },
    ports: [],
  } as unknown as ChipComponent;
}

beforeEach(() => {
  useDesignStore.getState().clearDesign();
  useProjectStore.getState().setDirty(false);
  useSimulationStore.setState({
    runQueue: [],
    params: {
      mode: 'analytic',
      fluid: 'water',
      fluidProperties: FLUID_PRESETS.water,
      inletPressure: 1000,
      gridResolution: 'medium',
      maxIterations: 500,
    },
  });
  useValidationStore.getState().clearTargets();
});

describe('applyActionBatch — meta eylemler', () => {
  it('yalnız-meta batch history ve dirty üretmez', () => {
    applyActionBatch([{ type: 'set_inlet_pressure', pa: 2500 }]);
    expect(useSimulationStore.getState().params.inletPressure).toBe(2500);
    expect(useDesignStore.getState().canUndo()).toBe(false); // history girdisi yok
    expect(useProjectStore.getState().isDirty).toBe(false);
  });

  it('set_fluid geçerli anahtar ile akışkanı değiştirir', () => {
    applyActionBatch([{ type: 'set_fluid', key: 'pdms' }]);
    const p = useSimulationStore.getState().params;
    expect(p.fluid).toBe('pdms');
    expect(p.fluidProperties.viscosity).toBeCloseTo(0.097);
  });

  it('set_fluid bilinmeyen anahtarı yok sayar (params değişmez)', () => {
    applyActionBatch([{ type: 'set_fluid', key: 'xyz-yok' }]);
    expect(useSimulationStore.getState().params.fluid).toBe('water');
  });

  it('run_simulation kuyruğa düşer', () => {
    applyActionBatch([
      { type: 'run_simulation', mode: 'analytic' },
      { type: 'run_simulation', mode: 'cfd', resolution: 'coarse' },
    ]);
    const q = useSimulationStore.getState().runQueue;
    expect(q).toHaveLength(2);
    expect(q[0]).toEqual({ mode: 'analytic', resolution: undefined });
    expect(q[1]).toEqual({ mode: 'cfd', resolution: 'coarse' });
  });

  it('set_target_flow doğrulama hedefini yazar', () => {
    applyActionBatch([
      { type: 'set_target_flow', outlet_id: 'out1', q_ul_min: 2, label: 'ÇIKIŞ 1' },
    ]);
    expect(useValidationStore.getState().targets.out1).toEqual({ q: 2, label: 'ÇIKIŞ 1' });
  });
});

describe('applyActionBatch — tasarım + meta karışık', () => {
  it('tasarım eylemleri TEK history girdisi + dirty; meta sonra uygulanır', () => {
    const actions: DesignAction[] = [
      { type: 'add_component', component: comp('a') },
      { type: 'add_component', component: comp('b') },
      { type: 'set_inlet_pressure', pa: 1500 },
      { type: 'run_simulation', mode: 'analytic' },
    ];
    applyActionBatch(actions);

    expect(useDesignStore.getState().components.map((c) => c.id)).toEqual(['a', 'b']);
    expect(useProjectStore.getState().isDirty).toBe(true);
    expect(useSimulationStore.getState().params.inletPressure).toBe(1500);
    expect(useSimulationStore.getState().runQueue).toHaveLength(1);

    // İki ekleme + meta'lar → tek undo adımı (batch semantiği)
    useDesignStore.getState().undo();
    expect(useDesignStore.getState().components).toHaveLength(0);
  });

  it('clear_design doğrulama hedeflerini de temizler', () => {
    useValidationStore.getState().setTarget('eski', 5);
    applyActionBatch([{ type: 'clear_design' }]);
    expect(useValidationStore.getState().targets).toEqual({});
  });

  it('aynı id ile çift add_component/connect TEK uygulanır (çift-event savunması)', () => {
    // Regresyon: StrictMode'da yarışlı listener kaydı her action'ı iki kez
    // düşürüyordu → üst üste kopyalar + çözücüde şişmiş debi.
    const c = comp('dup');
    const conn = {
      id: 'conn-dup',
      fromComponentId: 'dup',
      fromPortIndex: 0,
      toComponentId: 'dup2',
      toPortIndex: 0,
    };
    applyActionBatch([
      { type: 'clear_design' },
      { type: 'clear_design' },
      { type: 'add_component', component: c },
      { type: 'add_component', component: c },
      { type: 'add_component', component: comp('dup2') },
      { type: 'add_component', component: comp('dup2') },
      { type: 'connect', connection: conn },
      { type: 'connect', connection: conn },
    ]);
    const s = useDesignStore.getState();
    expect(s.components.map((x) => x.id)).toEqual(['dup', 'dup2']);
    expect(s.connections).toHaveLength(1);
  });

  it('bileşen ekleyen batch fit-all isteği bırakır; eklemeyen bırakmaz', () => {
    const before = useDesignStore.getState().fitAllRequest;
    applyActionBatch([{ type: 'set_inlet_pressure', pa: 1200 }]);
    expect(useDesignStore.getState().fitAllRequest).toBe(before); // meta-only → istek yok
    applyActionBatch([{ type: 'add_component', component: comp('f1') }]);
    expect(useDesignStore.getState().fitAllRequest).toBe(before + 1);
  });
});
