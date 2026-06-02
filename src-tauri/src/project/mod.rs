//! Proje dosyası yönetimi — .mflow (JSON tabanlı).

use serde::{Deserialize, Serialize};
use std::path::Path;
use anyhow::Result;
use chrono::Utc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMetadata {
    pub name: String,
    pub author: String,
    pub created: String,
    pub modified: String,
    pub description: String,
    pub tags: Vec<String>,
}

impl Default for ProjectMetadata {
    fn default() -> Self {
        let now = Utc::now().to_rfc3339();
        ProjectMetadata {
            name: "Yeni Proje".to_string(),
            author: String::new(),
            created: now.clone(),
            modified: now,
            description: String::new(),
            tags: vec![],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MFlowProject {
    pub version: String,
    pub metadata: ProjectMetadata,
    pub canvas: serde_json::Value,
    pub components: Vec<serde_json::Value>,
    pub connections: Vec<serde_json::Value>,
    pub simulation_results: Option<serde_json::Value>,
    pub experiment_data: Vec<serde_json::Value>,
    pub script: String,
}

impl Default for MFlowProject {
    fn default() -> Self {
        MFlowProject {
            version: "1.0".to_string(),
            metadata: ProjectMetadata::default(),
            canvas: serde_json::json!({
                "width": 50000,
                "height": 30000,
                "unit": "um"
            }),
            components: vec![],
            connections: vec![],
            simulation_results: None,
            experiment_data: vec![],
            script: String::new(),
        }
    }
}

/// Projeyi dosyaya kaydet
pub fn save_project(project: &MFlowProject, path: &Path) -> Result<()> {
    let json = serde_json::to_string_pretty(project)?;
    std::fs::write(path, json)?;
    Ok(())
}

/// Dosyadan proje yükle
pub fn load_project(path: &Path) -> Result<MFlowProject> {
    let content = std::fs::read_to_string(path)?;
    let project: MFlowProject = serde_json::from_str(&content)?;
    Ok(project)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_save_load_roundtrip() {
        let mut project = MFlowProject::default();
        project.metadata.name = "Test Projesi".to_string();
        project.script = "print('merhaba')".to_string();

        let tmp = std::env::temp_dir().join("test_microflow.mflow");
        save_project(&project, &tmp).expect("Kaydetme başarısız");
        let loaded = load_project(&tmp).expect("Yükleme başarısız");

        assert_eq!(loaded.metadata.name, "Test Projesi");
        assert_eq!(loaded.script, "print('merhaba')");
        std::fs::remove_file(&tmp).ok();
    }
}
