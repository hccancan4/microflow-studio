/**
 * useSimulationRun — analitik ağ çözümü + 2D CFD koşumu.
 * `simulation-progress` Tauri event dinleyicisini de kurar.
 * Davranış App.tsx'ten birebir taşındı (aynı state okumaları, çağrı sırası).
 */
import { useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useSimulationStore } from '../stores/useSimulationStore';
import { useDesignStore } from '../stores/useDesignStore';
import { useSweepStore } from '../stores/useSweepStore';
import { toast } from '../stores/useUiStore';
import type { ChipComponent, Connection, RawAnalyticDesignResult, CfdField } from '../types';

export function useSimulationRun(components: ChipComponent[], connections: Connection[]) {
  const { setStatus, setProgress, setResult, setError, reset, params } = useSimulationStore();

  // Tauri progress event'leri — cancelled flag ile race-condition'sız cleanup
  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | null = null;
    listen<{ progress: number; message: string }>('simulation-progress', (event) => {
      setProgress(event.payload.progress, event.payload.message);
    }).then((f) => {
      if (cancelled) f();
      else unlistenFn = f;
    });
    return () => {
      cancelled = true;
      if (unlistenFn) unlistenFn();
    };
  }, [setProgress]);

  // Analitik simülasyon — tüm tasarım ağını çözer
  const handleRunAnalytic = useCallback(async () => {
    // Aynı anda iki simülasyon koşmasın — sonuçlar birbirini eziyor
    if (useSimulationStore.getState().status === 'running') return;
    if (useSweepStore.getState().running) return;
    if (components.length === 0) {
      toast.warn("Önce canvas'a bileşen ekleyin.");
      return;
    }
    reset();
    setStatus('running');
    setProgress(10, 'Ağ grafı oluşturuluyor...');
    try {
      setProgress(40, 'Direnç ağı çözülüyor (Hagen-Poiseuille)...');
      // Rust'a gönderilen component/connection şekli zaten camelCase alanlar içeriyor;
      // serde rename attribute'leri frontend tipleriyle eşleşmeli.
      const res = await invoke<RawAnalyticDesignResult>('run_analytic_network', {
        req: {
          components,
          connections,
          inlet_pressure: params.inletPressure ?? 1000,
          fluid_viscosity: params.fluidProperties.viscosity,
          fluid_density: params.fluidProperties.density,
        },
      });

      setProgress(90, 'Sonuçlar işleniyor...');
      // Rust snake_case → TypeScript camelCase dönüşümü
      // Her numerik alanı NaN / Infinity karşısında koruyalım
      const safeNum = (v: unknown): number => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };
      setResult({
        mode: 'analytic',
        timestamp: new Date().toISOString(),
        analyticResults: (res.results ?? []).map((r) => ({
          componentId: r.component_id ?? '',
          flowRate: safeNum(r.flow_rate),
          pressureDrop: safeNum(r.pressure_drop),
          reynoldsNumber: safeNum(r.reynolds_number),
          resistance: safeNum(r.resistance),
          deanNumber: r.dean_number != null ? safeNum(r.dean_number) : undefined,
          mixingEfficiency: r.mixing_efficiency != null ? safeNum(r.mixing_efficiency) : undefined,
        })),
        networkPaths: res.paths ?? [],
        velocityProfiles: res.profiles ?? [],
        summary: {
          maxVelocity: safeNum(res.max_velocity),
          minPressure: safeNum(res.min_pressure),
          maxPressure: safeNum(res.max_pressure),
          totalFlowRate: safeNum(res.total_flow_rate),
        },
      });
      setProgress(100, 'Tamamlandı');
    } catch (err) {
      setError(`Analitik simülasyon hatası: ${err}`);
    }
  }, [components, connections, params, reset, setStatus, setProgress, setResult, setError]);

  // CFD simülasyonu
  // Seçili bir straight_channel varsa onun geometrisini kullan; yoksa ilk straight_channel.
  // Böylece user "hangi bileşen üstünde CFD çalışsın?" sorusunu seçimle cevaplar.
  const handleRunCfd = useCallback(async () => {
    // Aynı anda iki simülasyon koşmasın
    if (useSimulationStore.getState().status === 'running') return;
    if (useSweepStore.getState().running) return;
    if (components.length === 0) {
      toast.warn("Önce canvas'a bileşen ekleyin.");
      return;
    }

    // CFD hedefi: seçili straight_channel veya ilk straight_channel
    const selectedIds = useDesignStore.getState().selectedIds;
    const candidates = components.filter((c) => c.type === 'straight_channel');
    const target =
      components.find((c) => selectedIds.includes(c.id) && c.type === 'straight_channel')
      ?? candidates[0];

    if (!target) {
      toast.warn("CFD için bir Düz Kanal bileşeni gereklidir. Canvas'a ekleyin ve seçin.");
      return;
    }

    const p = target.params as { width: number; length: number; depth: number };
    const channelWidth  = p.length; // akım yönü (x) uzunluğu
    const channelHeight = p.width;  // en-kesit (y)
    const depthM = p.depth * 1e-6;

    // Analitik ön-çözüm: aynı geometride Hagen-Poiseuille inlet hızı
    // u_avg = ΔP · h² / (12 · μ · L)  (2D paralel levhalar yaklaşımı)
    const dP = params.inletPressure ?? 1000;
    const hM = channelHeight * 1e-6;
    const lM = channelWidth * 1e-6;
    const uAvg = (dP * hM * hM) / (12 * params.fluidProperties.viscosity * lM);

    reset();
    setStatus('running');
    setProgress(2, `CFD başlatılıyor — "${target.label ?? target.type}" kanalı üzerinde`);

    // Hedef bileşeni overlay için store'a kaydet
    useSimulationStore.getState().setCfdTargetComponentId(target.id);

    try {
      const resMap: Record<string, { nx: number; ny: number; iter: number }> = {
        coarse: { nx: 60,  ny: 16, iter: 400 },
        medium: { nx: 100, ny: 24, iter: 800 },
        fine:   { nx: 160, ny: 36, iter: 1400 },
      };
      const grid = resMap[params.gridResolution] ?? resMap.medium;

      const cfdField = await invoke<CfdField>('run_cfd_simulation', {
        req: {
          channel_width_um:  channelWidth,
          channel_height_um: channelHeight,
          inlet_velocity:    uAvg,
          nx: grid.nx,
          ny: grid.ny,
          max_iterations:    Math.max(params.maxIterations, grid.iter),
          fluid_viscosity:   params.fluidProperties.viscosity,
          fluid_density:     params.fluidProperties.density,
        },
      });

      const maxV = cfdField.magnitude.reduce((m: number, v: number) => v > m ? v : m, 0);
      const minP = cfdField.pressure.reduce((m: number, v: number) => v < m ? v : m, Infinity);
      const maxP = cfdField.pressure.reduce((m: number, v: number) => v > m ? v : m, -Infinity);
      // Debi (μL/min): Q = u_avg · A = u_avg · (w · depth)
      const qMicroLMin = uAvg * hM * depthM * 1e9 * 60;

      setResult({
        mode: 'cfd',
        timestamp: new Date().toISOString(),
        cfdField,
        summary: {
          maxVelocity: maxV,
          minPressure: Number.isFinite(minP) ? minP : 0,
          maxPressure: Number.isFinite(maxP) ? maxP : 0,
          totalFlowRate: qMicroLMin,
        },
      });
    } catch (err) {
      setError(`CFD simülasyon hatası: ${err}`);
    }
  }, [components, params, reset, setStatus, setProgress, setResult, setError]);

  return { handleRunAnalytic, handleRunCfd };
}
