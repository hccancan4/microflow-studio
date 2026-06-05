//! Analitik çözücü — Hagen-Poiseuille ve ağ analizi.
//!
//! Faz 4A:
//!   • Her bileşen tipi için uygun direnç modeli (channel/curve/serpentine/junction/expansion)
//!   • Bağlantılardan graf oluştur, giriş→çıkış yollarını bul
//!   • Seri direnç = Σ R, paralel dal = 1/Σ(1/R) (tek-giriş-tek-çıkış basit topolojiler için)
//!   • Her bileşene düşen debi/basınç dağılımını hesapla

use super::FluidProperties;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

// ─── Varsayılan kanal geometrisi & direnç modeli sabitleri ───────────────────
// JSON parametresi verilmediğinde kullanılan standart mikrokanal kesiti ve
// Hagen-Poiseuille aspect-ratio düzeltme katsayısı. Gelecek doğruluk/tuning
// fazı bu değerlere dokunacağı için tek noktada isimli tutulurlar.

/// Standart mikrokanal genişliği (μm) — parametre verilmediğinde fallback.
const DEFAULT_CHANNEL_WIDTH_UM: f64 = 200.0;
/// Standart mikrokanal derinliği/yüksekliği (μm) — fallback.
const DEFAULT_CHANNEL_DEPTH_UM: f64 = 50.0;
/// Standart düz kanal uzunluğu (μm) — fallback.
const DEFAULT_CHANNEL_LENGTH_UM: f64 = 5000.0;
/// Dikdörtgen kanal Hagen-Poiseuille direnç düzeltmesi: `1 - k·(h/w)`,
/// k = 0.63, h < w (dar/geniş) varsayımıyla standart yaklaşıklık.
const ASPECT_RATIO_CORRECTION: f64 = 0.63;

/// Dikdörtgen kanal parametreleri (μm cinsinden)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RectChannel {
    pub width: f64,  // μm
    pub depth: f64,  // μm (yükseklik)
    pub length: f64, // μm
}

/// Analitik hesaplama sonucu
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticResult {
    pub component_id: String,
    pub flow_rate: f64,        // μL/min
    pub pressure_drop: f64,    // Pa
    pub reynolds_number: f64,
    pub resistance: f64,       // Pa·s/m³
    pub dean_number: Option<f64>,
    pub mixing_efficiency: Option<f64>,
}

/// Hidravlik çap hesaplama (dikdörtgen kanal)
/// Dh = 4A / P = 4wh / 2(w+h) = 2wh / (w+h)
pub fn hydraulic_diameter(width_um: f64, depth_um: f64) -> f64 {
    let w = width_um * 1e-6; // m
    let h = depth_um * 1e-6;
    2.0 * w * h / (w + h)
}

/// Kanal direnci (Pa·s/m³) — aspect ratio düzeltmeli Hagen-Poiseuille
/// R = 12 * μ * L / (w * h³ * (1 - 0.63 * h/w))
/// h < w varsayımıyla (h = derinlik, w = genişlik)
pub fn channel_resistance(channel: &RectChannel, fluid: &FluidProperties) -> f64 {
    let w = channel.width.max(channel.depth) * 1e-6; // geniş taraf
    let h = channel.width.min(channel.depth) * 1e-6; // dar taraf
    let l = channel.length * 1e-6;
    let correction = 1.0 - ASPECT_RATIO_CORRECTION * (h / w);
    12.0 * fluid.viscosity * l / (w * h.powi(3) * correction)
}

/// Basınç farkından debi hesaplama: Q = ΔP / R  (m³/s → μL/min)
pub fn flow_rate_from_pressure(pressure_pa: f64, resistance: f64) -> f64 {
    let q_m3_s = pressure_pa / resistance;
    q_m3_s * 1e9 * 60.0 // m³/s → μL/min (1 m³ = 1e9 μL, × 60 s/min)
}

/// Reynolds sayısı: Re = ρ * v * Dh / μ
pub fn reynolds_number(
    flow_rate_ul_min: f64,
    width_um: f64,
    depth_um: f64,
    fluid: &FluidProperties,
) -> f64 {
    let q = flow_rate_ul_min / (1e9 * 60.0); // μL/min → m³/s
    let w = width_um * 1e-6;
    let h = depth_um * 1e-6;
    let area = w * h;
    let v = if area > 0.0 { q / area } else { 0.0 };
    let dh = hydraulic_diameter(width_um, depth_um);
    fluid.density * v * dh / fluid.viscosity
}

/// Dean sayısı (eğri kanal): De = Re * sqrt(Dh / 2R)
pub fn dean_number(re: f64, dh_m: f64, radius_um: f64) -> f64 {
    let r = radius_um * 1e-6;
    re * (dh_m / (2.0 * r)).sqrt()
}

/// Serpantin mikser karışım etkinliği tahmini (basitleştirilmiş difüzyon modeli)
pub fn mixing_efficiency_serpentine(
    turns: u32,
    channel_width_um: f64,
    flow_rate_ul_min: f64,
    diffusivity: f64, // m²/s, tipik 1e-9
) -> f64 {
    let w = channel_width_um * 1e-6;
    let q = flow_rate_ul_min / (1e9 * 60.0);
    let peclet = q * w / diffusivity;
    let eta = 1.0 - (-f64::from(turns) * std::f64::consts::PI.powi(2) / peclet).exp();
    eta.clamp(0.0, 1.0)
}

/// Tek kanal için tam analitik analiz
pub fn analyze_channel(
    component_id: &str,
    channel: &RectChannel,
    inlet_pressure_pa: f64,
    fluid: &FluidProperties,
) -> AnalyticResult {
    let resistance = channel_resistance(channel, fluid);
    let flow_rate = flow_rate_from_pressure(inlet_pressure_pa, resistance);
    let re = reynolds_number(flow_rate, channel.width, channel.depth, fluid);
    let pressure_drop = inlet_pressure_pa; // tek kanal: tüm basınç düşümü bu kanalda

    AnalyticResult {
        component_id: component_id.to_string(),
        flow_rate,
        pressure_drop,
        reynolds_number: re,
        resistance,
        dean_number: None,
        mixing_efficiency: None,
    }
}

// ══════════════════════════════════════════════════════════════════════════
// AĞ ANALİZİ (Faz 4A)
// ══════════════════════════════════════════════════════════════════════════

/// Frontend'den gelen genel bileşen — tip + params JSON
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DesignComponent {
    pub id: String,
    #[serde(rename = "type")]
    pub component_type: String,
    #[serde(default)]
    pub params: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DesignConnection {
    pub id: String,
    #[serde(rename = "fromComponentId")]
    pub from_component_id: String,
    #[serde(rename = "fromPortIndex")]
    pub from_port_index: u32,
    #[serde(rename = "toComponentId")]
    pub to_component_id: String,
    #[serde(rename = "toPortIndex")]
    pub to_port_index: u32,
}

/// Tek bir yapının etkin kanal geometrisi (ağ direnci hesaplamak için)
#[derive(Debug, Clone)]
struct EffectiveChannel {
    width: f64,  // μm
    depth: f64,  // μm
    length: f64, // μm (etkin uzunluk — serpantin/curve için integre edilmiş)
    /// Bileşen tipine göre ek metrikler
    kind: ComponentKind,
}

#[derive(Debug, Clone)]
#[allow(dead_code)] // branch_width / w_in / w_out ileride splitter/taper fiziğinde kullanılacak
enum ComponentKind {
    Straight,
    Curved { radius: f64 },
    Serpentine { turns: u32 },
    Junction { branch_width: f64 },
    Expansion { w_in: f64, w_out: f64 },
    Port,
    Reservoir,
    Other,
}

/// JSON param'dan güvenli f64 çekme
fn jf(v: &serde_json::Value, key: &str, default: f64) -> f64 {
    v.get(key).and_then(|x| x.as_f64()).unwrap_or(default)
}
fn ju(v: &serde_json::Value, key: &str, default: u64) -> u64 {
    v.get(key).and_then(|x| x.as_u64()).unwrap_or(default)
}

/// Bileşenden etkin kanal çıkar (ağ direnci için)
fn extract_channel(c: &DesignComponent) -> Option<EffectiveChannel> {
    let p = &c.params;
    match c.component_type.as_str() {
        "straight_channel" => Some(EffectiveChannel {
            width: jf(p, "width", DEFAULT_CHANNEL_WIDTH_UM),
            depth: jf(p, "depth", DEFAULT_CHANNEL_DEPTH_UM),
            length: jf(p, "length", DEFAULT_CHANNEL_LENGTH_UM),
            kind: ComponentKind::Straight,
        }),
        "curved_channel" => {
            let r = jf(p, "radius", 2000.0);
            let angle_deg = jf(p, "angle", 90.0);
            let arc_len = r * angle_deg.to_radians();
            Some(EffectiveChannel {
                width: jf(p, "width", DEFAULT_CHANNEL_WIDTH_UM),
                depth: jf(p, "depth", DEFAULT_CHANNEL_DEPTH_UM),
                length: arc_len,
                kind: ComponentKind::Curved { radius: r },
            })
        }
        "serpentine_mixer" => {
            let turns = ju(p, "turns", 8) as u32;
            let pitch = jf(p, "pitch", 600.0);
            let w = jf(p, "channelWidth", jf(p, "channel_width", DEFAULT_CHANNEL_WIDTH_UM));
            // Serpantin toplam uzunluk ≈ turns × (pitch + 2×pitch/2)  — dönüşler dahil
            // Basit tahmin: her dönüş ≈ 2·pitch uzunluğunda, bakl + yarım çevre
            let length = (turns as f64) * (pitch * 2.0 + std::f64::consts::PI * pitch * 0.5);
            Some(EffectiveChannel {
                width: w,
                depth: jf(p, "depth", DEFAULT_CHANNEL_DEPTH_UM),
                length,
                kind: ComponentKind::Serpentine { turns },
            })
        }
        "t_junction" | "y_junction" => {
            let mw = jf(p, "mainWidth", jf(p, "main_width", 300.0));
            let bw = jf(p, "branchWidth", jf(p, "branch_width", 150.0));
            // Junction'ı kısa bir "ana kanal parçası" olarak modelle (~5×width uzunluk)
            Some(EffectiveChannel {
                width: mw,
                depth: jf(p, "depth", DEFAULT_CHANNEL_DEPTH_UM),
                length: mw * 5.0,
                kind: ComponentKind::Junction { branch_width: bw },
            })
        }
        "expansion" => {
            let wi = jf(p, "inletWidth", jf(p, "width_in", DEFAULT_CHANNEL_WIDTH_UM));
            let wo = jf(p, "outletWidth", jf(p, "width_out", 600.0));
            let len = jf(p, "length", 1000.0);
            // Genişleme için ortalama genişlik kullanılır
            Some(EffectiveChannel {
                width: (wi + wo) * 0.5,
                depth: jf(p, "depth", DEFAULT_CHANNEL_DEPTH_UM),
                length: len,
                kind: ComponentKind::Expansion { w_in: wi, w_out: wo },
            })
        }
        "droplet_generator" => {
            let mw = jf(p, "mainChannelWidth", jf(p, "continuous_width", DEFAULT_CHANNEL_WIDTH_UM));
            Some(EffectiveChannel {
                width: mw,
                depth: jf(p, "depth", DEFAULT_CHANNEL_DEPTH_UM),
                length: mw * 10.0, // giriş + orifice + çıkış bölgesi tahmini
                kind: ComponentKind::Other,
            })
        }
        "filter_array" => {
            // Pillar array etkin direnç tahmini — pillar yoğunluğuna göre
            let w = jf(p, "width", 2000.0);
            let spacing = jf(p, "spacing", 100.0).max(1.0);
            let pillar = jf(p, "pillarDiameter", jf(p, "pillar_diameter", 50.0));
            // Porozite ≈ 1 - (π·d²/4) / s²
            let porosity = (1.0 - std::f64::consts::PI * (pillar / spacing).powi(2) / 4.0)
                .clamp(0.05, 0.95);
            Some(EffectiveChannel {
                width: w * porosity,
                depth: jf(p, "depth", DEFAULT_CHANNEL_DEPTH_UM),
                length: jf(p, "height", 1000.0),
                kind: ComponentKind::Other,
            })
        }
        "reservoir" => Some(EffectiveChannel {
            width: jf(p, "width", 2000.0),
            depth: jf(p, "depth", 200.0),
            length: 1.0, // rezervuar ihmal edilebilir direnç
            kind: ComponentKind::Reservoir,
        }),
        "port" => Some(EffectiveChannel {
            width: jf(p, "diameter", 500.0),
            depth: jf(p, "diameter", 500.0),
            length: 1.0, // port nokta — direnç ihmal edilebilir
            kind: ComponentKind::Port,
        }),
        _ => None,
    }
}

/// Tek bileşenin direnci + metrikleri
fn analyze_one(
    c: &DesignComponent,
    eff: &EffectiveChannel,
    fluid: &FluidProperties,
) -> AnalyticResult {
    let rect = RectChannel {
        width: eff.width,
        depth: eff.depth,
        length: eff.length,
    };
    let resistance = channel_resistance(&rect, fluid);

    // Not: flow_rate ve pressure_drop ağ çözüldükten sonra doldurulur.
    // Burada yalnızca geometri-bağımlı metrikleri hesaplarız.
    let mut result = AnalyticResult {
        component_id: c.id.clone(),
        flow_rate: 0.0,
        pressure_drop: 0.0,
        reynolds_number: 0.0,
        resistance,
        dean_number: None,
        mixing_efficiency: None,
    };

    match &eff.kind {
        ComponentKind::Curved { radius } => {
            // Dean number hesabı için ön tahmin — flow set edildikten sonra güncellenir
            result.dean_number = Some(dean_number(0.0, hydraulic_diameter(eff.width, eff.depth), *radius));
        }
        ComponentKind::Serpentine { turns } => {
            result.mixing_efficiency = Some(
                mixing_efficiency_serpentine(*turns, eff.width, 1.0, 1e-9)
            );
        }
        _ => {}
    }

    result
}

/// Ağ çözümü — girişe port (inlet) bağlı olanlar kaynak, outlet port olanlar drenaj.
/// Basit strateji:
///   1. Toplam direnci hesapla (seri için Σ; ayrışmış yollar için paralel).
///   2. Ana debi = Pinlet / R_total.
///   3. Her bileşene seri yol üzerindeki debi = ana debi (yük dengesi);
///      paralel dallar için dal debisi ∝ 1/R_dal.
///
/// Topoloji tespiti: port'lardan başlayan DFS ile yolları bul,
/// kesişmeyen alternatif yollar → paralel; ardışık → seri.
///
/// Karmaşık topolojiler için bu bir yaklaşımdır; kesin Kirchhoff
/// çözümü Faz 4B/5'te lineer sistem çözücüyle yapılacak.
pub fn analyze_design(
    components: &[DesignComponent],
    connections: &[DesignConnection],
    inlet_pressure_pa: f64,
    fluid: &FluidProperties,
) -> AnalyticDesignResult {
    // 1. Her bileşen için etkin kanal + baz AnalyticResult üret
    let mut results: HashMap<String, AnalyticResult> = HashMap::new();
    let mut effective: HashMap<String, EffectiveChannel> = HashMap::new();
    for c in components {
        if let Some(eff) = extract_channel(c) {
            let r = analyze_one(c, &eff, fluid);
            effective.insert(c.id.clone(), eff);
            results.insert(c.id.clone(), r);
        }
    }

    // 3. Yönsüz graf — bağlantılardan komşuluk listesi
    //    Duplikat (a,b) çiftleri tek kenar olarak saklanır; aksi halde
    //    find_all_paths aynı yolu birden çok kez bulur ve paralel direnç
    //    hesabı şişer. Self-loop (a==b) eklenmez.
    let mut adj: HashMap<&str, HashSet<&str>> = HashMap::new();
    for c in components {
        adj.entry(c.id.as_str()).or_default();
    }
    for conn in connections {
        let a = conn.from_component_id.as_str();
        let b = conn.to_component_id.as_str();
        if a == b { continue; }
        adj.entry(a).or_default().insert(b);
        adj.entry(b).or_default().insert(a);
    }
    // find_all_paths Vec<&str> bekliyor — Set'leri Vec'e dönüştür
    let adj: HashMap<&str, Vec<&str>> = adj.into_iter()
        .map(|(k, v)| (k, v.into_iter().collect()))
        .collect();

    // 4. Inlet ve outlet portları ayır
    let inlets: Vec<&str> = components.iter()
        .filter(|c| c.component_type == "port"
            && c.params.get("portType").and_then(|v| v.as_str()) == Some("inlet"))
        .map(|c| c.id.as_str())
        .collect();
    let outlets: Vec<&str> = components.iter()
        .filter(|c| c.component_type == "port"
            && c.params.get("portType").and_then(|v| v.as_str()) == Some("outlet"))
        .map(|c| c.id.as_str())
        .collect();

    // 5. Inlet→Outlet yolları (tüm basit path'ler; küçük tasarımlarda tüm yolları say)
    let mut all_paths: Vec<Vec<String>> = Vec::new();
    for inlet in &inlets {
        for outlet in &outlets {
            find_all_paths(&adj, inlet, outlet, &mut Vec::new(), &mut HashSet::new(), &mut all_paths, 32);
        }
    }

    // 6. Hiç yol bulunmadıysa: tek başına bileşenler için fallback — her biri inletPressure altında
    let (total_flow_ul_min, total_resistance, paths_info) = if all_paths.is_empty() {
        // Bağlantısız bileşenler — her biri bağımsız kanal gibi davranır
        let mut total_flow = 0.0;
        for (id, eff) in &effective {
            if matches!(eff.kind, ComponentKind::Port | ComponentKind::Reservoir) { continue; }
            let rect = RectChannel { width: eff.width, depth: eff.depth, length: eff.length };
            let r = channel_resistance(&rect, fluid);
            let q = flow_rate_from_pressure(inlet_pressure_pa, r);
            if let Some(res) = results.get_mut(id) {
                res.flow_rate = q;
                res.pressure_drop = inlet_pressure_pa;
                res.reynolds_number = reynolds_number(q, eff.width, eff.depth, fluid);
            }
            total_flow += q;
        }
        (total_flow, 0.0, Vec::<PathInfo>::new())
    } else {
        // Her yol için toplam direnç → yol debisi (paralel yollar varsa)
        let mut path_resistances: Vec<f64> = Vec::with_capacity(all_paths.len());
        for path in &all_paths {
            let r: f64 = path.iter()
                .filter_map(|id| results.get(id).map(|r| r.resistance))
                .sum();
            path_resistances.push(r);
        }

        // Toplam paralel direnç: 1/R_top = Σ 1/R_i
        let total_r = 1.0 / path_resistances.iter()
            .filter(|r| **r > 0.0)
            .map(|r| 1.0 / r)
            .sum::<f64>();

        // Ana debi (μL/min)
        let main_q = flow_rate_from_pressure(inlet_pressure_pa, total_r);

        // Her bileşenin toplam debisi — hangi yollarda geçiyorsa o yolların debilerinin toplamı
        let mut flow_per_component: HashMap<String, f64> = HashMap::new();
        let mut pressure_per_component: HashMap<String, f64> = HashMap::new();
        let mut paths_info = Vec::<PathInfo>::new();

        for (i, path) in all_paths.iter().enumerate() {
            let r_path = path_resistances[i];
            // Yol debisi paralel: q_i = ΔP / R_i  (debi birimi μL/min)
            let q_path = if r_path > 0.0 {
                flow_rate_from_pressure(inlet_pressure_pa, r_path)
            } else { 0.0 };

            for id in path {
                *flow_per_component.entry(id.clone()).or_insert(0.0) += q_path;
                // Bileşenin yoldaki basınç düşümü = q_path(μL/min→m³/s) × R_bileşen
                if let Some(res) = results.get(id) {
                    let q_m3s = q_path / (1e9 * 60.0);
                    let dp = q_m3s * res.resistance;
                    *pressure_per_component.entry(id.clone()).or_insert(0.0) += dp;
                }
            }

            paths_info.push(PathInfo {
                components: path.clone(),
                total_resistance: r_path,
                flow_rate: q_path,
            });
        }

        // Bileşen sonuçlarına yaz
        for (id, res) in results.iter_mut() {
            if let Some(q) = flow_per_component.get(id) {
                res.flow_rate = *q;
                if let Some(eff) = effective.get(id) {
                    res.reynolds_number = reynolds_number(*q, eff.width, eff.depth, fluid);
                    // Dean number güncelle (eğri kanallar için)
                    if let ComponentKind::Curved { radius } = eff.kind {
                        res.dean_number = Some(dean_number(
                            res.reynolds_number,
                            hydraulic_diameter(eff.width, eff.depth),
                            radius,
                        ));
                    }
                    if let ComponentKind::Serpentine { turns } = eff.kind {
                        res.mixing_efficiency = Some(
                            mixing_efficiency_serpentine(turns, eff.width, *q, 1e-9)
                        );
                    }
                }
            }
            if let Some(dp) = pressure_per_component.get(id) {
                res.pressure_drop = *dp;
            }
        }

        (main_q, total_r, paths_info)
    };

    // 7. Özet topla
    let mut max_v = 0.0_f64;
    let mut max_p = 0.0_f64;
    let mut min_p = f64::INFINITY;
    for res in results.values() {
        max_p = max_p.max(res.pressure_drop);
        min_p = min_p.min(res.pressure_drop);
        // Maks hız: q / A
        if let Some(eff) = effective.get(&res.component_id) {
            let area = eff.width * 1e-6 * eff.depth * 1e-6;
            if area > 0.0 {
                let v = (res.flow_rate / (1e9 * 60.0)) / area;
                max_v = max_v.max(v);
            }
        }
    }
    if !min_p.is_finite() { min_p = 0.0; }

    let mut out: Vec<AnalyticResult> = results.into_values().collect();
    out.sort_by(|a, b| a.component_id.cmp(&b.component_id));

    // Ayrıca: bileşen başına hız profili (parabolik) için birkaç örnek nokta üret.
    // Frontend bunu recharts ile render eder.
    let profiles: Vec<VelocityProfile> = out.iter()
        .filter_map(|res| {
            let eff = effective.get(&res.component_id)?;
            if matches!(eff.kind, ComponentKind::Port | ComponentKind::Reservoir) {
                return None;
            }
            let area = eff.width * 1e-6 * eff.depth * 1e-6;
            if area <= 0.0 { return None; }
            let v_mean = (res.flow_rate / (1e9 * 60.0)) / area;
            let v_max = v_mean * 1.5; // parabolik profil: v_max = 1.5 * v_ort
            // 21 nokta, y = -w/2 ... +w/2
            let n = 21;
            let pts: Vec<ProfilePoint> = (0..n).map(|i| {
                let t = i as f64 / (n - 1) as f64; // 0..1
                let y_norm = 2.0 * t - 1.0; // -1..1
                let v = v_max * (1.0 - y_norm * y_norm).max(0.0);
                ProfilePoint {
                    y_um: y_norm * eff.width * 0.5,
                    velocity: v,
                }
            }).collect();
            Some(VelocityProfile {
                component_id: res.component_id.clone(),
                width_um: eff.width,
                depth_um: eff.depth,
                mean_velocity: v_mean,
                peak_velocity: v_max,
                points: pts,
            })
        })
        .collect();

    // serde_json NaN veya Infinity'yi JSON'a dönüştüremez; bunun yerine 0.0 gönder.
    // (IEEE-754 özel değerleri geçerli JSON sayısı değildir.)
    fn finite_or_zero(v: f64) -> f64 { if v.is_finite() { v } else { 0.0 } }

    // Bileşen sonuçlarını da temizle
    for r in &mut out {
        r.flow_rate       = finite_or_zero(r.flow_rate);
        r.pressure_drop   = finite_or_zero(r.pressure_drop);
        r.reynolds_number = finite_or_zero(r.reynolds_number);
        r.resistance      = finite_or_zero(r.resistance);
        r.dean_number     = r.dean_number.map(finite_or_zero);
        r.mixing_efficiency = r.mixing_efficiency.map(finite_or_zero);
    }

    AnalyticDesignResult {
        results: out,
        total_flow_rate:  finite_or_zero(total_flow_ul_min),
        total_resistance: finite_or_zero(total_resistance),
        max_velocity:     finite_or_zero(max_v),
        max_pressure:     finite_or_zero(max_p),
        min_pressure:     finite_or_zero(min_p),
        paths: paths_info,
        profiles,
    }
}

/// Ağ çözümü sonucu — tüm bileşenler + toplu metrikler + yol bilgisi
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticDesignResult {
    pub results: Vec<AnalyticResult>,
    pub total_flow_rate: f64,   // μL/min
    pub total_resistance: f64,  // Pa·s/m³
    pub max_velocity: f64,      // m/s
    pub max_pressure: f64,      // Pa
    pub min_pressure: f64,      // Pa
    pub paths: Vec<PathInfo>,
    pub profiles: Vec<VelocityProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathInfo {
    pub components: Vec<String>,
    pub total_resistance: f64,
    pub flow_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfilePoint {
    pub y_um: f64,
    pub velocity: f64, // m/s
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VelocityProfile {
    pub component_id: String,
    pub width_um: f64,
    pub depth_um: f64,
    pub mean_velocity: f64, // m/s
    pub peak_velocity: f64, // m/s
    pub points: Vec<ProfilePoint>,
}

/// Basit tüm-path bulucu (derinlik sınırlı DFS)
fn find_all_paths<'a>(
    adj: &HashMap<&'a str, Vec<&'a str>>,
    current: &'a str,
    target: &'a str,
    path: &mut Vec<String>,
    visited: &mut HashSet<&'a str>,
    out: &mut Vec<Vec<String>>,
    max_depth: usize,
) {
    if path.len() > max_depth { return; }
    visited.insert(current);
    path.push(current.to_string());

    if current == target && path.len() > 1 {
        out.push(path.clone());
    } else if let Some(neighbors) = adj.get(current) {
        for nb in neighbors {
            if !visited.contains(nb) {
                find_all_paths(adj, nb, target, path, visited, out, max_depth);
            }
        }
    }

    path.pop();
    visited.remove(current);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hydraulic_diameter() {
        // 200μm × 50μm kanal
        let dh = hydraulic_diameter(200.0, 50.0);
        let expected = 2.0 * 200e-6 * 50e-6 / (200e-6 + 50e-6);
        assert!((dh - expected).abs() < 1e-12);
    }

    #[test]
    fn test_channel_resistance_positive() {
        let ch = RectChannel { width: 200.0, depth: 50.0, length: 10000.0 };
        let fluid = FluidProperties::water();
        let r = channel_resistance(&ch, &fluid);
        assert!(r > 0.0);
    }

    #[test]
    fn test_flow_rate_from_pressure() {
        let ch = RectChannel { width: 200.0, depth: 50.0, length: 10000.0 };
        let fluid = FluidProperties::water();
        let r = channel_resistance(&ch, &fluid);
        let q = flow_rate_from_pressure(1000.0, r);
        assert!(q > 0.0);
    }

    #[test]
    fn test_reynolds_laminar() {
        // Mikroakışkan kanallar her zaman laminar olmalı (Re < 1)
        let fluid = FluidProperties::water();
        let re = reynolds_number(1.0, 200.0, 50.0, &fluid);
        assert!(re < 10.0, "Re = {re:.4}, mikroakışkan rejimde olmalı");
    }

    // ── Ağ analizi testleri ─────────────────────────────────────────────

    fn make_comp(id: &str, ty: &str, params: serde_json::Value) -> DesignComponent {
        DesignComponent { id: id.into(), component_type: ty.into(), params }
    }
    fn make_conn(id: &str, a: &str, b: &str) -> DesignConnection {
        DesignConnection {
            id: id.into(),
            from_component_id: a.into(), from_port_index: 0,
            to_component_id: b.into(), to_port_index: 0,
        }
    }

    #[test]
    fn test_network_single_channel() {
        let comps = vec![
            make_comp("in", "port", serde_json::json!({"portType": "inlet", "diameter": 500})),
            make_comp("ch", "straight_channel", serde_json::json!({"width": 200, "depth": 50, "length": 10000})),
            make_comp("out", "port", serde_json::json!({"portType": "outlet", "diameter": 500})),
        ];
        let conns = vec![
            make_conn("c1", "in", "ch"),
            make_conn("c2", "ch", "out"),
        ];
        let r = analyze_design(&comps, &conns, 1000.0, &FluidProperties::water());
        assert!(r.total_flow_rate > 0.0, "debi pozitif olmalı");
        // Kanalın Re değeri laminar olmalı
        let ch = r.results.iter().find(|x| x.component_id == "ch").unwrap();
        assert!(ch.flow_rate > 0.0);
        assert!(ch.reynolds_number < 100.0, "Re = {}", ch.reynolds_number);
        // Hız profili noktaları üretilmiş olmalı
        assert!(r.profiles.iter().any(|p| p.component_id == "ch"));
    }

    #[test]
    fn test_network_parallel_channels() {
        // in → (ch1 || ch2) → out
        let comps = vec![
            make_comp("in", "port", serde_json::json!({"portType": "inlet"})),
            make_comp("ch1", "straight_channel", serde_json::json!({"width": 200, "depth": 50, "length": 5000})),
            make_comp("ch2", "straight_channel", serde_json::json!({"width": 200, "depth": 50, "length": 5000})),
            make_comp("out", "port", serde_json::json!({"portType": "outlet"})),
        ];
        let conns = vec![
            make_conn("a", "in", "ch1"), make_conn("b", "ch1", "out"),
            make_conn("c", "in", "ch2"), make_conn("d", "ch2", "out"),
        ];
        let r = analyze_design(&comps, &conns, 1000.0, &FluidProperties::water());
        // İki özdeş paralel kanal → toplam debi tek kanalın ~2 katı
        let ch1 = r.results.iter().find(|x| x.component_id == "ch1").unwrap();
        let ch2 = r.results.iter().find(|x| x.component_id == "ch2").unwrap();
        assert!((ch1.flow_rate - ch2.flow_rate).abs() < 1e-9, "simetrik debi");
        assert!(r.total_flow_rate > ch1.flow_rate, "toplam > tek dal");
    }

    #[test]
    fn test_network_curved_dean() {
        let comps = vec![
            make_comp("in", "port", serde_json::json!({"portType": "inlet"})),
            make_comp("curve", "curved_channel", serde_json::json!({"radius": 2000, "angle": 180, "width": 200, "depth": 50})),
            make_comp("out", "port", serde_json::json!({"portType": "outlet"})),
        ];
        let conns = vec![make_conn("a", "in", "curve"), make_conn("b", "curve", "out")];
        let r = analyze_design(&comps, &conns, 1000.0, &FluidProperties::water());
        let curve = r.results.iter().find(|x| x.component_id == "curve").unwrap();
        assert!(curve.dean_number.is_some(), "Dean sayısı eğri kanalda hesaplanmalı");
    }

    #[test]
    fn test_network_serpentine_mixing() {
        let comps = vec![
            make_comp("in", "port", serde_json::json!({"portType": "inlet"})),
            make_comp("mix", "serpentine_mixer", serde_json::json!({"turns": 8, "pitch": 600, "channelWidth": 200, "depth": 50})),
            make_comp("out", "port", serde_json::json!({"portType": "outlet"})),
        ];
        let conns = vec![make_conn("a", "in", "mix"), make_conn("b", "mix", "out")];
        let r = analyze_design(&comps, &conns, 1000.0, &FluidProperties::water());
        let mix = r.results.iter().find(|x| x.component_id == "mix").unwrap();
        assert!(mix.mixing_efficiency.is_some(), "Mikser verimi hesaplanmalı");
        let eta = mix.mixing_efficiency.unwrap();
        assert!((0.0..=1.0).contains(&eta), "verim 0..1 aralığında: {}", eta);
    }

    #[test]
    fn test_network_unconnected_fallback() {
        // Port yok — fallback: her kanal bağımsız
        let comps = vec![
            make_comp("ch", "straight_channel", serde_json::json!({"width": 200, "depth": 50, "length": 10000})),
        ];
        let r = analyze_design(&comps, &[], 1000.0, &FluidProperties::water());
        assert!(r.total_flow_rate > 0.0);
    }
}
