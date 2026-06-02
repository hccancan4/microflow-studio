//! Dışa aktarma modülü.
//!
//! Faz 5A: PNG + SVG dışa aktarma
//! Faz 5B: GDS-II
//!
//! PNG iş akışı:
//!   1. Frontend (Konva Stage) istenen bounding-box + pixel ratio ile `toDataURL()`
//!      çağırır, base64 "data:image/png;base64,..." stringi üretir.
//!   2. Bu string `export_as_png` komutuna gelir; base64 gövdesi decode edilir,
//!      `image` crate ile `RgbaImage` olarak okunur.
//!   3. Opsiyonel arka plan tonu (White / Dark) ile compose edilir; Transparent
//!      moda dokunulmaz. Çıkış PNG olarak diske yazılır.
//!
//! SVG iş akışı:
//!   Frontend, bileşen/bağlantı listesinden hazır bir SVG stringi üretir
//!   (bkz. `src/utils/svgExporter.ts`). Backend sadece UTF-8 bytes olarak yazar.

use serde::{Deserialize, Serialize};
use anyhow::{Result, anyhow, Context};
use base64::Engine;
use image::{ImageBuffer, Rgba, RgbaImage};

pub mod gds;
pub use gds::{GdsPolygon, GdsExportParams, save_gds};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Png,
    Svg,
    #[serde(rename = "gds")]
    GdsIi,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ExportBackground {
    White,
    Dark,
    Transparent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOptions {
    pub format: ExportFormat,
    pub dpi: u32,
    pub background: ExportBackground,
    pub include_scale_bar: bool,
}

impl Default for ExportOptions {
    fn default() -> Self {
        ExportOptions {
            format: ExportFormat::Png,
            dpi: 300,
            background: ExportBackground::White,
            include_scale_bar: true,
        }
    }
}

/// `"data:image/png;base64,AAAA..."` formatındaki stringden yalnızca base64 gövdesini al.
fn strip_data_url_prefix(s: &str) -> &str {
    if let Some(idx) = s.find(",") {
        // "data:*;base64," prefix'i varsa
        if s[..idx].contains(";base64") {
            return &s[idx + 1..];
        }
    }
    s
}

fn background_rgba(bg: ExportBackground) -> Rgba<u8> {
    match bg {
        ExportBackground::White       => Rgba([255, 255, 255, 255]),
        ExportBackground::Dark        => Rgba([ 13,  17,  23, 255]), // #0d1117 (canvas dark)
        ExportBackground::Transparent => Rgba([  0,   0,   0,   0]),
    }
}

/// Kaynak RGBA görüntünün alfa kanalını hedef arkaplanın üstüne alpha-compose eder.
/// Transparent için kaynak doğrudan döner.
fn composite_over_background(src: &RgbaImage, bg: ExportBackground) -> RgbaImage {
    if bg == ExportBackground::Transparent {
        return src.clone();
    }
    let bg_px = background_rgba(bg);
    let (w, h) = src.dimensions();
    let mut out: RgbaImage = ImageBuffer::from_pixel(w, h, bg_px);
    for (x, y, px) in src.enumerate_pixels() {
        let a = px[0] as f32 / 255.0;
        let b = px[1] as f32 / 255.0;
        let c = px[2] as f32 / 255.0;
        let alpha = px[3] as f32 / 255.0;
        let bg_r = bg_px[0] as f32 / 255.0;
        let bg_g = bg_px[1] as f32 / 255.0;
        let bg_b = bg_px[2] as f32 / 255.0;
        let r = a * alpha + bg_r * (1.0 - alpha);
        let g = b * alpha + bg_g * (1.0 - alpha);
        let bl = c * alpha + bg_b * (1.0 - alpha);
        out.put_pixel(x, y, Rgba([
            (r  * 255.0).round().clamp(0.0, 255.0) as u8,
            (g  * 255.0).round().clamp(0.0, 255.0) as u8,
            (bl * 255.0).round().clamp(0.0, 255.0) as u8,
            255,
        ]));
    }
    out
}

/// Base64-encoded PNG (data URL veya ham base64) → diske kaydet.
pub fn save_png_from_base64(
    data: &str,
    output_path: &std::path::Path,
    options: &ExportOptions,
) -> Result<(u32, u32)> {
    let body = strip_data_url_prefix(data);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(body.trim())
        .map_err(|e| anyhow!("Base64 decode hatası: {e}"))?;

    let img = image::load_from_memory(&bytes)
        .context("PNG byte'ları decode edilemedi")?;
    let rgba = img.to_rgba8();

    let out = composite_over_background(&rgba, options.background);
    let (w, h) = out.dimensions();
    out.save(output_path)
        .with_context(|| format!("PNG yazılamadı: {output_path:?}"))?;

    log::info!("PNG dışa aktarıldı: {:?} ({}x{}, bg={:?})", output_path, w, h, options.background);
    Ok((w, h))
}

/// SVG dosyasını düz metin olarak yaz.
pub fn save_svg(svg: &str, output_path: &std::path::Path) -> Result<()> {
    std::fs::write(output_path, svg)
        .with_context(|| format!("SVG yazılamadı: {output_path:?}"))?;
    log::info!("SVG dışa aktarıldı: {:?} ({} bytes)", output_path, svg.len());
    Ok(())
}

/// Geriye dönük uyum — boş placeholder PNG (eski kullanım için).
/// Yeni kod `save_png_from_base64` kullanmalı.
pub fn export_png(
    _canvas_data: &[u8],
    width: u32,
    height: u32,
    output_path: &std::path::Path,
    options: &ExportOptions,
) -> Result<()> {
    let bg = background_rgba(options.background);
    let img: RgbaImage = ImageBuffer::from_pixel(width, height, bg);
    img.save(output_path)
        .with_context(|| format!("PNG yazılamadı: {output_path:?}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    /// Küçük bir kırmızı-yarı-şeffaf PNG üret → base64 → tekrar oku.
    fn make_test_png_b64() -> String {
        let mut img: RgbaImage = ImageBuffer::from_pixel(4, 4, Rgba([255, 0, 0, 128]));
        // Bir pikseli tam opak yap
        img.put_pixel(0, 0, Rgba([0, 255, 0, 255]));
        let mut buf: Vec<u8> = Vec::new();
        img.write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png).unwrap();
        let body = base64::engine::general_purpose::STANDARD.encode(&buf);
        format!("data:image/png;base64,{body}")
    }

    #[test]
    fn test_strip_data_url_prefix() {
        assert_eq!(strip_data_url_prefix("data:image/png;base64,ABCDEF"), "ABCDEF");
        assert_eq!(strip_data_url_prefix("ABCDEF"), "ABCDEF");
    }

    #[test]
    fn test_save_png_roundtrip_transparent() {
        let dir = tempdir_alt();
        let path = dir.join("out.png");
        let b64 = make_test_png_b64();
        let opts = ExportOptions { background: ExportBackground::Transparent, ..Default::default() };
        let (w, h) = save_png_from_base64(&b64, &path, &opts).unwrap();
        assert_eq!((w, h), (4, 4));
        // Oku ve alfayı doğrula
        let read = image::open(&path).unwrap().to_rgba8();
        assert_eq!(read.get_pixel(1, 1)[3], 128, "transparent modda alfa korunmalı");
    }

    #[test]
    fn test_save_png_composite_white() {
        let dir = tempdir_alt();
        let path = dir.join("out_white.png");
        let b64 = make_test_png_b64();
        let opts = ExportOptions { background: ExportBackground::White, ..Default::default() };
        save_png_from_base64(&b64, &path, &opts).unwrap();
        let read = image::open(&path).unwrap().to_rgba8();
        // Yarı-şeffaf kırmızı (255,0,0,128) beyazın üstüne → (255,~128,~128,255)
        let px = read.get_pixel(1, 1);
        assert_eq!(px[3], 255, "compose sonrası opak olmalı");
        assert_eq!(px[0], 255);
        assert!(px[1] > 120 && px[1] < 140, "G kanalı beyaz-kırmızı ortası olmalı, oldu {}", px[1]);
    }

    #[test]
    fn test_save_svg_writes_file() {
        let dir = tempdir_alt();
        let path = dir.join("out.svg");
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>"#;
        save_svg(svg, &path).unwrap();
        let contents = std::fs::read_to_string(&path).unwrap();
        assert!(contents.contains("<svg"));
        assert!(contents.contains("rect"));
    }

    /// Basit geçici dizin (tempfile bağımlılığı olmadan)
    fn tempdir_alt() -> std::path::PathBuf {
        let p = std::env::temp_dir().join(format!("microflow_export_test_{}", rand_suffix()));
        std::fs::create_dir_all(&p).unwrap();
        p
    }
    fn rand_suffix() -> u64 {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos() as u64
    }
}
