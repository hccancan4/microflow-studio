//! Lua script çalıştırma IPC komutları.
//!
//! İnce adapter: yorumlayıcı ve DesignAction toplama `crate::scripting` içinde.
//! `execute_script` action'ları event olarak yayar (store ile aynı undo/redo
//! akışına düşsün diye); `execute_script_batch` tek seferde toplu liste döndürür.

use crate::scripting::{run_script_collect, ScriptResult, DesignAction};
use tauri::Emitter;

/// Script'i çalıştır ve:
///   1) frontend'e `script-action` event'leri emit eder (her DesignAction için)
///   2) sonuç özetini döndürür (başarı, hata, çıktı, action sayısı)
///
/// Frontend, event'leri dinleyerek store action'larını çağırır. Böylece Lua
/// addComponent / connect gibi işlemler React-side UI ile aynı store'da yürür,
/// undo/redo stack'ine düzgün düşer.
#[tauri::command]
pub async fn execute_script(
    script: String,
    window: tauri::Window,
) -> Result<ScriptResult, String> {
    // Script'i çalıştırıp action listesini topla
    let (result, actions) = run_script_collect(&script);

    // Her action'ı frontend'e event olarak push et
    for action in &actions {
        let _ = window.emit("script-action", action);
    }

    // Çıktı satırlarını da ayrıca stream edebiliriz (şimdilik sonuçta veriyoruz)
    if !result.output.is_empty() {
        let _ = window.emit("script-output", result.output.clone());
    }

    // Tamamlandı event'i
    let _ = window.emit("script-completed", serde_json::json!({
        "success": result.success,
        "action_count": result.action_count,
        "elapsed_ms": result.elapsed_ms,
        "error": result.error,
    }));

    Ok(result)
}

/// Script'i çalıştır ama action'ları event göndermeden toplu liste döndür.
/// Frontend tercih ederse tek seferde apply edebilir (daha az re-render).
#[tauri::command]
pub fn execute_script_batch(script: String) -> Result<(ScriptResult, Vec<DesignAction>), String> {
    Ok(run_script_collect(&script))
}
