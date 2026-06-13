/**
 * scriptRunNotify — runScript'in merkezi hata-toast kararı (saf mantık).
 *
 * useScriptRun'dan ayrıldı ki sözleşme hook-render altyapısı gerektirmeden
 * birim testle sabitlenebilsin: başarısız koşu varsayılan olarak GÖRÜNÜR
 * hata toast'ı üretir; RunScriptOptions.silentError bunu bastırır — gerekçe
 * ve çağıran listesi için bkz. useScriptRun.RunScriptOptions.
 */
import type { RunScriptOptions, ScriptRunOutcome } from './useScriptRun';

/** Koşu hatası mesaj vermediğinde kullanılan geri-düşüş toast metni. */
export const FALLBACK_ERROR_TEXT = 'Script çalıştırılamadı';

/** IPC reddi (execute_script çağrısının kendisi reject olduğunda) hata metni. */
export const ipcErrorText = (err: unknown): string => `IPC hatası: ${err}`;

/**
 * Gösterilecek hata toast'ının metni; toast gerekmiyorsa null
 * (başarılı koşu ya da silentError ile bastırılmış başarısızlık).
 */
export function scriptErrorToastText(
  outcome: ScriptRunOutcome,
  opts?: RunScriptOptions,
): string | null {
  if (outcome.success || opts?.silentError) return null;
  return outcome.error ?? FALLBACK_ERROR_TEXT;
}
