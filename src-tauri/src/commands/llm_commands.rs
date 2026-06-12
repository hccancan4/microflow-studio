//! LLM IPC komutları — sağlayıcı-bağımsız backend (anthropic + openai-compatible).
//!
//! Güvenlik sözleşmesi: API anahtarları webview'a ASLA dönmez; frontend yalnız
//! `llm_status` ile meta görür. İki sağlayıcı tipi:
//! - `anthropic` — Messages API (api.anthropic.com, x-api-key)
//! - `openai` — OpenAI-uyumlu /chat/completions (Ollama, LM Studio, llama.cpp,
//!   vLLM, OpenAI...; base_url yapılandırılır, anahtar OPSİYONEL — lokal
//!   sunucular anahtarsız çalışır)
//!
//! Anahtar çözüm sırası (sağlayıcı başına): env (`ANTHROPIC_API_KEY` /
//! `OPENAI_API_KEY`) → `llm.json` → yok. Zaman aşımı sağlayıcı başına: anthropic
//! 14 sn sabit; openai yapılandırılabilir (varsayılan 60 sn — Qwen/Gemma gibi
//! lokal modeller yavaş olabilir). Hata/timeout frontend'te LocalRuleProvider
//! fallback'ine düşer; UI hiç bloke olmaz.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::Manager;

const DEFAULT_ANTHROPIC_MODEL: &str = "claude-sonnet-4-6";
const DEFAULT_OPENAI_BASE_URL: &str = "http://localhost:11434/v1"; // Ollama varsayılanı
const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";
const ANTHROPIC_TIMEOUT_SECS: u64 = 14;
const OPENAI_DEFAULT_TIMEOUT_SECS: u64 = 60;
const MAX_TOKENS: u32 = 4096;

#[derive(Debug, Clone, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "user" | "assistant"
    pub content: String,
}

// ─── Config şeması ──────────────────────────────────────────────────────────

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
struct ProviderConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    api_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    base_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    timeout_secs: Option<u64>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct LlmConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    active_provider: Option<String>, // "anthropic" | "openai"
    #[serde(default)]
    anthropic: ProviderConfig,
    #[serde(default)]
    openai: ProviderConfig,
    // ── Legacy alanlar (v1.1 düz şeması) — okunur, anthropic'e taşınır ──
    #[serde(skip_serializing_if = "Option::is_none")]
    api_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
}

impl LlmConfig {
    /// v1.1 düz `{api_key, model}` alanlarını `anthropic`'e taşı (idempotent).
    fn migrate_legacy(mut self) -> Self {
        if self.anthropic.api_key.is_none() {
            self.anthropic.api_key = self.api_key.take();
        } else {
            self.api_key = None;
        }
        if self.anthropic.model.is_none() {
            self.anthropic.model = self.model.take();
        } else {
            self.model = None;
        }
        self
    }
}

/// Geçerli sağlayıcı kimliği; bilinmeyen değer anthropic'e düşer.
fn normalize_provider(p: Option<&str>) -> &'static str {
    match p.map(str::trim) {
        Some("openai") => "openai",
        _ => "anthropic",
    }
}

// ─── Saf yardımcılar (ağsız test edilir) ────────────────────────────────────

/// Sağlayıcı-başına anahtar çözümü: env öncelikli, sonra config.
/// Dönen kaynak etiketi yalnız durum raporu içindir — anahtar loglanmaz.
fn resolve_api_key(env_val: Option<String>, cfg_key: Option<&str>) -> (Option<String>, &'static str) {
    if let Some(k) = env_val.filter(|k| !k.trim().is_empty()) {
        return (Some(k), "env");
    }
    if let Some(k) = cfg_key.map(str::to_string).filter(|k| !k.trim().is_empty()) {
        return (Some(k), "config");
    }
    (None, "none")
}

/// Anthropic Messages API istek gövdesi (system ayrı üst-düzey alan).
fn build_anthropic_body(model: &str, system: &str, messages: &[ChatMessage]) -> Value {
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

/// OpenAI-uyumlu /chat/completions gövdesi (system, messages[0] olarak gömülür).
fn build_openai_body(model: &str, system: &str, messages: &[ChatMessage]) -> Value {
    let mut msgs = vec![json!({ "role": "system", "content": system })];
    msgs.extend(messages.iter().map(|m| json!({ "role": m.role, "content": m.content })));
    json!({
        "model": model,
        "max_tokens": MAX_TOKENS,
        "messages": msgs,
    })
}

/// Anthropic yanıtı: `content[]` içindeki `type=="text"` blokları birleştirilir.
fn parse_anthropic_text(v: &Value) -> Result<String, String> {
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

/// OpenAI-uyumlu yanıt: `choices[0].message.content`.
fn parse_openai_text(v: &Value) -> Result<String, String> {
    if let Some(msg) = v.pointer("/error/message").and_then(Value::as_str) {
        return Err(format!("API hatası: {msg}"));
    }
    let text = v
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .ok_or_else(|| "Beklenmeyen yanıt biçimi: choices[0].message.content yok".to_string())?;
    if text.trim().is_empty() {
        return Err("Yanıt boş".into());
    }
    Ok(text.to_string())
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
        .and_then(|s| serde_json::from_str::<LlmConfig>(&s).ok())
        .unwrap_or_default()
        .migrate_legacy()
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

// ─── Durum raporu ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ProviderStatus {
    pub has_key: bool,
    pub source: String, // "env" | "config" | "none"
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout_secs: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct LlmStatus {
    pub active_provider: String,
    pub anthropic: ProviderStatus,
    pub openai: ProviderStatus,
}

fn status_from(app: &tauri::AppHandle) -> Result<LlmStatus, String> {
    let cfg = load_config(&config_path(app)?);
    let (a_key, a_src) = resolve_api_key(
        std::env::var("ANTHROPIC_API_KEY").ok(),
        cfg.anthropic.api_key.as_deref(),
    );
    let (o_key, o_src) = resolve_api_key(
        std::env::var("OPENAI_API_KEY").ok(),
        cfg.openai.api_key.as_deref(),
    );
    Ok(LlmStatus {
        active_provider: normalize_provider(cfg.active_provider.as_deref()).to_string(),
        anthropic: ProviderStatus {
            has_key: a_key.is_some(),
            source: a_src.to_string(),
            model: cfg
                .anthropic
                .model
                .unwrap_or_else(|| DEFAULT_ANTHROPIC_MODEL.to_string()),
            base_url: None,
            timeout_secs: None,
        },
        openai: ProviderStatus {
            has_key: o_key.is_some(),
            source: o_src.to_string(),
            model: cfg.openai.model.unwrap_or_default(),
            base_url: Some(
                cfg.openai
                    .base_url
                    .unwrap_or_else(|| DEFAULT_OPENAI_BASE_URL.to_string()),
            ),
            timeout_secs: Some(cfg.openai.timeout_secs.unwrap_or(OPENAI_DEFAULT_TIMEOUT_SECS)),
        },
    })
}

// ─── Tauri komutları ────────────────────────────────────────────────────────

/// Sağlayıcı/anahtar/model durumu — anahtarların KENDİSİ asla dönmez.
#[tauri::command]
pub fn llm_status(app: tauri::AppHandle) -> Result<LlmStatus, String> {
    status_from(&app)
}

/// Sağlayıcı ayarlarını patch'le. `key: Some("")` anahtarı siler; `None`
/// alanlar dokunulmaz. `provider` belirtilmezse anthropic varsayılır.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn save_llm_settings(
    app: tauri::AppHandle,
    provider: Option<String>,
    key: Option<String>,
    model: Option<String>,
    base_url: Option<String>,
    timeout_secs: Option<u64>,
    active_provider: Option<String>,
) -> Result<LlmStatus, String> {
    let path = config_path(&app)?;
    let mut cfg = load_config(&path);

    let target = normalize_provider(provider.as_deref());
    let slot = if target == "openai" { &mut cfg.openai } else { &mut cfg.anthropic };

    if let Some(k) = key {
        slot.api_key = if k.trim().is_empty() { None } else { Some(k) };
    }
    if let Some(m) = model {
        if !m.trim().is_empty() {
            slot.model = Some(m);
        }
    }
    if let Some(u) = base_url {
        if !u.trim().is_empty() {
            cfg.openai.base_url = Some(u.trim_end_matches('/').to_string());
        }
    }
    if let Some(t) = timeout_secs {
        cfg.openai.timeout_secs = Some(t.clamp(5, 600));
    }
    if let Some(ap) = active_provider {
        cfg.active_provider = Some(normalize_provider(Some(&ap)).to_string());
    }

    save_config(&path, &cfg)?;
    status_from(&app)
}

/// LM tamamlama — aktif (veya belirtilen) sağlayıcı üzerinden.
/// Yanıt yalnız üretilen METİNDİR; anahtar ne yanıtta ne logda yer alır.
#[tauri::command]
pub async fn llm_complete(
    app: tauri::AppHandle,
    provider: Option<String>,
    model: Option<String>,
    system: String,
    messages: Vec<ChatMessage>,
) -> Result<String, String> {
    let cfg = load_config(&config_path(&app)?);
    let which = normalize_provider(
        provider.as_deref().or(cfg.active_provider.as_deref()),
    );

    let (url, headers, body, timeout, kind): (String, Vec<(String, String)>, Value, u64, &str) =
        if which == "openai" {
            let base = cfg
                .openai
                .base_url
                .clone()
                .unwrap_or_else(|| DEFAULT_OPENAI_BASE_URL.to_string());
            let (key, _) = resolve_api_key(
                std::env::var("OPENAI_API_KEY").ok(),
                cfg.openai.api_key.as_deref(),
            );
            let m = model
                .filter(|m| !m.trim().is_empty())
                .or(cfg.openai.model.clone())
                .ok_or_else(|| {
                    "OpenAI-uyumlu sağlayıcı için model adı gerekli (Asistan ayarları)".to_string()
                })?;
            let mut hs = vec![("content-type".to_string(), "application/json".to_string())];
            if let Some(k) = key {
                // Anahtar opsiyonel — lokal sunucular (Ollama vb.) anahtarsız çalışır.
                hs.push(("authorization".to_string(), format!("Bearer {k}")));
            }
            let timeout = cfg.openai.timeout_secs.unwrap_or(OPENAI_DEFAULT_TIMEOUT_SECS);
            (
                format!("{}/chat/completions", base.trim_end_matches('/')),
                hs,
                build_openai_body(&m, &system, &messages),
                timeout,
                "openai",
            )
        } else {
            let (key, _) = resolve_api_key(
                std::env::var("ANTHROPIC_API_KEY").ok(),
                cfg.anthropic.api_key.as_deref(),
            );
            let key = key.ok_or_else(|| {
                "API anahtarı tanımlı değil (ANTHROPIC_API_KEY veya Asistan ayarları)".to_string()
            })?;
            let m = model
                .filter(|m| !m.trim().is_empty())
                .or(cfg.anthropic.model.clone())
                .unwrap_or_else(|| DEFAULT_ANTHROPIC_MODEL.to_string());
            (
                ANTHROPIC_URL.to_string(),
                vec![
                    ("x-api-key".to_string(), key),
                    ("anthropic-version".to_string(), ANTHROPIC_VERSION.to_string()),
                    ("content-type".to_string(), "application/json".to_string()),
                ],
                build_anthropic_body(&m, &system, &messages),
                ANTHROPIC_TIMEOUT_SECS,
                "anthropic",
            )
        };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout))
        .build()
        .map_err(|e| format!("HTTP istemcisi kurulamadı: {e}"))?;

    let mut req = client.post(&url);
    for (name, value) in &headers {
        req = req.header(name.as_str(), value.as_str());
    }

    // Çift katman zaman aşımı: client.timeout + tokio sarmalayıcı.
    let resp = tokio::time::timeout(Duration::from_secs(timeout), req.json(&body).send())
        .await
        .map_err(|_| format!("LLM çağrısı zaman aşımına uğradı ({timeout} sn)"))?
        .map_err(|e| format!("LLM bağlantı hatası: {e}"))?;

    let value: Value = resp
        .json()
        .await
        .map_err(|e| format!("LLM yanıtı okunamadı: {e}"))?;

    if kind == "openai" {
        parse_openai_text(&value)
    } else {
        parse_anthropic_text(&value)
    }
}

// ─── Testler (ağsız — saf fonksiyonlar) ─────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_key_env_has_priority() {
        let (k, src) = resolve_api_key(Some("env-key".into()), Some("cfg-key"));
        assert_eq!(k.as_deref(), Some("env-key"));
        assert_eq!(src, "env");
    }

    #[test]
    fn resolve_key_falls_back_to_config_then_none() {
        let (k, src) = resolve_api_key(None, Some("cfg-key"));
        assert_eq!(k.as_deref(), Some("cfg-key"));
        assert_eq!(src, "config");

        let (k2, src2) = resolve_api_key(Some("  ".into()), None);
        assert!(k2.is_none());
        assert_eq!(src2, "none");
    }

    #[test]
    fn anthropic_body_shape() {
        let msgs = vec![
            ChatMessage { role: "user".into(), content: "2:1 bölücü".into() },
            ChatMessage { role: "assistant".into(), content: "tamam".into() },
        ];
        let b = build_anthropic_body("claude-sonnet-4-6", "sistem", &msgs);
        assert_eq!(b["model"], "claude-sonnet-4-6");
        assert_eq!(b["max_tokens"], 4096);
        assert_eq!(b["system"], "sistem");
        assert_eq!(b["messages"].as_array().unwrap().len(), 2);
        assert_eq!(b["messages"][0]["role"], "user");
    }

    #[test]
    fn openai_body_embeds_system_as_first_message() {
        let msgs = vec![ChatMessage { role: "user".into(), content: "merhaba".into() }];
        let b = build_openai_body("qwen2.5:14b", "sistem promptu", &msgs);
        assert_eq!(b["model"], "qwen2.5:14b");
        assert!(b.get("system").is_none(), "openai gövdesinde ayrı system alanı OLMAMALI");
        let m = b["messages"].as_array().unwrap();
        assert_eq!(m.len(), 2);
        assert_eq!(m[0]["role"], "system");
        assert_eq!(m[0]["content"], "sistem promptu");
        assert_eq!(m[1]["role"], "user");
    }

    #[test]
    fn parse_anthropic_text_blocks_joined() {
        let v = json!({
            "content": [
                { "type": "text", "text": "Gerekçe." },
                { "type": "tool_use", "id": "x" },
                { "type": "text", "text": "```lua\nmf.clear()\n```" }
            ]
        });
        let t = parse_anthropic_text(&v).unwrap();
        assert!(t.contains("Gerekçe."));
        assert!(t.contains("mf.clear()"));
    }

    #[test]
    fn parse_openai_choices_content() {
        let v = json!({
            "choices": [ { "message": { "role": "assistant", "content": "Tamam.\n```lua\nmf.clear()\n```" } } ]
        });
        let t = parse_openai_text(&v).unwrap();
        assert!(t.contains("mf.clear()"));
    }

    #[test]
    fn parse_error_bodies_are_err() {
        let a = json!({ "type": "error", "error": { "type": "overloaded", "message": "Overloaded" } });
        assert!(parse_anthropic_text(&a).unwrap_err().contains("Overloaded"));
        let o = json!({ "error": { "message": "model not found" } });
        assert!(parse_openai_text(&o).unwrap_err().contains("model not found"));
        assert!(parse_openai_text(&json!({})).is_err());
    }

    #[test]
    fn legacy_config_migrates_to_anthropic() {
        let raw = r#"{ "api_key": "eski-anahtar", "model": "claude-sonnet-4-6" }"#;
        let cfg: LlmConfig = serde_json::from_str(raw).unwrap();
        let cfg = cfg.migrate_legacy();
        assert_eq!(cfg.anthropic.api_key.as_deref(), Some("eski-anahtar"));
        assert_eq!(cfg.anthropic.model.as_deref(), Some("claude-sonnet-4-6"));
        assert!(cfg.api_key.is_none(), "legacy alan temizlenmeli");
        // Yeni şema dokunulmadan kalır
        let raw2 = r#"{ "anthropic": { "api_key": "yeni" }, "api_key": "eski" }"#;
        let cfg2 = serde_json::from_str::<LlmConfig>(raw2).unwrap().migrate_legacy();
        assert_eq!(cfg2.anthropic.api_key.as_deref(), Some("yeni"));
    }

    #[test]
    fn provider_normalization() {
        assert_eq!(normalize_provider(Some("openai")), "openai");
        assert_eq!(normalize_provider(Some("anthropic")), "anthropic");
        assert_eq!(normalize_provider(Some("bilinmeyen")), "anthropic");
        assert_eq!(normalize_provider(None), "anthropic");
    }
}
