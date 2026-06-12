/**
 * useScriptRun — Lua script çalıştırma + çalışma durumu/çıktı biriktirme.
 * useScriptDispatcher ile Tauri script-action/script-completed event'lerini
 * buffer'layıp store'a dispatch eder. Davranış App.tsx'ten birebir taşındı.
 */
import { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useProjectStore } from '../stores/useProjectStore';
import { useScriptDispatcher, type ScriptRunStatus } from './useScriptDispatcher';

/** Tek bir script koşusunun sonucu (Rust ScriptResult'ın özeti). */
export interface ScriptRunOutcome {
  success: boolean;
  error?: string;
}

export function useScriptRun() {
  // Son koşudan gelen çıktı/hata/istatistik
  const [scriptStatus, setScriptStatus] = useState<ScriptRunStatus>({
    running: false,
    lastOutput: '',
    lastError: null,
    lastActionCount: 0,
    lastElapsedMs: 0,
  });
  // Script output'unu biriktir (event'ler parça parça gelebilir)
  const [scriptOutputLog, setScriptOutputLog] = useState<string>('');

  // Lua action event'lerini store'a dispatch eden hook
  const scriptDispatcher = useScriptDispatcher((status) => {
    setScriptStatus(status);
    if (status.running && status.lastOutput) {
      setScriptOutputLog((prev) => prev + status.lastOutput);
    }
  });

  /**
   * Script çalıştır — Lua → DesignAction event'leri → store.
   * `code` verilirse o çalışır (asistan/şablon/oto-tasarım üretimi);
   * verilmezse Script sekmesindeki güncel içerik (`getState` ile okunur —
   * stale closure yok). Dönüş: koşu sonucu — asistanın self-repair döngüsü
   * hata mesajını LM'e geri beslemek için kullanır (execute_script'in
   * ScriptResult'ı; eskiden yok sayılıyordu).
   */
  const runScript = useCallback(
    async (code?: string): Promise<ScriptRunOutcome> => {
      const script = code ?? useProjectStore.getState().scriptContent;
      // Önceki koşunun output/hata bilgisini temizle, buffer'ı sıfırla
      setScriptOutputLog('');
      setScriptStatus({
        running: true,
        lastOutput: '',
        lastError: null,
        lastActionCount: 0,
        lastElapsedMs: 0,
      });
      scriptDispatcher.reset();
      try {
        // Tauri tarafı script-action + script-completed event'leri emit edecek;
        // useScriptDispatcher bunları buffer'layıp tek batch olarak store'a yazar.
        const result = await invoke<{ success: boolean; error: string | null }>('execute_script', {
          script,
        });
        return { success: result.success, error: result.error ?? undefined };
      } catch (err) {
        const error = `IPC hatası: ${err}`;
        setScriptStatus({
          running: false,
          lastOutput: '',
          lastError: error,
          lastActionCount: 0,
          lastElapsedMs: 0,
        });
        return { success: false, error };
      }
    },
    [scriptDispatcher],
  );

  // Geriye dönük isim: Script sekmesinin "Çalıştır" düğmesi
  const handleRunScript = useCallback(() => runScript(), [runScript]);

  return { runScript, handleRunScript, scriptStatus, scriptOutputLog };
}
