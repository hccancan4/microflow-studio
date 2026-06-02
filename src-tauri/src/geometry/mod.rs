//! Geometri motoru — bileşen şekillerini ve bağlantıları yönetir.
//!
//! Bu modüldeki tipler şu an sadece test ve ileride kullanılmak üzere
//! tutulan public yardımcılardan oluşur; üretim kodu tessellation işini
//! `export/gds_geometry` üzerinden yapar.

#![allow(dead_code)]

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Point {
    pub x: f64, // μm
    pub y: f64, // μm
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Rect {
    pub fn contains(&self, p: &Point) -> bool {
        p.x >= self.x
            && p.x <= self.x + self.width
            && p.y >= self.y
            && p.y <= self.y + self.height
    }
}

/// Bileşen sınırlayıcı kutusu hesapla (basit yaklaşım)
pub fn bounding_box(points: &[Point]) -> Rect {
    if points.is_empty() {
        return Rect { x: 0.0, y: 0.0, width: 0.0, height: 0.0 };
    }
    let mut min_x = points[0].x;
    let mut max_x = points[0].x;
    let mut min_y = points[0].y;
    let mut max_y = points[0].y;
    for p in points.iter().skip(1) {
        if p.x < min_x { min_x = p.x; }
        if p.x > max_x { max_x = p.x; }
        if p.y < min_y { min_y = p.y; }
        if p.y > max_y { max_y = p.y; }
    }
    Rect {
        x: min_x,
        y: min_y,
        width: max_x - min_x,
        height: max_y - min_y,
    }
}

/// Yay (arc) noktaları — eğri kanal için
pub fn arc_points(
    center_x: f64,
    center_y: f64,
    radius: f64,
    start_angle_deg: f64,
    end_angle_deg: f64,
    num_points: usize,
) -> Vec<Point> {
    let start = start_angle_deg.to_radians();
    let end = end_angle_deg.to_radians();
    (0..=num_points)
        .map(|i| {
            let t = i as f64 / num_points as f64;
            let angle = start + t * (end - start);
            Point {
                x: center_x + radius * angle.cos(),
                y: center_y + radius * angle.sin(),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bounding_box() {
        let points = vec![
            Point { x: 0.0, y: 0.0 },
            Point { x: 100.0, y: 50.0 },
            Point { x: -10.0, y: 200.0 },
        ];
        let bb = bounding_box(&points);
        assert_eq!(bb.x, -10.0);
        assert_eq!(bb.y, 0.0);
        assert_eq!(bb.width, 110.0);
        assert_eq!(bb.height, 200.0);
    }

    #[test]
    fn test_arc_points_count() {
        let pts = arc_points(0.0, 0.0, 100.0, 0.0, 90.0, 8);
        assert_eq!(pts.len(), 9); // num_points + 1
    }
}
