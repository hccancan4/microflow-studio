//! Simülasyon motoru modülü.
//!
//! İki çözücü ailesi içerir:
//! - `analytic`: Hagen-Poiseuille tabanlı hızlı ağ direnç çözümü.
//! - `cfd`: 2D Stokes projeksiyon çözücüsü (detaylı, iteratif).

pub mod analytic;
pub mod cfd;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FluidProperties {
    pub viscosity: f64, // Pa·s
    pub density: f64,   // kg/m³
}

impl FluidProperties {
    /// Testlerde ve varsayılan olarak kullanılan referans akışkan.
    #[allow(dead_code)]
    pub fn water() -> Self {
        FluidProperties { viscosity: 0.001, density: 1000.0 }
    }
}
