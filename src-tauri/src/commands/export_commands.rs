//! Dışa aktarma IPC komutları — PNG / SVG / GDS-II.
//!
//! İnce adapter katmanı: gerçek render/serileştirme `crate::export` içinde.
//! Bu komutlar frontend'ten gelen veriyi (base64 PNG, SVG string, tessellated
//! poligon listesi) ilgili domain fonksiyonuna geçirir ve hataları kullanıcıya
//! gösterilebilir `String`'e çevirir.

use crate::export::{
    ExportOptions, export_png, save_png_from_base64, save_svg,
    GdsPolygon, GdsExportParams, save_gds,
};
use std::path::Path;

/// Placeholder PNG (geriye dönük uyum). Yeni kod `export_png_data` kullanmalı.
#[tauri::command]
pub fn export_as_png(output_path: String, width: u32, height: u32) -> Result<(), String> {
    let options = ExportOptions::default();
    export_png(&[], width, height, Path::new(&output_path), &options)
        .map_err(|e| format!("PNG dışa aktarma hatası: {e}"))
}

/// Frontend'ten gelen base64 PNG verisini diske yaz.
/// `data` — data URL ("data:image/png;base64,...") veya ham base64 olabilir.
#[tauri::command]
pub fn export_png_data(
    output_path: String,
    data: String,
    options: ExportOptions,
) -> Result<(u32, u32), String> {
    save_png_from_base64(&data, Path::new(&output_path), &options)
        .map_err(|e| format!("PNG dışa aktarma hatası: {e}"))
}

/// Frontend'in oluşturduğu SVG stringini diske yaz.
#[tauri::command]
pub fn export_svg(output_path: String, svg: String) -> Result<(), String> {
    save_svg(&svg, Path::new(&output_path))
        .map_err(|e| format!("SVG dışa aktarma hatası: {e}"))
}

/// GDS-II dışa aktarma. Frontend poligonları μm cinsinden (tessellated)
/// gönderir; backend db-unit'e ölçekleyip binary stream yazar.
#[tauri::command]
pub fn export_gds_file(
    output_path: String,
    polygons: Vec<GdsPolygon>,
    params: GdsExportParams,
) -> Result<u64, String> {
    save_gds(Path::new(&output_path), &polygons, &params)
        .map_err(|e| format!("GDS-II dışa aktarma hatası: {e}"))
}
