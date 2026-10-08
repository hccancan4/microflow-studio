//! Tek hidrolik çekirdek — ileri/ters direnç hesapları ve hedef-debi çözümü.
//!
//! İleri formül `analytic::channel_resistance`'tan DELEGE edilir (kopya yok):
//! ters çözüm `l_um_for_r`, direnç uzunlukta lineer olduğundan
//! `r / r(w,h,1µm)` ile yapısal olarak kayıpsızdır. Hızlı Analiz,
//! Otomatik Tasarım ve Doğrulama raporu hep bu modül üzerinden aynı
//! sayıları görür ("tek hidrolik çekirdek" ilkesi).
//!
//! Birimler: geometri µm, basınç Pa, debi µL/min (gösterim) / m³/s (SI),
//! direnç Pa·s/m³ (SI) ve mbar/(µL·min⁻¹) (gösterim).

use super::analytic::{channel_resistance, reynolds_number, RectChannel};
use super::FluidProperties;
use serde::{Deserialize, Serialize};

// ─── Zarf / üretim sabitleri (µFG paritesi) ─────────────────────────────────
// Frontend aynası: src/utils/fab.ts — birlikte güncelle.

/// Pa·s/m³ → mbar/(µL·min⁻¹): 1 µL/min = 1/(6e10) m³/s? Hayır —
/// 1 µL/min = 1e-9 m³ / 60 s = 1/(6e10)·1e... kısaca 1/(6e12) çarpanı:
/// R_disp = R_SI · (1.6667e-11 m³/s) / (100 Pa) = R_SI / 6e12.
pub const R_SI_TO_DISP: f64 = 1.0 / 6.0e12; // ≈ 1.6667e-13

/// Üretilebilir minimum kanal genişliği (µm).
pub const W_FAB_MIN_UM: f64 = 40.0;
/// Serpantin hücre boyutu zarfı (mm) — hedef uzunluk bu aralıkta kalmalı.
pub const CELL_MM_MIN: f64 = 10.0;
pub const CELL_MM_MAX: f64 = 180.0;

/// Serpantin etkin uzunluk modeli: L = turns · pitch · (2 + π/2).
/// `analytic::extract_channel`'daki serpantin formülüyle BİREBİR aynı olmalı.
pub const SERPENTINE_LEN_FACTOR: f64 = 2.0 + std::f64::consts::FRAC_PI_2;

// ─── Pürüzlülük (RR) direnç düzeltmesi ──────────────────────────────────────

/// Bağıl pürüzlülük eşiği (oran, boyutsuz): bu değer ve altı hidrolik olarak
/// pürüzsüz sayılır (κ = 1) — companion modelin `rr ≤ %1 → f = 64/Re` dalı.
pub const RR_THRESHOLD: f64 = 0.01;
/// Ampirik düzeltmenin katsayısı ve üssü: κ = 1 + RR_GAIN · x^RR_EXPONENT.
const RR_GAIN: f64 = 30.0;
const RR_EXPONENT: f64 = 1.35;

/// Pürüzlülük direnç çarpanı κ(rr) = 1 + 30·max(rr − 0.01, 0)^1.35.
///
/// `rr` bağıl pürüzlülüktür (oran; %2 → 0.02). Kaynak: ML-Micromilling-UI
/// companion reposunun yüksek-rr ampirik dalı `f = f_lam·(1 + 30·rr^1.35)`
/// (docs/RELATED_WORK.md §2). Companion'ın orta-rr dalı kapalı formu olmayan
/// bir ML polinomudur, burada KULLANILMAZ; onun yerine ampirik formun tabanı
/// eşiğe kaydırılır (rr − eşik). Böylece κ eşikte C⁰ süreklidir — form
/// kaydırılmadan uygulansaydı eşiğin hemen üstünde 1.00'dan 1.06'ya sıçrardı.
///
/// Geçerlilik: rr ≈ 0.01–0.10 aralığında κ, daralmış-çap yaklaşımının
/// (Kandlikar 2005) ima ettiği (1 − 2rr)⁻⁴ çarpanının %8–11 ALTINDA kalır;
/// rr > 0.10'da fark hızla açılır (rr = 0.15'te −%25) — sonuç temkinli okunmalı.
///
/// Eşik ve altı (negatif dahil) ile sonlu olmayan girdi (NaN/∞) için çarpan
/// tam 1.0'dır; rr = 0 ile tüm hesaplar pürüzsüz haliyle bit düzeyinde aynıdır.
pub fn roughness_factor(rr: f64) -> f64 {
    if !rr.is_finite() || rr <= RR_THRESHOLD {
        return 1.0;
    }
    1.0 + RR_GAIN * (rr - RR_THRESHOLD).powf(RR_EXPONENT)
}

// ─── Akışkan tablosu ────────────────────────────────────────────────────────
// Kanonik anahtarlar frontend FLUID_PRESETS ile bire bir senkron
// (src/stores/useSimulationStore.ts). Lua `mf.set_fluid` doğrulaması ve
// testler bu tabloyu kullanır; çözücüye her zaman sayılar (µ, ρ) gider.
// Not: water ρ=1000 (spec 998 der; R'yi etkilemez, Re'de %0.2 — FORMULAS.md).

/// `key` → (kanonik anahtar, akışkan). Türkçe alias'lar çözülür.
/// `mf.set_fluid` Lua doğrulaması ve testler kullanır.
pub fn fluid_by_key(key: &str) -> Option<(&'static str, FluidProperties)> {
    let canonical = match key.trim().to_lowercase().as_str() {
        "su" | "water" => "water",
        "pbs" => "pbs",
        "plazma" | "plasma" => "plasma",
        "etanol" | "ethanol" => "etanol",
        "gliserol50" | "glycerol50" => "gliserol50",
        "pdms" => "pdms",
        "oil" | "yag" | "yağ" => "oil",
        _ => return None,
    };
    let (viscosity, density) = match canonical {
        "water" => (1.00e-3, 1000.0),
        "pbs" => (1.02e-3, 1005.0),
        "plasma" => (1.50e-3, 1025.0),
        "etanol" => (1.10e-3, 789.0),
        "gliserol50" => (6.0e-3, 1126.0),
        "pdms" => (0.097, 970.0),
        "oil" => (0.03, 860.0),
        _ => unreachable!(),
    };
    Some((canonical, FluidProperties { viscosity, density }))
}

// ─── İleri / ters direnç ────────────────────────────────────────────────────

/// Dikdörtgen kanal direnci (Pa·s/m³) — `channel_resistance` delegesi ×
/// pürüzlülük çarpanı κ(rr) (rr = 0 → çarpan tam 1, pürüzsüz direnç).
pub fn r_si(w_um: f64, h_um: f64, l_um: f64, fluid: &FluidProperties, rr: f64) -> f64 {
    channel_resistance(
        &RectChannel { width: w_um, depth: h_um, length: l_um },
        fluid,
    ) * roughness_factor(rr)
}

/// Hedef dirence ulaşan kanal uzunluğu (µm). R uzunlukta lineer olduğundan
/// `r / r(1µm)` ileri formülün kayıpsız tersidir (yuvarlama burada YAPILMAZ).
/// κ her iki tarafta aynı olduğundan ters çözüm kayıpsız kalır:
/// rr↑ ⇒ birim uzunluk direnci ↑ ⇒ aynı hedef R için daha KISA kanal.
pub fn l_um_for_r(r: f64, w_um: f64, h_um: f64, fluid: &FluidProperties, rr: f64) -> f64 {
    let r_per_um = r_si(w_um, h_um, 1.0, fluid, rr);
    if r_per_um <= 0.0 {
        return 0.0;
    }
    r / r_per_um
}

// ─── Hedef-debi çözümü (inverse design çekirdeği) ───────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TargetSpec {
    pub label: String,
    pub q_ul_min: f64, // hedef debi (µL/min)
}

/// Ortak besleme kanalı (inlet → dağıtım noktası). Derinlik dal ile aynıdır.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedSpec {
    pub w_um: f64,
    pub l_um: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchSpec {
    pub label: String,
    pub target_q_ul_min: f64,
    pub r_si: f64,          // Pa·s/m³
    pub r_disp: f64,        // mbar/(µL·min⁻¹)
    pub l_mm: f64,          // 0.01 mm'ye AŞAĞI yuvarlanmış serpantin uzunluğu
    pub footprint_mm: f64,  // hücre içi yaklaşık iz: l / SERPENTINE_LEN_FACTOR
    pub fits_envelope: bool, // l_mm <= cell_mm
    pub w_flag: bool,        // w_um < W_FAB_MIN_UM (üretim limiti)
    pub re: f64,             // hedef debide Reynolds
}

const UL_MIN_TO_M3_S: f64 = 1.0 / (1e9 * 60.0);

/// `solve_targets` girdi paketi: akışkan ve hedefler dışındaki çözüm
/// parametreleri.
#[derive(Debug, Clone)]
pub struct SolveSpec {
    pub p_in_pa: f64,
    pub w_um: f64,
    pub h_um: f64,
    pub cell_mm: Option<f64>,
    pub feed: Option<FeedSpec>,
    /// Bağıl pürüzlülük (oran, 0 = pürüzsüz) — bkz. `roughness_factor`.
    pub rr: f64,
}

/// Paralel-dal hedef debilerinden dal dirençleri/uzunlukları.
///
/// Elektrik analojisi: her dal aynı `p_branch` basıncını görür;
/// `p_branch = p_in − Q_tot·R_feed` (besleme düşümü kesin olarak düşülür),
/// `R_i = p_branch / Q_i`. Uzunluk AŞAĞI yuvarlanır: tasarım direnci hedefin
/// hafif ALTINDA kalır; üretim toleransı (daha dar/pürüzlü kanal ⇒ R↑)
/// direnci hedefe alttan taşır. Bu, µFG'nin Tabu Search fitness'ındaki
/// 1.05× asimetrik fazla-direnç cezasıyla aynı politikadır
/// (dxbiotech/Microfluidics-Resistance-ML, generative_model.py).
/// Pürüzlülük: dal VE besleme dirençleri κ(rr) çarpanını içerir; ters çözüm
/// κ'yı kayıpsız sadeleştirdiğinden rr↑ ⇒ daha kısa dal uzunluğu.
pub fn solve_targets(
    spec: &SolveSpec,
    fluid: &FluidProperties,
    targets: &[TargetSpec],
) -> Result<Vec<BranchSpec>, String> {
    let (p_in_pa, w_um, h_um, rr) = (spec.p_in_pa, spec.w_um, spec.h_um, spec.rr);
    // NaN da reddedilsin diye is_finite + <= kombinasyonu kullanılır.
    if !p_in_pa.is_finite() || p_in_pa <= 0.0 {
        return Err("Giriş basıncı pozitif olmalı.".into());
    }
    if !w_um.is_finite() || w_um <= 0.0 || !h_um.is_finite() || h_um <= 0.0 {
        return Err("Kanal kesiti (w, h) pozitif olmalı.".into());
    }
    if !rr.is_finite() || rr < 0.0 {
        return Err("Pürüzlülük (RR) sıfır veya pozitif bir oran olmalı.".into());
    }
    if targets.is_empty() {
        return Err("En az bir hedef debi gerekli.".into());
    }
    if let Some(t) = targets.iter().find(|t| !t.q_ul_min.is_finite() || t.q_ul_min <= 0.0) {
        return Err(format!("Hedef debi pozitif olmalı: \"{}\"", t.label));
    }
    let cell = spec.cell_mm.unwrap_or(CELL_MM_MAX).clamp(CELL_MM_MIN, CELL_MM_MAX);

    let q_tot_si: f64 = targets.iter().map(|t| t.q_ul_min).sum::<f64>() * UL_MIN_TO_M3_S;
    let r_feed = spec.feed.as_ref().map_or(0.0, |f| r_si(f.w_um, h_um, f.l_um, fluid, rr));
    let p_branch = p_in_pa - q_tot_si * r_feed;
    if p_branch <= 0.0 {
        return Err(
            "Besleme kanalı direnci çok yüksek: hedef debiler bu giriş basıncıyla sağlanamaz."
                .into(),
        );
    }

    let w_flag = w_um < W_FAB_MIN_UM;
    Ok(targets
        .iter()
        .map(|t| {
            let r = p_branch / (t.q_ul_min * UL_MIN_TO_M3_S);
            let l_um = l_um_for_r(r, w_um, h_um, fluid, rr);
            // Aşağı yuvarla (0.01 mm) — tasarım R'si hedefin altında kalsın
            // (fab toleransı R'yi yukarı iter); taban koruması 0.01 mm.
            let l_mm = ((l_um / 1000.0 * 100.0).floor() / 100.0).max(0.01);
            BranchSpec {
                label: t.label.clone(),
                target_q_ul_min: t.q_ul_min,
                r_si: r,
                r_disp: r * R_SI_TO_DISP,
                l_mm,
                footprint_mm: l_mm / SERPENTINE_LEN_FACTOR,
                fits_envelope: l_mm <= cell,
                w_flag,
                re: reynolds_number(t.q_ul_min, w_um, h_um, fluid),
            }
        })
        .collect())
}

// ─── Testler ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn water() -> FluidProperties {
        fluid_by_key("su").unwrap().1
    }

    /// Referans kesit (100×80 µm) için pürüzsüz, beslemesiz çözüm paketi.
    fn spec(p_in_pa: f64) -> SolveSpec {
        SolveSpec { p_in_pa, w_um: 100.0, h_um: 80.0, cell_mm: None, feed: None, rr: 0.0 }
    }

    #[test]
    fn l_for_r_roundtrip_exact() {
        let f = water();
        let r = r_si(100.0, 80.0, 63_500.0, &f, 0.0);
        let l = l_um_for_r(r, 100.0, 80.0, &f, 0.0);
        assert!((l - 63_500.0).abs() / 63_500.0 < 1e-12, "l={l}");
    }

    /// Spec referansı: su, 100×80 µm, 10 mbar (1000 Pa).
    /// Q=2 µL/min → R_disp=5 mbar/(µL/min), L≈63.5 mm, Re≈0.37, zarf İÇİ.
    #[test]
    fn spec_reference_q2() {
        let f = water();
        let out = solve_targets(
            &spec(1000.0), &f,
            &[TargetSpec { label: "Ç1".into(), q_ul_min: 2.0 }],
        )
        .unwrap();
        let b = &out[0];
        assert!((b.r_disp - 5.0).abs() < 1e-9, "r_disp={}", b.r_disp);
        assert!((b.l_mm - 63.5).abs() < 0.1, "l_mm={}", b.l_mm);
        assert!((b.re - 0.37).abs() < 0.05, "re={}", b.re);
        assert!(b.fits_envelope);
        assert!(!b.w_flag);
    }

    /// Q=0.5 µL/min → L≈254 mm > 180 → zarf DIŞI bayrağı.
    #[test]
    fn spec_reference_q05_out_of_envelope() {
        let f = water();
        let out = solve_targets(
            &spec(1000.0), &f,
            &[TargetSpec { label: "Ç1".into(), q_ul_min: 0.5 }],
        )
        .unwrap();
        let b = &out[0];
        assert!((b.l_mm - 254.0).abs() < 1.0, "l_mm={}", b.l_mm);
        assert!(!b.fits_envelope);
    }

    /// Besleme düşümlü ağda kütle korunumu: çözülen dirençlerle ağı ileri
    /// çözünce her dal debisi hedefe döner (yuvarlamasız r_si üzerinden).
    #[test]
    fn mass_conservation_with_feed() {
        let f = water();
        let feed = FeedSpec { w_um: 300.0, l_um: 1000.0 };
        let targets = [
            TargetSpec { label: "A".into(), q_ul_min: 2.0 },
            TargetSpec { label: "B".into(), q_ul_min: 1.0 },
            TargetSpec { label: "C".into(), q_ul_min: 1.0 },
        ];
        let s = SolveSpec { feed: Some(feed.clone()), ..spec(1000.0) };
        let out = solve_targets(&s, &f, &targets).unwrap();

        // İleri ağ çözümü: R_top = R_feed + (Σ 1/R_i)⁻¹; q_i = ΔP_branş / R_i
        let r_feed = r_si(feed.w_um, 80.0, feed.l_um, &f, 0.0);
        let inv_sum: f64 = out.iter().map(|b| 1.0 / b.r_si).sum();
        let r_total = r_feed + 1.0 / inv_sum;
        let q_tot = 1000.0 / r_total; // m³/s
        let p_branch = 1000.0 - q_tot * r_feed;
        for (b, t) in out.iter().zip(targets.iter()) {
            let q_ul = (p_branch / b.r_si) / UL_MIN_TO_M3_S;
            assert!(
                (q_ul - t.q_ul_min).abs() / t.q_ul_min < 1e-9,
                "{}: {} != {}",
                t.label,
                q_ul,
                t.q_ul_min
            );
        }
    }

    /// "Alttan" politikası: yuvarlanan uzunluk tam değeri ASLA aşmaz
    /// (tasarım R'si hedefin altında kalır; üretim toleransı tamamlar).
    #[test]
    fn rounded_length_never_exceeds_exact() {
        let f = water();
        for q in [0.3, 0.5, 1.0, 1.7, 2.0, 3.3, 7.9] {
            let out = solve_targets(
                &spec(1000.0), &f,
                &[TargetSpec { label: "Ç".into(), q_ul_min: q }],
            )
            .unwrap();
            let exact_um = l_um_for_r(out[0].r_si, 100.0, 80.0, &f, 0.0);
            assert!(
                out[0].l_mm * 1000.0 <= exact_um + 1e-6,
                "q={q}: l_mm={} tam değeri aşıyor ({exact_um} µm)",
                out[0].l_mm
            );
        }
    }

    #[test]
    fn w_flag_below_fab_limit() {
        let f = water();
        let out = solve_targets(
            &SolveSpec { w_um: 39.0, ..spec(1000.0) }, &f,
            &[TargetSpec { label: "Ç1".into(), q_ul_min: 1.0 }],
        )
        .unwrap();
        assert!(out[0].w_flag);
    }

    #[test]
    fn excessive_feed_resistance_errors() {
        let f = water();
        // Aşırı uzun/dar besleme: tüm basıncı yutar → Err
        let feed = FeedSpec { w_um: 40.0, l_um: 5_000_000.0 };
        let res = solve_targets(
            &SolveSpec { feed: Some(feed), ..spec(100.0) }, &f,
            &[TargetSpec { label: "Ç1".into(), q_ul_min: 10.0 }],
        );
        assert!(res.is_err());
    }

    #[test]
    fn fluid_aliases_resolve() {
        assert_eq!(fluid_by_key("su").unwrap().0, "water");
        assert_eq!(fluid_by_key("plazma").unwrap().0, "plasma");
        assert_eq!(fluid_by_key("PBS").unwrap().0, "pbs");
        assert!(fluid_by_key("civa").is_none());
        let g = fluid_by_key("gliserol50").unwrap().1;
        assert!((g.viscosity - 6.0e-3).abs() < 1e-12);
    }

    // ── Pürüzlülük (RR) ─────────────────────────────────────────────────────

    /// Eşik ve altı ile geçersiz girdi → çarpan TAM 1.0 (düzeltme devre dışı).
    #[test]
    fn roughness_factor_is_one_at_or_below_threshold() {
        for rr in [0.0, 0.005, RR_THRESHOLD, -0.05] {
            assert_eq!(roughness_factor(rr), 1.0, "rr={rr}");
        }
        for rr in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            assert_eq!(roughness_factor(rr), 1.0, "rr={rr}");
        }
    }

    /// Eşikte C⁰ süreklilik: eşiğin hemen üstünde sıçrama yok.
    #[test]
    fn roughness_factor_continuous_at_threshold() {
        let k = roughness_factor(RR_THRESHOLD + 1e-9);
        assert!(k > 1.0 && k - 1.0 < 1e-9, "k={k}");
    }

    /// Kilit değer: rr = %5 → κ = 1 + 30·0.04^1.35 = 1.3889575832…
    #[test]
    fn roughness_factor_known_value() {
        let k = roughness_factor(0.05);
        assert!((k - 1.3889575832).abs() < 1e-9, "k={k}");
    }

    /// Tüm aralıkta azalmayan, eşik üstünde kesin artan.
    #[test]
    fn roughness_factor_monotonic() {
        let ks: Vec<f64> =
            [0.0, 0.01, 0.02, 0.05, 0.10, 0.20].iter().map(|&rr| roughness_factor(rr)).collect();
        assert!(ks.windows(2).all(|w| w[0] <= w[1]), "azalmayan değil: {ks:?}");
        assert!(ks[1..].windows(2).all(|w| w[0] < w[1]), "eşik üstünde artmıyor: {ks:?}");
    }

    /// rr = 0 tam no-op: çarpan 1.0 olduğundan direnç bit düzeyinde aynı.
    #[test]
    fn zero_roughness_is_exact_noop() {
        let f = water();
        let smooth = channel_resistance(
            &RectChannel { width: 100.0, depth: 80.0, length: 63_500.0 },
            &f,
        );
        assert_eq!(r_si(100.0, 80.0, 63_500.0, &f, 0.0), smooth);
    }

    /// κ ileri ve ters yönde aynı çarpan olduğundan pürüzlü kanalda da
    /// R → L dönüşü kayıpsız; pürüzlü direnç = pürüzsüz direnç × κ.
    #[test]
    fn l_for_r_roundtrip_rough() {
        let f = water();
        let rr = 0.05;
        let r = r_si(100.0, 80.0, 63_500.0, &f, rr);
        let l = l_um_for_r(r, 100.0, 80.0, &f, rr);
        assert!((l - 63_500.0).abs() / 63_500.0 < 1e-12, "l={l}");
        let r_smooth = r_si(100.0, 80.0, 63_500.0, &f, 0.0);
        assert!((r / r_smooth - roughness_factor(rr)).abs() < 1e-12);
    }

    /// Pürüzlülük hedef direnci (R = P/Q) değiştirmez; aynı R'ye κ kat daha
    /// kısa kanalla ulaşılır (L ≈ L₀/κ; iki uzunluk da 0.01 mm'ye yuvarlı).
    #[test]
    fn solve_targets_rough_shortens_length() {
        let f = water();
        let rr = 0.05;
        let targets = [TargetSpec { label: "Ç1".into(), q_ul_min: 2.0 }];
        let smooth = solve_targets(&spec(1000.0), &f, &targets).unwrap();
        let rough = solve_targets(&SolveSpec { rr, ..spec(1000.0) }, &f, &targets).unwrap();
        let (s, r) = (&smooth[0], &rough[0]);
        assert_eq!(r.r_si, s.r_si);
        assert_eq!(r.re, s.re);
        assert!(r.l_mm < s.l_mm);
        assert!(
            (r.l_mm - s.l_mm / roughness_factor(rr)).abs() < 0.02,
            "l_rough={} l_smooth={}",
            r.l_mm,
            s.l_mm
        );
    }

    /// Pürüzlü ağda kütle korunumu: besleme ve dallar aynı κ ile ileri
    /// çözülünce (yuvarlamasız uzunluklardan) her dal debisi hedefe döner.
    #[test]
    fn mass_conservation_with_feed_rough() {
        let f = water();
        let rr = 0.05;
        let feed = FeedSpec { w_um: 300.0, l_um: 1000.0 };
        let targets = [
            TargetSpec { label: "A".into(), q_ul_min: 2.0 },
            TargetSpec { label: "B".into(), q_ul_min: 1.0 },
            TargetSpec { label: "C".into(), q_ul_min: 1.0 },
        ];
        let s = SolveSpec { feed: Some(feed.clone()), rr, ..spec(1000.0) };
        let out = solve_targets(&s, &f, &targets).unwrap();

        // Dal dirençleri tam uzunluktan PÜRÜZLÜ ileri formülle yeniden kurulur
        let r_branch: Vec<f64> = out
            .iter()
            .map(|b| r_si(100.0, 80.0, l_um_for_r(b.r_si, 100.0, 80.0, &f, rr), &f, rr))
            .collect();
        let r_feed = r_si(feed.w_um, 80.0, feed.l_um, &f, rr);
        let inv_sum: f64 = r_branch.iter().map(|r| 1.0 / r).sum();
        let q_tot = 1000.0 / (r_feed + 1.0 / inv_sum); // m³/s
        let p_branch = 1000.0 - q_tot * r_feed;
        for (r, t) in r_branch.iter().zip(targets.iter()) {
            let q_ul = (p_branch / r) / UL_MIN_TO_M3_S;
            assert!(
                (q_ul - t.q_ul_min).abs() / t.q_ul_min < 1e-9,
                "{}: {} != {}",
                t.label,
                q_ul,
                t.q_ul_min
            );
        }
    }

    #[test]
    fn invalid_roughness_errors() {
        let f = water();
        let targets = [TargetSpec { label: "Ç1".into(), q_ul_min: 1.0 }];
        for rr in [-0.01, f64::NAN, f64::INFINITY] {
            let res = solve_targets(&SolveSpec { rr, ..spec(1000.0) }, &f, &targets);
            assert!(res.is_err(), "rr={rr}");
        }
    }
}
