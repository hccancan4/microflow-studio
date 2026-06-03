/**
 * useScriptRun — Lua script çalıştırma + çalışma durumu/çıktı biriktirme.
 * useScriptDispatcher ile Tauri script-action/script-completed event'lerini
 * buffer'layıp store'a dispatch eder. Davranış App.tsx'ten birebir taşındı.
 */
import { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useProjectStore } from '../stores/useProjectStore';
import { useScriptDispatcher, type ScriptRunStatus } from './useScriptDispatcher';

export function useScriptRun() {
  const scriptContent = useProjectStore((s) => s.scriptContent);

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

  // Script çalıştırma — Lua → DesignAction event'leri → store
  const handleRunScript = useCallback(async () => {
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
      await invoke<void>('execute_script', { script: scriptContent });
    } catch (err) {
      setScriptStatus({
        running: false,
        lastOutput: '',
        lastError: `IPC hatası: ${err}`,
        lastActionCount: 0,
        lastElapsedMs: 0,
      });
    }
  }, [scriptContent, scriptDispatcher]);

  return { handleRunScript, scriptStatus, scriptOutputLog };
}
