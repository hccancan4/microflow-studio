/**
 * useScriptDispatcher
 *
 * Lua script tarafından üretilen DesignAction event'lerini
 * dinler ve doğrudan useDesignStore action'larına map'ler.
 *
 * Mimari karar: Script action'ları ve React event action'ları
 * aynı store metodlarını kullanır — böylece:
 *   • Undo/Redo stack'i tek ve tutarlı
 *   • Kaydet/Yükle bozulmaz
 *   • UI geri bildirimleri (selection, dirty flag) ortak
 *
 * Bir script çalıştırıldığında:
 *   1) Rust `execute_script` → N adet `script-action` event + 1 `script-completed`
 *   2) Bu hook her event'i yakalayıp store'a uygular
 *   3) Performance için: çok sayıda action → tek history push
 */
import { useEffect, useRef } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useDesignStore } from '../stores/useDesignStore';
import { useProjectStore } from '../stores/useProjectStore';
import { useSimulationStore, FLUID_PRESETS } from '../stores/useSimulationStore';
import { useValidationStore } from '../features/validation/useValidationStore';
import { toast } from '../stores/useUiStore';
import type { ChipComponent, Connection, SimulationParams } from '../types';

// Rust → Frontend design action tipi (scripting::events::DesignAction ile uyumlu)
export type DesignAction =
  | { type: 'add_component'; component: ChipComponent }
  | { type: 'connect'; connection: Connection }
  | { type: 'update_component'; id: string; updates: Partial<ChipComponent> }
  | { type: 'remove_component'; id: string }
  | { type: 'clear_design' }
  | { type: 'update_canvas'; updates: Record<string, unknown> }
  // ── Meta eylemler (mf.*) — tasarım state'ine DEĞİL, ayar/kuyruk store'larına gider
  | { type: 'set_fluid'; key: string }
  | { type: 'set_inlet_pressure'; pa: number }
  | { type: 'set_target_flow'; outlet_id: string; q_ul_min: number; label?: string | null }
  | {
      type: 'run_simulation';
      mode: 'analytic' | 'cfd';
      resolution?: 'coarse' | 'medium' | 'fine' | null;
    };

/** Tasarım (history'li) eylem tipleri — meta eylemler bunların DIŞINDA kalır. */
const DESIGN_ACTION_TYPES = new Set([
  'add_component',
  'connect',
  'update_component',
  'remove_component',
  'clear_design',
  'update_canvas',
]);

interface ScriptCompletedPayload {
  success: boolean;
  action_count: number;
  elapsed_ms: number;
  error: string | null;
}

export interface ScriptRunStatus {
  running: boolean;
  lastOutput: string;
  lastError: string | null;
  lastActionCount: number;
  lastElapsedMs: number;
}

/**
 * Script action event'lerini dinler ve store'a dispatch eder.
 * Ayrıca script koşu durumunu yerel state'e ayna tutar.
 */
export function useScriptDispatcher(onStatusChange?: (status: ScriptRunStatus) => void) {
  // Aktif batch: bir script koşusu sırasında gelen tüm action'lar
  // tek bir undo stack girdisine düşsün diye buffer'lanır.
  const batch = useRef<DesignAction[]>([]);
  const isCollecting = useRef(false);

  useEffect(() => {
    const unlisten: UnlistenFn[] = [];

    // Bir design action geldi → batch'e ekle
    listen<DesignAction>('script-action', (evt) => {
      batch.current.push(evt.payload);
    }).then((u) => unlisten.push(u));

    // Script çıktısı (print satırları)
    listen<string>('script-output', (evt) => {
      onStatusChange?.({
        running: true,
        lastOutput: evt.payload,
        lastError: null,
        lastActionCount: batch.current.length,
        lastElapsedMs: 0,
      });
    }).then((u) => unlisten.push(u));

    // Script tamamlandı → buffer'ı tek seferde store'a uygula
    listen<ScriptCompletedPayload>('script-completed', (evt) => {
      const actions = batch.current;
      batch.current = [];
      isCollecting.current = false;

      if (evt.payload.success) {
        applyActionBatch(actions);
      }

      onStatusChange?.({
        running: false,
        lastOutput: '',
        lastError: evt.payload.error,
        lastActionCount: evt.payload.action_count,
        lastElapsedMs: evt.payload.elapsed_ms,
      });
    }).then((u) => unlisten.push(u));

    return () => {
      unlisten.forEach((u) => u());
    };
  }, [onStatusChange]);

  return {
    /** Yeni script koşusu başlıyor — buffer'ı temizle */
    reset: () => {
      batch.current = [];
      isCollecting.current = true;
    },
  };
}

/**
 * Birden fazla action'ı store'lara uygular — İKİ BÖLÜM:
 *
 * 1. TASARIM eylemleri (add/connect/update/remove/clear/canvas): tek
 *    `pushHistory` + tek `setState` (tek undo girdisi, tek re-render) + dirty.
 * 2. META eylemler (set_fluid / set_inlet_pressure / set_target_flow /
 *    run_simulation): ayar ve kuyruk store'larına gider; history'ye GİRMEZ,
 *    dirty üretmez. Tasarım eylemlerinden SONRA uygulanır (run istekleri
 *    güncel tasarımı görsün).
 */
export function applyActionBatch(actions: DesignAction[]) {
  if (actions.length === 0) return;

  const design = actions.filter((a) => DESIGN_ACTION_TYPES.has(a.type));
  const meta = actions.filter((a) => !DESIGN_ACTION_TYPES.has(a.type));

  if (design.length > 0) {
    const store = useDesignStore.getState();
    const { setDirty } = useProjectStore.getState();

    // Tüm batch'i tek history girdisi olarak işaretle
    store.pushHistory(`script (${design.length} eylem)`);

    // Manuel uygulama: pushHistory tekrar tetiklenmesin diye doğrudan set state
    let components = [...useDesignStore.getState().components];
    let connections = [...useDesignStore.getState().connections];
    let canvas = { ...useDesignStore.getState().canvas };

    for (const action of design) {
      switch (action.type) {
        case 'clear_design': {
          components = [];
          connections = [];
          // Bayat hedefler yanlış "fail" üretmesin
          useValidationStore.getState().clearTargets();
          break;
        }
        case 'add_component': {
          components = [...components, action.component];
          break;
        }
        case 'connect': {
          connections = [...connections, action.connection];
          break;
        }
        case 'update_component': {
          components = components.map((c) =>
            c.id === action.id ? { ...c, ...action.updates } : c,
          );
          break;
        }
        case 'remove_component': {
          components = components.filter((c) => c.id !== action.id);
          connections = connections.filter(
            (cn) => cn.fromComponentId !== action.id && cn.toComponentId !== action.id,
          );
          break;
        }
        case 'update_canvas': {
          canvas = { ...canvas, ...action.updates };
          break;
        }
      }
    }

    // Tek seferde state güncelle (tek re-render)
    useDesignStore.setState({
      components,
      connections,
      canvas,
      selectedIds: [],
    });
    setDirty(true);
  }

  for (const action of meta) {
    switch (action.type) {
      case 'set_fluid': {
        const preset = FLUID_PRESETS[action.key];
        if (preset) {
          useSimulationStore.getState().setParams({
            fluid: action.key as SimulationParams['fluid'],
            fluidProperties: preset,
          });
        } else {
          toast.warn(`Bilinmeyen akışkan anahtarı: ${action.key}`);
        }
        break;
      }
      case 'set_inlet_pressure': {
        useSimulationStore.getState().setParams({ inletPressure: action.pa });
        break;
      }
      case 'set_target_flow': {
        useValidationStore
          .getState()
          .setTarget(action.outlet_id, action.q_ul_min, action.label ?? undefined);
        break;
      }
      case 'run_simulation': {
        useSimulationStore.getState().enqueueRun({
          mode: action.mode,
          resolution: action.resolution ?? undefined,
        });
        break;
      }
    }
  }
}
