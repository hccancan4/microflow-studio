//! Script tarafından üretilen design action'ları.
//! Hem Tauri event olarak frontend'e gönderilir, hem de IPC döndürüsünde
//! bir liste olarak aktarılır. Her action frontend store'unda undo/redo
//! stack'ine düşer.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Rust → Frontend design action'ları
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DesignAction {
    /// Yeni bileşen ekle (position, rotation, params, id gibi alanları içerir)
    AddComponent {
        component: Value, // JSON — ChipComponent tipi
    },
    /// İki bileşeni bağla
    Connect {
        connection: Value, // JSON — Connection tipi
    },
    /// Var olan bileşen parametresini güncelle
    UpdateComponent {
        id: String,
        updates: Value,
    },
    /// Bileşen sil
    RemoveComponent {
        id: String,
    },
    /// Tasarımı tamamen temizle (script "yeniden üret" modu için)
    ClearDesign,
    /// Canvas ayarlarını güncelle (boyut, birim vs)
    UpdateCanvas {
        updates: Value,
    },
}

/// Script çalışması sırasında frontend'e emit edilmek üzere hazırlanan event tipi.
/// Şu anda script sonuçları tek bir `run_script_collect` dönüşüyle iletiliyor;
/// ileride streaming event'e geçildiğinde bu enum doğrudan `emit` edilecek.
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ScriptEvent {
    /// Yeni design action üretildi
    Action { action: DesignAction },
    /// Script print/log çıktısı
    Output { line: String },
    /// İlerleme (sweep vb için)
    Progress { percent: u32, message: String },
    /// Tamamlandı
    Completed { action_count: usize },
    /// Hata
    Error { message: String },
}
