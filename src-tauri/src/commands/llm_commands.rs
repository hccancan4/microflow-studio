//! LLM IPC komutları — Anthropic Messages API çağrısı BACKEND'de yapılır.
//!
//! Güvenlik sözleşmesi: API anahtarı webview'a ASLA dönmez. Frontend yalnız
//! `llm_status` ile `{has_key, source, model}` görür. Anahtar çözüm sırası:
//! `ANTHROPIC_API_KEY` ortam değişkeni → uygulama config dizinindeki
//! `llm.json` → yok. Her çağrı çift katman 14 sn zaman aşımıyla korunur
//! (reqwest client timeout + tokio::time::timeout) — UI hiç bloke olmaz;
//! hata/timeout frontend'te LocalRuleProvider fallback'ine düşer.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::Manager;

/// Varsayılan model — Asistan panelindeki seçici bunu değiştirebilir.
const DEFAULT_MODEL: &str = "claude-sonnet-4-6";
const API_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";
const TIMEOUT_SECS: u64 = 14;
const MAX_TOKENS: u32 = 4096;

#[derive(Debug, Clone, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "user" | "assistant"
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LlmStatus {
    pub has_key: bool,
    pub source: String, // "env" | "config" | "none"
    pub model: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct LlmConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    api_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
}

// ─── Saf yardımcılar (ağsız test edilir) ────────────────────────────────────

/// Anahtar çözümü: env önceliklidir; sonra config dosyası.
/// Dönen kaynak etiketi yalnız durum raporu içindir — anahtar loglanmaz.
fn resolve_api_key(env_val: Option<String>, cfg: &LlmConfig) -> (Option<String>, &'static str) {
    if let Some(k) = env_val.filter(|k| !k.trim().is_empty()) {
        return (Some(k), "env");
    }
    if let Some(k) = cfg.api_key.clone().filter(|k| !k.trim().is_empty()) {
        return (Some(k), "config");
    }
    (None, "none")
}

/// Messages API istek gövdesi.
fn build_request_body(model: &str, system: &str, messages: &[ChatMessage]) -> Value {
    json!({
        "model": model,
        "max_tokens": MAX_TOKENS,
        "system": system,
        "messages": messages.iter().map(|m| json!({
            "role": m.role,
            "content": m.content,
        })).collect::<Vec<_>>(),
    })
}

/// Yanıttan metni çıkar: `content[]` içindeki `type=="text"` blokları
/// birleştirilir; API hata gövdesi (`error.message`) Err olarak döner.
fn parse_response_text(v: &Value) -> Result<String, String> {
    if let Some(msg) = v.pointer("/error/message").and_then(Value::as_str) {
        return Err(format!("API hatası: {msg}"));
    }
    let blocks = v
        .get("content")
        .and_then(Value::as_array)
        .ok_or_else(|| "Beklenmeyen yanıt biçimi: content[] yok".to_string())?;
    let text: String = blocks
        .iter()
        .filter(|b| b.get("type").and_then(Value::as_str) == Some("text"))
        .filter_map(|b| b.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("\n");
    if text.is_empty() {
        return Err("Yanıtta metin bloğu yok".into());
    }
    Ok(text)
}

// ─── Config dosyası ─────────────────────────────────────────────────────────

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Config dizini bulunamadı: {e}"))?;
    Ok(dir.join("llm.json"))
}

fn load_config(path: &Path) -> LlmConfig {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_config(path: &Path, cfg: &LlmConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Config dizini açılamadı: {e}"))?;
    }
    let body = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    std::fs::write(path, body).map_err(|e| format!("Config yazılamadı: {e}"))?;
    // Anahtar içeren dosya — yalnız kullanıcı okusun (Unix).
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn status_from(app: &tauri::AppHandle) -> Result<LlmStatus, String> {
    let cfg = load_config(&config_path(app)?);
    let (key, source) = resolve_api_key(std::env::var("ANTHROPIC_API_KEY").ok(), &cfg);
    Ok(LlmStatus {
        has_key: key.is_some(),
        source: source.to_string(),
        model: cfg.model.unwrap_or_else(|| DEFAULT_MODEL.to_string()),
    })
}

// ─── Tauri komutları ────────────────────────────────────────────────────────

/// Anahtar/model durumu — anahtarın KENDİSİ asla dönmez.
#[tauri::command]
pub fn llm_status(app: tauri::AppHandle) -> Result<LlmStatus, String> {
    status_from(&app)
}

/// Anahtar ve/veya model kaydet. `key: Some("")` anahtarı siler;
/// `None` alanlar dokunulmaz bırakılır. Güncel durumu döndürür.
#[tauri::command]
pub fn save_llm_settings(
    app: tauri::AppHandle,
    key: Option<String>,
    model: Option<String>,
) -> Result<LlmStatus, String> {
    let path = config_path(&app)?;
    let mut cfg = load_config(&path);
    if let Some(k) = key {
        cfg.api_key = if k.trim().is_empty() { None } else { Some(k) };
    }
    if let Some(m) = model {
        if !m.trim().is_empty() {
            cfg.model = Some(m);
        }
    }
    save_config(&path, &cfg)?;
    status_from(&app)
}

/// Anthropic Messages API çağrısı. Yanıt yalnız üretilen METİNDİR;
/// anahtar ne yanıtta ne logda yer alır.
#[tauri::command]
pub async fn llm_complete(
    app: tauri::AppHandle,
    model: Option<String>,
    system: String,
    messages: Vec<ChatMessage>,
) -> Result<String, String> {
    let cfg = load_config(&config_path(&app)?);
    let (key, _) = resolve_api_key(std::env::var("ANTHROPIC_API_KEY").ok(), &cfg);
    let key = key.ok_or_else(|| {
        "API anahtarı tanımlı değil (ANTHROPIC_API_KEY veya Asistan ayarları)".to_string()
    })?;
    let model = model
        .filter(|m| !m.trim().is_empty())
        .or(cfg.model)
        .unwrap_or_else(|| DEFAULT_MODEL.to_string());
    let body = build_request_body(&model, &system, &messages);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("HTTP istemcisi kurulamadı: {e}"))?;

    let fut = client
        .post(API_URL)
        .header("x-api-key", &key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .header("content-type", "application/json")
        .json(&body)
        .send();

    // Çift katman zaman aşımı: client.timeout + tokio sarmalayıcı.
    let resp = tokio::time::timeout(Duration::from_secs(TIMEOUT_SECS), fut)
        .await
        .map_err(|_| "LLM çağrısı zaman aşımına uğradı (14 sn)".to_string())?
        .map_err(|e| format!("LLM bağlantı hatası: {e}"))?;

    let value: Value = resp
        .json()
        .await
        .map_err(|e| format!("LLM yanıtı okunamadı: {e}"))?;
    parse_response_text(&value)
}

// ─── Testler (ağsız — saf fonksiyonlar) ─────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_key_env_has_priority() {
        let cfg = LlmConfig { api_key: Some("cfg-key".into()), model: None };
        let (k, src) = resolve_api_key(Some("env-key".into()), &cfg);
        assert_eq!(k.as_deref(), Some("env-key"));
        assert_eq!(src, "env");
    }

    #[test]
    fn resolve_key_falls_back_to_config_then_none() {
        let cfg = LlmConfig { api_key: Some("cfg-key".into()), model: None };
        let (k, src) = resolve_api_key(None, &cfg);
        assert_eq!(k.as_deref(), Some("cfg-key"));
        assert_eq!(src, "config");

        let (k2, src2) = resolve_api_key(Some("  ".into()), &LlmConfig::default());
        assert!(k2.is_none());
        assert_eq!(src2, "none");
    }

    #[test]
    fn request_body_shape() {
        let msgs = vec![
            ChatMessage { role: "user".into(), content: "2:1 bölücü".into() },
            ChatMessage { role: "assistant".into(), content: "tamam".into() },
        ];
        let b = build_request_body("claude-sonnet-4-6", "sistem", &msgs);
        assert_eq!(b["model"], "claude-sonnet-4-6");
        assert_eq!(b["max_tokens"], 4096);
        assert_eq!(b["system"], "sistem");
        assert_eq!(b["messages"].as_array().unwrap().len(), 2);
        assert_eq!(b["messages"][0]["role"], "user");
        assert_eq!(b["messages"][1]["content"], "tamam");
    }

    #[test]
    fn parse_text_blocks_joined() {
        let v = json!({
            "content": [
                { "type": "text", "text": "Gerekçe." },
                { "type": "tool_use", "id": "x" },
                { "type": "text", "text": "```lua\nmf.clear()\n```" }
            ]
        });
        let t = parse_response_text(&v).unwrap();
        assert!(t.contains("Gerekçe."));
        assert!(t.contains("mf.clear()"));
    }

    #[test]
    fn parse_error_body_is_err() {
        let v = json!({ "type": "error", "error": { "type": "overloaded_error", "message": "Overloaded" } });
        let e = parse_response_text(&v).unwrap_err();
        assert!(e.contains("Overloaded"));
    }

    #[test]
    fn parse_missing_content_is_err() {
        assert!(parse_response_text(&json!({})).is_err());
    }
}
