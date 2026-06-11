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

    // ── Meta eylemler (mf.* API) — history/dirty üretmez, store'lara gider ──
    /// Akışkan seçimi (kanonik anahtar: water/pbs/plasma/etanol/gliserol50/pdms/oil)
    SetFluid {
        key: String,
    },
    /// Giriş basıncı (Pa)
    SetInletPressure {
        pa: f64,
    },
    /// Bir çıkış için hedef debi bildir (Doğrulama sekmesinin girdisi)
    SetTargetFlow {
        outlet_id: String,
        q_ul_min: f64,
        label: Option<String>,
    },
    /// Simülasyon koşusu iste — batch uygulandıktan sonra frontend kuyruğu işler.
    /// mode: "analytic" | "cfd"; resolution: "coarse" | "medium" | "fine"
    RunSimulation {
        mode: String,
        resolution: Option<String>,
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
