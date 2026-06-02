use crate::project::{MFlowProject, save_project, load_project};
use std::path::Path;

/// Projeyi dosyaya kaydet
#[tauri::command]
pub fn save_project_file(project: MFlowProject, path: String) -> Result<(), String> {
    save_project(&project, Path::new(&path))
        .map_err(|e| format!("Kaydetme hatası: {e}"))
}

/// Dosyadan proje yükle
#[tauri::command]
pub fn load_project_file(path: String) -> Result<MFlowProject, String> {
    load_project(Path::new(&path))
        .map_err(|e| format!("Yükleme hatası: {e}"))
}

/// Yeni proje oluştur
#[tauri::command]
pub fn new_project() -> MFlowProject {
    MFlowProject::default()
}
