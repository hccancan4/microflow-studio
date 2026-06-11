// MicroFlow Studio — Rust Backend
// Tauri v2 ile mikroakışkan çip tasarım ve simülasyon platformu

mod commands;
mod simulation;
mod export;
mod project;
mod scripting;

use commands::{
    project_commands::{save_project_file, load_project_file, new_project},
    simulation_commands::{run_analytic_simulation, run_analytic_network, run_cfd_simulation, solve_targets},
    export_commands::{export_as_png, export_png_data, export_svg, export_gds_file},
    script_commands::{execute_script, execute_script_batch},
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            // Proje komutları
            save_project_file,
            load_project_file,
            new_project,
            // Simülasyon komutları
            run_analytic_simulation,
            run_analytic_network,
            run_cfd_simulation,
            solve_targets,
            // Dışa aktarma
            export_as_png,
            export_png_data,
            export_svg,
            export_gds_file,
            // Script
            execute_script,
            execute_script_batch,
        ])
        .run(tauri::generate_context!())
        .expect("Tauri uygulaması başlatılırken hata oluştu");
}
