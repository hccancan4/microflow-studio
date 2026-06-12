/**
 * useScriptRun — Lua script çalıştırma + çalışma durumu/çıktı biriktirme.
 * useScriptDispatcher ile Tauri script-action/script-completed event'lerini
 * buffer'layıp store'a dispatch eder. Davranış App.tsx'ten birebir taşındı.
 */
import { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useProjectStore } from '../stores/useProjectStore';
import { toast } from '../stores/useUiStore';
import { useScriptDispatcher, type ScriptRunStatus } from './useScriptDispatcher';

/** Tek bir script koşusunun sonucu (Rust ScriptResult'ın özeti). */
export interface ScriptRunOutcome {
  success: boolean;
  error?: string;
}

/** runScript opsiyonları. */
export interface RunScriptOptions {
  /**
   * true ise koşu başarısızsa MERKEZİ `toast.error` BASTIRILIR — çağıran
   * kendi (daha zengin) geri bildirimini sunacaktır: asistan sohbet içi not +
   * self-repair turu açar, oto-tasarım bağlamlı bir hata toast'ı gösterir.
   * Varsayılan (false): şablon menüsü, doğrudan "Script-Çalıştır" ve ileride
   * eklenecek tüm çağıranlar başarısızlıkta otomatik GÖRÜNÜR hata alır —
   * Canvas sekmesindeyken sessiz başarısızlık olmaz.
   */
  silentError?: boolean;
}

/** runScript çağrı imzası — prop olarak geçtiği yerlerde paylaşılır. */
export type RunScript = (code?: string, opts?: RunScriptOptions) => Promise<ScriptRunOutcome>;

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
    async (code?: string, opts?: RunScriptOptions): Promise<ScriptRunOutcome> => {
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
        const outcome: ScriptRunOutcome = {
          success: result.success,
          error: result.error ?? undefined,
        };
        // Merkezi hata bildirimi (bkz. RunScriptOptions.silentError). Lua hatası
        // dönerse — kullanıcı Canvas sekmesinde olsa bile — görünür toast çıkar.
        if (!outcome.success && !opts?.silentError) {
          toast.error(outcome.error ?? 'Script çalıştırılamadı');
        }
        return outcome;
      } catch (err) {
        // IPC reddi: bu yolda 'script-completed' event'i HİÇ emit edilmez, bu
        // yüzden hata yalnızca burada görünür kılınabilir.
        const error = `IPC hatası: ${err}`;
        setScriptStatus({
          running: false,
          lastOutput: '',
          lastError: error,
          lastActionCount: 0,
          lastElapsedMs: 0,
        });
        if (!opts?.silentError) toast.error(error);
        return { success: false, error };
      }
    },
    [scriptDispatcher],
  );

  // Geriye dönük isim: Script sekmesinin "Çalıştır" düğmesi
  const handleRunScript = useCallback(() => runScript(), [runScript]);

  return { runScript, handleRunScript, scriptStatus, scriptOutputLog };
}
