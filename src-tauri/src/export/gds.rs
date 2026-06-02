//! GDS-II Stream Format yazıcı (Faz 5B).
//!
//! GDS-II ikili bir kayıt akışıdır. Her kayıt:
//!   [u16 length, incl. header] [u8 rec_type] [u8 data_type] [data...]
//! tüm çok-baytlı alanlar big-endian.
//!
//! Bu yazıcı yalnızca düz bir yapı (tek hücre, BOUNDARY poligonları) üretir —
//! mikroakışkan maskeleri için yeterli; hiyerarşi (SREF/AREF) kullanılmaz.
//!
//! Referans: Cadence GDS-II Stream Format Manual, Rev. 6.0 (Şubat 1987).

use std::io::Write;
use std::path::Path;
use anyhow::{Result, anyhow, Context};
use serde::{Deserialize, Serialize};

// ─── Kayıt tipleri ──────────────────────────────────────────────────────────
const REC_HEADER:   u8 = 0x00;
const REC_BGNLIB:   u8 = 0x01;
const REC_LIBNAME:  u8 = 0x02;
const REC_UNITS:    u8 = 0x03;
const REC_ENDLIB:   u8 = 0x04;
const REC_BGNSTR:   u8 = 0x05;
const REC_STRNAME:  u8 = 0x06;
const REC_ENDSTR:   u8 = 0x07;
const REC_BOUNDARY: u8 = 0x08;
const REC_LAYER:    u8 = 0x0D;
const REC_DATATYPE: u8 = 0x0E;
const REC_XY:       u8 = 0x10;
const REC_ENDEL:    u8 = 0x11;

// ─── Veri tipleri ───────────────────────────────────────────────────────────
const DT_NO_DATA:     u8 = 0x00;
const DT_TWO_BYTE:    u8 = 0x02;
const DT_FOUR_BYTE:   u8 = 0x03;
const DT_EIGHT_REAL:  u8 = 0x05;
const DT_ASCII:       u8 = 0x06;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GdsPolygon {
    pub layer: i16,
    pub datatype: i16,
    /// Dünya koordinatlarında μm cinsinden poligon köşeleri (kapalı değilse
    /// yazıcı otomatik kapatır).
    pub points_um: Vec<(f64, f64)>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GdsExportParams {
    /// GDS-II veritabanı biriminin μm cinsi. Örn. 0.001 ⇒ 1 nm çözünürlük.
    pub db_unit_um: f64,
    /// Yapı ("struct") adı — GDS viewer'da görünür.
    pub struct_name: String,
    /// Kütüphane adı.
    pub lib_name: String,
}

impl Default for GdsExportParams {
    fn default() -> Self {
        Self {
            db_unit_um: 0.001,     // 1 nm
            struct_name: "MICROFLOW_CHIP".into(),
            lib_name:    "MICROFLOW".into(),
        }
    }
}

// ─── GDS 8-byte real encoding ───────────────────────────────────────────────
//
// Format (big-endian):
//   bit 0      : işaret
//   bit 1..7   : üs (excess-64, taban 16)
//   bit 8..63  : mantissa (pozitif kesir, MSB = 1/16)
//
// Değer = (-1)^S · M · 16^(E-64), 0 ≤ M < 1
fn pack_gds_real(v: f64) -> [u8; 8] {
    if v == 0.0 {
        return [0; 8];
    }
    let sign = if v < 0.0 { 0x80u8 } else { 0x00u8 };
    let mut abs = v.abs();

    // Üssü taban-16 olarak bul: abs = mantissa * 16^exp, 1/16 ≤ mantissa < 1.
    let mut exp: i32 = 0;
    while abs >= 1.0 { abs /= 16.0; exp += 1; }
    while abs < 1.0 / 16.0 && abs > 0.0 { abs *= 16.0; exp -= 1; }

    let biased = exp + 64;
    // Excess-64 [0..127] aralığında olmalı
    if !(0..=127).contains(&biased) {
        // Overflow → sıfır yaz (güvenli davranış)
        return [0; 8];
    }

    // 56-bit mantissa'yı tam sayıya ölçekle
    let mantissa = (abs * ((1u64 << 56) as f64)).round() as u64;
    let mantissa = mantissa & 0x00FF_FFFF_FFFF_FFFFu64; // 56 bit

    let byte0 = sign | (biased as u8 & 0x7F);
    let mut out = [0u8; 8];
    out[0] = byte0;
    out[1] = ((mantissa >> 48) & 0xFF) as u8;
    out[2] = ((mantissa >> 40) & 0xFF) as u8;
    out[3] = ((mantissa >> 32) & 0xFF) as u8;
    out[4] = ((mantissa >> 24) & 0xFF) as u8;
    out[5] = ((mantissa >> 16) & 0xFF) as u8;
    out[6] = ((mantissa >> 8)  & 0xFF) as u8;
    out[7] = ( mantissa        & 0xFF) as u8;
    out
}

// ─── Kayıt yazım yardımcıları ───────────────────────────────────────────────

fn write_record<W: Write>(w: &mut W, rec_type: u8, data_type: u8, data: &[u8]) -> Result<()> {
    let len = 4 + data.len();
    if len > u16::MAX as usize {
        return Err(anyhow!("GDS kaydı çok büyük ({} bayt)", len));
    }
    // Uzunluk büyük-endian u16
    w.write_all(&(len as u16).to_be_bytes())?;
    w.write_all(&[rec_type, data_type])?;
    if !data.is_empty() {
        w.write_all(data)?;
    }
    Ok(())
}

fn write_no_data<W: Write>(w: &mut W, rec_type: u8) -> Result<()> {
    write_record(w, rec_type, DT_NO_DATA, &[])
}

fn write_i16<W: Write>(w: &mut W, rec_type: u8, v: i16) -> Result<()> {
    write_record(w, rec_type, DT_TWO_BYTE, &v.to_be_bytes())
}

fn write_ascii<W: Write>(w: &mut W, rec_type: u8, s: &str) -> Result<()> {
    // Çift-bayt'a hizala (GDS spec: ASCII alanlar eşit uzunlukta olmalı)
    let mut bytes = s.as_bytes().to_vec();
    if !bytes.len().is_multiple_of(2) { bytes.push(0); }
    write_record(w, rec_type, DT_ASCII, &bytes)
}

fn write_units<W: Write>(w: &mut W, user_in_db: f64, db_in_meters: f64) -> Result<()> {
    let mut buf = Vec::with_capacity(16);
    buf.extend_from_slice(&pack_gds_real(user_in_db));
    buf.extend_from_slice(&pack_gds_real(db_in_meters));
    write_record(w, REC_UNITS, DT_EIGHT_REAL, &buf)
}

/// 12 × i16: son-değiştirme tarihi + erişim tarihi. Sıfırlarla doldururuz.
fn write_timestamp_block<W: Write>(w: &mut W, rec_type: u8) -> Result<()> {
    let buf = [0u8; 24];
    write_record(w, rec_type, DT_TWO_BYTE, &buf)
}

fn write_xy<W: Write>(w: &mut W, coords_db: &[(i32, i32)]) -> Result<()> {
    let mut buf = Vec::with_capacity(coords_db.len() * 8);
    for (x, y) in coords_db {
        buf.extend_from_slice(&x.to_be_bytes());
        buf.extend_from_slice(&y.to_be_bytes());
    }
    write_record(w, REC_XY, DT_FOUR_BYTE, &buf)
}

// ─── Genel yazıcı ──────────────────────────────────────────────────────────

pub fn write_gds<W: Write>(
    w: &mut W,
    polygons: &[GdsPolygon],
    params: &GdsExportParams,
) -> Result<()> {
    // HEADER — version 600 (GDS-II release 6.0)
    write_i16(w, REC_HEADER, 600)?;
    // BGNLIB — timestamps (zeros)
    write_timestamp_block(w, REC_BGNLIB)?;
    // LIBNAME
    write_ascii(w, REC_LIBNAME, &params.lib_name)?;
    // UNITS: (db_unit_in_user_units, db_unit_in_meters)
    // GDS spec (Calma/Cadence) + KLayout convention: her iki alan da
    // "bir db-unit'in büyüklüğü". Kullanıcı birimi μm (bkz. scale aşağıda).
    //   Örn. db_unit_um = 0.001  ⇒  (0.001, 1e-9)  — 1 db-unit = 1 nm.
    let db_in_user = params.db_unit_um;
    let db_in_meters = params.db_unit_um * 1e-6;
    write_units(w, db_in_user, db_in_meters)?;
    // BGNSTR
    write_timestamp_block(w, REC_BGNSTR)?;
    // STRNAME
    write_ascii(w, REC_STRNAME, &params.struct_name)?;

    // Her poligon için BOUNDARY bloğu
    let scale = 1.0 / params.db_unit_um; // μm → db-unit
    for poly in polygons {
        if poly.points_um.len() < 3 {
            continue; // geçersiz
        }
        write_no_data(w, REC_BOUNDARY)?;
        write_i16(w, REC_LAYER, poly.layer)?;
        write_i16(w, REC_DATATYPE, poly.datatype)?;

        // db-unit i32 koordinatlar; ilk == son (kapalı poligon)
        let mut coords: Vec<(i32, i32)> = poly.points_um.iter()
            .map(|(x, y)| {
                let xi = (x * scale).round() as i64;
                let yi = (y * scale).round() as i64;
                (xi.clamp(i32::MIN as i64, i32::MAX as i64) as i32,
                 yi.clamp(i32::MIN as i64, i32::MAX as i64) as i32)
            })
            .collect();
        // Kapat
        if coords.first() != coords.last() {
            if let Some(&first_pt) = coords.first() {
                coords.push(first_pt);
            }
        }
        // GDS spec'i XY'de maksimum 8191 nokta / kayıt öngörür; biz küçük poligonlarla
        // çalıştığımız için bu sınıra takılmıyoruz, yine de kontrol:
        if coords.len() > 8191 {
            return Err(anyhow!("Poligon XY nokta limiti aşıldı: {}", coords.len()));
        }
        write_xy(w, &coords)?;
        write_no_data(w, REC_ENDEL)?;
    }

    write_no_data(w, REC_ENDSTR)?;
    write_no_data(w, REC_ENDLIB)?;
    Ok(())
}

pub fn save_gds(
    path: &Path,
    polygons: &[GdsPolygon],
    params: &GdsExportParams,
) -> Result<u64> {
    let file = std::fs::File::create(path)
        .with_context(|| format!("GDS dosyası oluşturulamadı: {path:?}"))?;
    let mut bw = std::io::BufWriter::new(file);
    write_gds(&mut bw, polygons, params)?;
    bw.flush()?;
    let size = std::fs::metadata(path)?.len();
    log::info!("GDS-II dışa aktarıldı: {:?} ({} poligon, {} bayt)",
        path, polygons.len(), size);
    Ok(size)
}

// ─── Testler ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn real_encode_zero() {
        assert_eq!(pack_gds_real(0.0), [0u8; 8]);
    }

    #[test]
    fn real_encode_one() {
        // 1.0 = (1/16) · 16^1 → exp=1 (biased=65), mantissa MSB set
        let b = pack_gds_real(1.0);
        assert_eq!(b[0], 0x41); // 65 = 0x41
        assert_eq!(b[1], 0x10); // MSB of 56-bit mantissa: 0.0625 · 2^56 = 2^52
    }

    #[test]
    fn real_encode_negative() {
        let b = pack_gds_real(-1.0);
        assert_eq!(b[0] & 0x80, 0x80);       // sign
        assert_eq!(b[0] & 0x7F, 0x41);       // same exponent
    }

    #[test]
    fn real_encode_roundtrip_approx() {
        // 0.001 decode edilebilir olmalı — GDS-real yuvarlama hatası < 1e-16
        let b = pack_gds_real(0.001);
        let decoded = decode_gds_real(&b);
        assert!((decoded - 0.001).abs() < 1e-15, "decoded={}", decoded);
    }

    #[test]
    fn write_gds_basic_structure() {
        let polys = vec![
            GdsPolygon {
                layer: 1, datatype: 0,
                points_um: vec![(0.0, 0.0), (1000.0, 0.0), (1000.0, 500.0), (0.0, 500.0)],
            },
        ];
        let params = GdsExportParams::default();
        let mut buf = Vec::new();
        write_gds(&mut buf, &polys, &params).unwrap();

        // İlk kayıt HEADER olmalı
        // len=6, rec=0x00, dt=0x02, value=600 (0x0258)
        assert_eq!(&buf[0..6], &[0x00, 0x06, 0x00, 0x02, 0x02, 0x58]);

        // Son 4 bayt ENDLIB: len=4, rec=0x04, dt=0x00
        let n = buf.len();
        assert_eq!(&buf[n - 4..], &[0x00, 0x04, 0x04, 0x00]);

        // BOUNDARY kaydı bir yerlerde olmalı (rec_type 0x08 + dt 0x00)
        let mut found = false;
        let mut i = 0;
        while i + 4 <= buf.len() {
            let len = u16::from_be_bytes([buf[i], buf[i+1]]) as usize;
            if len == 0 { break; }
            if buf[i+2] == REC_BOUNDARY { found = true; break; }
            i += len;
        }
        assert!(found, "BOUNDARY kaydı bulunamadı");
    }

    #[test]
    fn save_gds_writes_file() {
        let path = std::env::temp_dir().join(format!("mf_gds_test_{}.gds", rand_nanos()));
        let polys = vec![
            GdsPolygon {
                layer: 1, datatype: 0,
                points_um: vec![(0.0, 0.0), (100.0, 0.0), (100.0, 100.0), (0.0, 100.0)],
            },
        ];
        let size = save_gds(&path, &polys, &GdsExportParams::default()).unwrap();
        assert!(size > 0);
        let bytes = std::fs::read(&path).unwrap();
        // HEADER imzası
        assert_eq!(&bytes[0..2], &[0x00, 0x06]);
        std::fs::remove_file(&path).ok();
    }

    /// Test yardımcısı — pack_gds_real'in tersi.
    fn decode_gds_real(b: &[u8; 8]) -> f64 {
        let sign = if b[0] & 0x80 != 0 { -1.0 } else { 1.0 };
        let exp = (b[0] & 0x7F) as i32 - 64;
        let mantissa = ((b[1] as u64) << 48)
            | ((b[2] as u64) << 40)
            | ((b[3] as u64) << 32)
            | ((b[4] as u64) << 24)
            | ((b[5] as u64) << 16)
            | ((b[6] as u64) << 8)
            |  (b[7] as u64);
        let frac = mantissa as f64 / ((1u64 << 56) as f64);
        sign * frac * 16f64.powi(exp)
    }

    fn rand_nanos() -> u64 {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos() as u64
    }

    // Yazım sırasında Cursor'un kullanıldığından emin ol (unused-import uyarısını önle)
    #[test]
    fn cursor_smoke() {
        let _ = Cursor::new(vec![0u8; 0]);
    }
}
