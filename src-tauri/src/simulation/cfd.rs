//! 2D CFD çözücü — Stokes akışı (Re << 1) için projeksiyon (Chorin) yöntemi.
//! Kollokasyon grid, pseudo-zaman adımlaması, iteratif Jacobi basınç Poisson.
//!
//! Sınır koşulları:
//!   - Sol (x=0):   parabolic inlet,  u(y) = 6·u_avg · ξ·(1-ξ),  ξ = y/h,  v=0
//!   - Sağ (x=L):   outflow,           ∂u/∂x = 0, p=0
//!   - Alt/üst:     no-slip,           u=v=0
//!
//! Çıkış sahaları (velocityX/velocityY/pressure/magnitude/wallShear) her hücre
//! merkezinde tanımlıdır.

use super::FluidProperties;
use serde::{Deserialize, Serialize};

// ─── Çözücü ayar sabitleri ───────────────────────────────────────────────────
// Solver tuning değerleri. Gelecekteki doğruluk/performans fazı (ör. multigrid)
// tam bu sabitlere dokunacak; bu yüzden tek noktada isimli tutulurlar.

/// Diffusion-CFL güvenlik katsayısı: `dt = DT_DIFF_CFL · min(dx,dy)² / ν`.
/// Re ≪ 1 (Stokes) olduğundan konvektif CFL gerekmez; bu yalnızca kararlılık marjı.
const DT_DIFF_CFL: f64 = 0.24;

/// Basınç-düzeltme Poisson denklemi için her dış iterasyondaki Gauss-Seidel
/// alt-iterasyon sayısı. Anizotropik hücrelerde (dx ≠ dy) kondisyon kötüdür,
/// bu yüzden bol alt-iterasyon gerekir.
const POISSON_SUB_ITERATIONS: usize = 80;

/// Gauss-Seidel SOR aşırı-gevşetme katsayısı (1 < ω < 2). Jacobi'ye göre ~5×
/// hızlı yakınsar; 1.7 bu grid oranları için ampirik iyi değer.
const SOR_OMEGA: f64 = 1.7;

/// Çıkış sahası — frontend `CfdField` tipine doğrudan eşleşir (camelCase).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CfdField {
    pub width: usize,
    pub height: usize,
    pub dx: f64,              // μm (hücre genişliği)
    pub dy: f64,              // μm (hücre yüksekliği)
    pub velocity_x: Vec<f64>, // m/s
    pub velocity_y: Vec<f64>, // m/s
    pub pressure: Vec<f64>,   // Pa
    pub magnitude: Vec<f64>,  // m/s
    pub wall_shear: Vec<f64>, // Pa
    /// Yakınsama geçmişi (her kayıtta en büyük diverjans normu) — grafik için
    pub residuals: Vec<f64>,
    pub iterations: usize,
    pub converged: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CfdParams {
    pub nx: usize,
    pub ny: usize,
    pub channel_width_um: f64,  // L — akım yönündeki uzunluk
    pub channel_height_um: f64, // H — kanal yüksekliği
    pub inlet_velocity: f64,    // m/s (ortalama)
    pub max_iterations: usize,
    pub tolerance: f64,
}

impl Default for CfdParams {
    fn default() -> Self {
        CfdParams {
            nx: 60,
            ny: 20,
            channel_width_um: 10000.0,
            channel_height_um: 200.0,
            inlet_velocity: 0.01,
            max_iterations: 500,
            tolerance: 1e-4,
        }
    }
}

#[inline]
fn idx(i: usize, j: usize, nx: usize) -> usize { j * nx + i }

/// Analitik referans çözüm — testler ve zayıf-donanım fallback için.
#[allow(dead_code)]
pub fn solve_poiseuille(params: &CfdParams, fluid: &FluidProperties) -> CfdField {
    let nx = params.nx;
    let ny = params.ny;
    let n = nx * ny;

    let dx_m = params.channel_width_um * 1e-6 / (nx as f64);
    let dy_m = params.channel_height_um * 1e-6 / (ny as f64);

    let mut vx = vec![0.0f64; n];
    let vy = vec![0.0f64; n];
    let mut pressure = vec![0.0f64; n];
    let mut magnitude = vec![0.0f64; n];
    let mut wall_shear = vec![0.0f64; n];

    let h = params.channel_height_um * 1e-6;
    let u_avg = params.inlet_velocity;
    let dp_dx = -3.0 * fluid.viscosity * u_avg / (h * h) * 2.0;

    for j in 0..ny {
        let y = (j as f64 + 0.5) * dy_m;
        let ux = -dp_dx / (2.0 * fluid.viscosity) * y * (h - y);
        for i in 0..nx {
            let k = idx(i, j, nx);
            let x = i as f64 * dx_m;
            vx[k] = ux;
            pressure[k] = dp_dx * x;
            magnitude[k] = ux.abs();
            if j == 0 || j == ny - 1 {
                wall_shear[k] = fluid.viscosity * u_avg * 6.0 / h;
            }
        }
    }

    CfdField {
        width: nx,
        height: ny,
        dx: params.channel_width_um / nx as f64,
        dy: params.channel_height_um / ny as f64,
        velocity_x: vx,
        velocity_y: vy,
        pressure,
        magnitude,
        wall_shear,
        residuals: vec![0.0],
        iterations: 0,
        converged: true,
    }
}

/// Gerçek iteratif 2D Stokes çözücü — Chorin projeksiyon yöntemi.
///
/// `on_progress(pct, message)` — 0..=100 arası yüzde ile birlikte UI'a bildirim.
/// Re << 1 varsayımı: konvektif terim `(u·∇)u` ihmal edilir, yalnız viskoz difüzyon + ∇p.
pub fn solve_stokes_2d<F>(
    params: &CfdParams,
    fluid: &FluidProperties,
    mut on_progress: F,
) -> CfdField
where
    F: FnMut(u32, &str),
{
    let nx = params.nx.max(8);
    let ny = params.ny.max(4);
    let n = nx * ny;

    // Hücre boyutları (m)
    let dx = params.channel_width_um * 1e-6 / (nx as f64);
    let dy = params.channel_height_um * 1e-6 / (ny as f64);
    let h = params.channel_height_um * 1e-6;

    let mu = fluid.viscosity;
    let rho = fluid.density;
    let nu = mu / rho;

    // Stabilite için pseudo-zaman adımı (diffusion CFL + güvenlik katsayısı)
    let dt_diff = DT_DIFF_CFL * dx.min(dy).powi(2) / nu;
    let dt = dt_diff; // Re<<1 olduğundan konvektif CFL'ye gerek yok

    // Saha dizileri
    let mut u = vec![0.0f64; n];   // x-hızı (hücre merkezi)
    let mut v = vec![0.0f64; n];   // y-hızı
    let mut p = vec![0.0f64; n];   // basınç
    let mut u_star = vec![0.0f64; n];
    let mut v_star = vec![0.0f64; n];

    // Parabolic inlet profili (sabit)
    let inlet_profile: Vec<f64> = (0..ny)
        .map(|j| {
            let y = (j as f64 + 0.5) * dy;
            let xi = y / h;
            6.0 * params.inlet_velocity * xi * (1.0 - xi)
        })
        .collect();

    // Başlangıç: inlet hızını tüm x boyunca kopyala (iyi başlangıç tahmini)
    for j in 0..ny {
        for i in 0..nx {
            u[idx(i, j, nx)] = inlet_profile[j];
        }
    }

    let apply_velocity_bc = |u: &mut [f64], v: &mut [f64]| {
        // Sol: inlet parabolic
        for j in 0..ny {
            u[idx(0, j, nx)] = inlet_profile[j];
            v[idx(0, j, nx)] = 0.0;
        }
        // Sağ: outflow (zero gradient)
        for j in 0..ny {
            u[idx(nx - 1, j, nx)] = u[idx(nx - 2, j, nx)];
            v[idx(nx - 1, j, nx)] = v[idx(nx - 2, j, nx)];
        }
        // Alt/üst: no-slip
        for i in 0..nx {
            u[idx(i, 0, nx)] = 0.0;
            v[idx(i, 0, nx)] = 0.0;
            u[idx(i, ny - 1, nx)] = 0.0;
            v[idx(i, ny - 1, nx)] = 0.0;
        }
    };

    let apply_pressure_bc = |p: &mut [f64]| {
        // Sol (Neumann: ∂p/∂x = 0)
        for j in 0..ny {
            p[idx(0, j, nx)] = p[idx(1, j, nx)];
        }
        // Sağ: Dirichlet p=0 (referans)
        for j in 0..ny {
            p[idx(nx - 1, j, nx)] = 0.0;
        }
        // Alt/üst: Neumann
        for i in 0..nx {
            p[idx(i, 0, nx)] = p[idx(i, 1, nx)];
            p[idx(i, ny - 1, nx)] = p[idx(i, ny - 2, nx)];
        }
    };

    apply_velocity_bc(&mut u, &mut v);

    let mut residuals: Vec<f64> = Vec::with_capacity(params.max_iterations / 5 + 2);
    let mut iters_done = 0usize;
    let mut converged = false;
    let report_every = (params.max_iterations / 20).max(1); // ~20 progress bildirimi

    on_progress(2, "CFD başlatılıyor (Chorin projeksiyonu)...");

    for iter in 0..params.max_iterations {
        // ── 1. Momentum tahminleyici (Stokes: yalnız viskoz + son basınç gradyanı) ──
        for j in 1..ny - 1 {
            for i in 1..nx - 1 {
                let k = idx(i, j, nx);
                let lap_u = (u[idx(i + 1, j, nx)] - 2.0 * u[k] + u[idx(i - 1, j, nx)]) / (dx * dx)
                          + (u[idx(i, j + 1, nx)] - 2.0 * u[k] + u[idx(i, j - 1, nx)]) / (dy * dy);
                let lap_v = (v[idx(i + 1, j, nx)] - 2.0 * v[k] + v[idx(i - 1, j, nx)]) / (dx * dx)
                          + (v[idx(i, j + 1, nx)] - 2.0 * v[k] + v[idx(i, j - 1, nx)]) / (dy * dy);
                let dpdx = (p[idx(i + 1, j, nx)] - p[idx(i - 1, j, nx)]) / (2.0 * dx);
                let dpdy = (p[idx(i, j + 1, nx)] - p[idx(i, j - 1, nx)]) / (2.0 * dy);

                u_star[k] = u[k] + dt * (nu * lap_u - dpdx / rho);
                v_star[k] = v[k] + dt * (nu * lap_v - dpdy / rho);
            }
        }
        apply_velocity_bc(&mut u_star, &mut v_star);

        // ── 2. Basınç düzeltme Poisson: ∇²φ = (ρ/dt) ∇·u* ─────────────────────
        // Gauss-Seidel + SOR ile in-place — Jacobi'den ~5x hızlı yakınsar.
        // Anizotropik hücrelerde (dx ≠ dy) Poisson kondisyonu kötüdür, bol sub-iter gerekir.
        let mut phi = vec![0.0f64; n];
        let dx2 = dx * dx;
        let dy2 = dy * dy;
        let denom = 2.0 * (dx2 + dy2);
        for _ in 0..POISSON_SUB_ITERATIONS {
            for j in 1..ny - 1 {
                for i in 1..nx - 1 {
                    let k = idx(i, j, nx);
                    let div = (u_star[idx(i + 1, j, nx)] - u_star[idx(i - 1, j, nx)]) / (2.0 * dx)
                            + (v_star[idx(i, j + 1, nx)] - v_star[idx(i, j - 1, nx)]) / (2.0 * dy);
                    let rhs = rho * div / dt;
                    let num = (phi[idx(i + 1, j, nx)] + phi[idx(i - 1, j, nx)]) * dy2
                            + (phi[idx(i, j + 1, nx)] + phi[idx(i, j - 1, nx)]) * dx2
                            - rhs * dx2 * dy2;
                    let gs = num / denom;
                    phi[k] = (1.0 - SOR_OMEGA) * phi[k] + SOR_OMEGA * gs;
                }
            }
            apply_pressure_bc(&mut phi);
        }

        // ── 3. Basınç ve hız güncelle ────────────────────────────────────────
        for k in 0..n {
            p[k] += phi[k];
        }
        for j in 1..ny - 1 {
            for i in 1..nx - 1 {
                let k = idx(i, j, nx);
                let dphidx = (phi[idx(i + 1, j, nx)] - phi[idx(i - 1, j, nx)]) / (2.0 * dx);
                let dphidy = (phi[idx(i, j + 1, nx)] - phi[idx(i, j - 1, nx)]) / (2.0 * dy);
                u[k] = u_star[k] - dt * dphidx / rho;
                v[k] = v_star[k] - dt * dphidy / rho;
            }
        }
        apply_velocity_bc(&mut u, &mut v);

        // ── 4. Yakınsama kontrolü — maksimum diverjans ───────────────────────
        if iter % 5 == 0 {
            let mut max_div = 0.0f64;
            for j in 1..ny - 1 {
                for i in 1..nx - 1 {
                    let div = (u[idx(i + 1, j, nx)] - u[idx(i - 1, j, nx)]) / (2.0 * dx)
                            + (v[idx(i, j + 1, nx)] - v[idx(i, j - 1, nx)]) / (2.0 * dy);
                    if div.abs() > max_div { max_div = div.abs(); }
                }
            }
            residuals.push(max_div);
            if max_div < params.tolerance {
                iters_done = iter + 1;
                converged = true;
                on_progress(98, &format!(
                    "Yakınsadı — {} iterasyon, residual={:.2e}", iters_done, max_div
                ));
                break;
            }
        }

        if iter % report_every == 0 {
            let pct = 5 + ((iter as f64 / params.max_iterations as f64) * 90.0) as u32;
            let res = residuals.last().copied().unwrap_or(0.0);
            on_progress(
                pct.min(95),
                &format!("İterasyon {}/{} — residual={:.2e}", iter, params.max_iterations, res),
            );
        }

        iters_done = iter + 1;
    }

    // ── Sonuç alanlarını hesapla ────────────────────────────────────────────
    let mut magnitude = vec![0.0f64; n];
    for k in 0..n {
        magnitude[k] = (u[k] * u[k] + v[k] * v[k]).sqrt();
    }

    let mut wall_shear = vec![0.0f64; n];
    // Alt duvar: τ = μ · ∂u/∂y  (j=0,1 arasındaki ileri fark)
    for i in 0..nx {
        let dudy = (u[idx(i, 1, nx)] - u[idx(i, 0, nx)]) / dy;
        wall_shear[idx(i, 0, nx)] = (mu * dudy).abs();
        let dudy_top = (u[idx(i, ny - 1, nx)] - u[idx(i, ny - 2, nx)]) / dy;
        wall_shear[idx(i, ny - 1, nx)] = (mu * dudy_top).abs();
    }

    on_progress(100, "CFD tamamlandı");

    CfdField {
        width: nx,
        height: ny,
        dx: params.channel_width_um / nx as f64,
        dy: params.channel_height_um / ny as f64,
        velocity_x: u,
        velocity_y: v,
        pressure: p,
        magnitude,
        wall_shear,
        residuals,
        iterations: iters_done,
        converged,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_poiseuille_symmetry() {
        let params = CfdParams { nx: 20, ny: 10, ..Default::default() };
        let fluid = FluidProperties::water();
        let field = solve_poiseuille(&params, &fluid);
        let mid = params.ny / 2;
        let center_vx = field.velocity_x[mid * params.nx + params.nx / 2];
        let wall_vx = field.velocity_x[params.nx / 2];
        assert!(center_vx > wall_vx);
    }

    #[test]
    fn test_field_size() {
        let params = CfdParams { nx: 30, ny: 15, ..Default::default() };
        let fluid = FluidProperties::water();
        let field = solve_poiseuille(&params, &fluid);
        assert_eq!(field.velocity_x.len(), 30 * 15);
    }

    #[test]
    fn test_stokes_profile_shape() {
        // Düz kanalda Stokes çözücünün sabit-rejim profili parabolic'e yaklaşmalı.
        // (Tam yakınsama yerine geometrik doğruluk + residual düşüşü kontrol edilir.)
        let params = CfdParams {
            nx: 30,
            ny: 20,
            channel_width_um: 5000.0,
            channel_height_um: 200.0,
            inlet_velocity: 0.005,
            max_iterations: 800,
            tolerance: 1e-5,
        };
        let fluid = FluidProperties::water();
        let mut last_pct = 0u32;
        let field = solve_stokes_2d(&params, &fluid, |pct, _| { last_pct = pct; });

        assert!(last_pct >= 95, "progress %95+ olmalı, oldu {last_pct}");

        let nx = field.width;
        let ny = field.height;
        let i = nx - 2;
        let u_center = field.velocity_x[(ny / 2) * nx + i];
        let u_wall_near = field.velocity_x[nx + i];
        let u_wall = field.velocity_x[i];

        // Parabolic karakteristikleri: duvarda 0, merkezde maksimum
        assert!((u_wall).abs() < 1e-9, "duvarda u=0 olmalı, oldu {u_wall:.4}");
        assert!(
            u_center > u_wall_near,
            "merkez hızı ({u_center:.4}) duvara yakın hızdan ({u_wall_near:.4}) büyük olmalı",
        );

        // Residual iterasyon boyunca düşmeli
        let res = &field.residuals;
        assert!(res.len() >= 2, "residual geçmişi kaydedilmeli");
        assert!(
            res.last().unwrap() < res.first().unwrap(),
            "residual düşmeli: ilk={:.2e}, son={:.2e}",
            res.first().unwrap(), res.last().unwrap(),
        );
    }

    #[test]
    fn test_stokes_residual_decreases() {
        // Çözücü residual'i ciddi oranda düşürmeli (demo-düzeyi yakınsama).
        let params = CfdParams {
            nx: 20,
            ny: 12,
            channel_width_um: 3000.0,
            channel_height_um: 200.0,
            inlet_velocity: 0.002,
            max_iterations: 500,
            tolerance: 1e-5,
        };
        let fluid = FluidProperties::water();
        let field = solve_stokes_2d(&params, &fluid, |_, _| {});
        let first = *field.residuals.first().unwrap_or(&1.0);
        let last = *field.residuals.last().unwrap_or(&1.0);
        assert!(
            last < first * 0.3,
            "residual %70+ düşmeli: {first:.2e} → {last:.2e}",
        );
    }
}
