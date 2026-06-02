/**
 * sweepRunner — Parametre tarama sıralı yürütücüsü (Faz 6B).
 *
 * Her bir `paramValue` için hedef bileşenin parametresini yeniden yazıp
 * `run_analytic_network` komutunu çağırır. Her koşu sonunda store'a sonuç
 * eklenir; UI reaktif olarak ilerlemeyi gösterir.
 */
import { invoke } from '@tauri-apps/api/core';
import type { ChipComponent, Connection, FluidProperties } from '../types';
import { useSweepStore, buildSweepValues, type SweepConfig, type SweepRun } from '../stores/useSweepStore';
import { withOverriddenParam } from './sweepHelpers';

export interface SweepRunnerArgs {
  components: ChipComponent[];
  connections: Connection[];
  inletPressure: number;
  fluid: FluidProperties;
  config: SweepConfig;
}

/** Tek bir analitik koşuyu çalıştırır ve SweepRun satırı üretir. */
async function runOnce(
  components: ChipComponent[],
  connections: Connection[],
  inletPressure: number,
  fluid: FluidProperties,
  targetId: string,
  paramValue: number,
): Promise<SweepRun> {
  // paramKey'i store yerine doğrudan args'tan alıyoruz — store henüz set edilmemiş olabilir
  const cfg = useSweepStore.getState().config;
  if (!cfg) {
    return {
      paramValue, totalFlowRate: 0, totalResistance: 0, maxPressure: 0,
      minPressure: 0, maxVelocity: 0, maxReynolds: 0,
      error: 'Sweep config tanımsız',
    };
  }
  const modified = components.map((c) =>
    c.id === targetId ? withOverriddenParam(c, cfg.paramKey, paramValue) : c
  );

  try {
    const res: any = await invoke('run_analytic_network', {
      req: {
        components: modified,
        connections,
        inlet_pressure: inletPressure,
        fluid_viscosity: fluid.viscosity,
        fluid_density: fluid.density,
      },
    });

    const results: any[] = res.results ?? [];
    const comp = results.find((r) => r.component_id === targetId);
    const maxRe = results.reduce((m, r) => Math.max(m, r.reynolds_number ?? 0), 0);

    return {
      paramValue,
      totalFlowRate: res.total_flow_rate ?? 0,
      totalResistance: res.total_resistance ?? 0,
      maxPressure: res.max_pressure ?? 0,
      minPressure: res.min_pressure ?? 0,
      maxVelocity: res.max_velocity ?? 0,
      maxReynolds: maxRe,
      componentFlowRate: comp?.flow_rate,
      componentPressureDrop: comp?.pressure_drop,
      componentReynolds: comp?.reynolds_number,
    };
  } catch (err) {
    return {
      paramValue,
      totalFlowRate: 0,
      totalResistance: 0,
      maxPressure: 0,
      minPressure: 0,
      maxVelocity: 0,
      maxReynolds: 0,
      error: String(err),
    };
  }
}

/** Tarama sürecini başlatır — sıralı çalışır, store'a yazar. */
export async function runSweep(args: SweepRunnerArgs): Promise<void> {
  const { components, connections, inletPressure, fluid, config } = args;
  const store = useSweepStore.getState();
  store.startSweep(config);

  const values = buildSweepValues(config.start, config.end, config.steps);

  // try/finally: invoke veya başka bir senkron exception'da running=true kilitlenmesin
  try {
    for (let i = 0; i < values.length; i++) {
      if (useSweepStore.getState().cancelRequested) break;
      useSweepStore.getState().setProgress(i, values.length);
      const run = await runOnce(components, connections, inletPressure, fluid, config.componentId, values[i]);
      useSweepStore.getState().appendRun(run);
      // Yield to UI — React'ın render fırsatı bulması için (microtask yeterli, setTimeout 4ms cezası yok)
      await Promise.resolve();
    }
  } finally {
    useSweepStore.getState().setProgress(values.length, values.length);
    useSweepStore.getState().finishSweep();
  }
}

/** Sonuçları CSV formatında string olarak üret. */
export function sweepResultsToCsv(config: SweepConfig, runs: SweepRun[]): string {
  const header = [
    `${config.paramLabel} (${config.unit})`,
    'Toplam Debi (μL/min)',
    'Maks Basınç (Pa)',
    'Min Basınç (Pa)',
    'Maks Hız (m/s)',
    'Maks Re',
    'Bileşen Debi (μL/min)',
    'Bileşen ΔP (Pa)',
    'Bileşen Re',
    'Hata',
  ].join(',');

  const lines = runs.map((r) =>
    [
      r.paramValue,
      r.totalFlowRate,
      r.maxPressure,
      r.minPressure,
      r.maxVelocity,
      r.maxReynolds,
      r.componentFlowRate ?? '',
      r.componentPressureDrop ?? '',
      r.componentReynolds ?? '',
      r.error ? `"${r.error.replace(/"/g, '""')}"` : '',
    ].join(',')
  );

  return [header, ...lines].join('\n');
}
