//! Simülasyon IPC komutları — analitik ağ/kanal + CFD.
//!
//! İnce adapter: çözücüler `crate::simulation` (analytic/cfd) içinde. Bu dosya
//! frontend request DTO'larını domain tiplerine eşler ve CFD'yi bloke etmeyen
//! bir worker thread'de (`spawn_blocking`) çalıştırıp ilerleme event'i yayar.

use crate::simulation::{
    analytic::{
        RectChannel, analyze_channel, AnalyticResult,
        analyze_design, AnalyticDesignResult, DesignComponent, DesignConnection,
    },
    cfd::{CfdParams, CfdField, solve_stokes_2d},
    FluidProperties,
};
use serde::{Deserialize, Serialize};
use tauri::Emitter;

#[derive(Debug, Deserialize)]
pub struct AnalyticRequest {
    pub component_id: String,
    pub width: f64,
    pub depth: f64,
    pub length: f64,
    pub inlet_pressure: f64,
    pub fluid_viscosity: f64,
    pub fluid_density: f64,
}

#[derive(Debug, Deserialize)]
pub struct CfdRequest {
    pub channel_width_um: f64,
    pub channel_height_um: f64,
    pub inlet_velocity: f64,
    pub nx: usize,
    pub ny: usize,
    pub max_iterations: usize,
    pub fluid_viscosity: f64,
    pub fluid_density: f64,
}

#[derive(Debug, Deserialize)]
pub struct AnalyticNetworkRequest {
    pub components: Vec<DesignComponent>,
    pub connections: Vec<DesignConnection>,
    pub inlet_pressure: f64,
    pub fluid_viscosity: f64,
    pub fluid_density: f64,
}

#[derive(Debug, Clone, Serialize)]
struct ProgressPayload {
    progress: u32,
    message: String,
}

/// Analitik simülasyon — tüm tasarım ağı
#[tauri::command]
pub fn run_analytic_network(req: AnalyticNetworkRequest) -> Result<AnalyticDesignResult, String> {
    let fluid = FluidProperties {
        viscosity: req.fluid_viscosity,
        density: req.fluid_density,
    };
    Ok(analyze_design(
        &req.components,
        &req.connections,
        req.inlet_pressure,
        &fluid,
    ))
}

/// Analitik simülasyon — tek kanal (geriye dönük uyum)
#[tauri::command]
pub fn run_analytic_simulation(req: AnalyticRequest) -> Result<AnalyticResult, String> {
    let channel = RectChannel {
        width: req.width,
        depth: req.depth,
        length: req.length,
    };
    let fluid = FluidProperties {
        viscosity: req.fluid_viscosity,
        density: req.fluid_density,
    };
    Ok(analyze_channel(&req.component_id, &channel, req.inlet_pressure, &fluid))
}

/// CFD simülasyon — gerçek 2D Stokes projeksiyon çözücüsü.
/// Çözücü bloke edici CPU işidir; `spawn_blocking` ile worker thread'e at,
/// her iterasyon kontrol noktasında `simulation-progress` event'i yay.
#[tauri::command]
pub async fn run_cfd_simulation(
    req: CfdRequest,
    window: tauri::Window,
) -> Result<CfdField, String> {
    let params = CfdParams {
        nx: req.nx.max(10),
        ny: req.ny.max(5),
        channel_width_um: req.channel_width_um,
        channel_height_um: req.channel_height_um,
        inlet_velocity: req.inlet_velocity,
        max_iterations: req.max_iterations.max(50),
        tolerance: 1e-5,
    };
    let fluid = FluidProperties {
        viscosity: req.fluid_viscosity,
        density: req.fluid_density,
    };

    let handle = window.clone();
    let field = tokio::task::spawn_blocking(move || {
        solve_stokes_2d(&params, &fluid, |pct, msg| {
            let _ = handle.emit("simulation-progress", ProgressPayload {
                progress: pct,
                message: msg.to_string(),
            });
        })
    })
    .await
    .map_err(|e| format!("CFD task hatası: {e}"))?;

    Ok(field)
}
