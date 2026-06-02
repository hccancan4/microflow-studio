//! Lua script çalıştırıcı (Faz 3)
//!
//! Mimari:
//! - `run_script_with_events` — Lua sandbox'ta script çalıştırır.
//! - Script içinden çağrılan Chip API fonksiyonları → design action'ları üretir.
//! - Her action, Tauri event olarak frontend'e push edilir.
//! - Böylece Lua action'ları React event'leriyle aynı store üzerinde çalışır,
//!   undo/redo stack'ine düşer ve senkron kalır.

pub mod api;
pub mod events;

use mlua::{Lua, Result as LuaResult, Value, Variadic};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use parking_lot::Mutex;

pub use events::DesignAction;

/// Script çalıştırma sonucu
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptResult {
    pub success: bool,
    pub output: String,           // stdout (print, log çağrıları)
    pub error: Option<String>,    // hata mesajı
    pub action_count: usize,      // üretilen design action sayısı
    pub sweep_count: usize,       // parametrik tarama iterasyon sayısı
    pub elapsed_ms: u64,          // çalışma süresi
}

/// Script çalıştırma bağlamı — action'ları biriktirir.
/// Hem frontend'e event olarak push'lanır, hem de senkron sonuç için döndürülür.
#[derive(Default, Clone)]
pub struct ScriptContext {
    pub actions: Arc<Mutex<Vec<DesignAction>>>,
    pub output: Arc<Mutex<String>>,
}

impl ScriptContext {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push_action(&self, action: DesignAction) {
        self.actions.lock().push(action);
    }

    pub fn append_output(&self, line: &str) {
        let mut out = self.output.lock();
        out.push_str(line);
        out.push('\n');
    }

    pub fn take_actions(&self) -> Vec<DesignAction> {
        std::mem::take(&mut *self.actions.lock())
    }

    pub fn take_output(&self) -> String {
        std::mem::take(&mut *self.output.lock())
    }
}

/// Lua sandbox oluştur — kısıtlı global'lar ile
pub fn create_sandbox(ctx: ScriptContext) -> LuaResult<Lua> {
    let lua = Lua::new();

    // Güvenlik: tehlikeli global'ları kaldır
    let globals = lua.globals();
    for name in &["os", "io", "debug", "package", "require", "loadfile", "dofile"] {
        let _ = globals.set(*name, Value::Nil);
    }

    // print override — Lua'dan çıkan her şey ctx.output'a gider
    let ctx_print = ctx.clone();
    let print_fn = lua.create_function(move |_, args: Variadic<Value>| {
        let mut line = String::new();
        for (i, v) in args.iter().enumerate() {
            if i > 0 { line.push('\t'); }
            match v {
                Value::String(s) => line.push_str(&s.to_string_lossy()),
                Value::Integer(i) => line.push_str(&i.to_string()),
                Value::Number(n) => line.push_str(&n.to_string()),
                Value::Boolean(b) => line.push_str(&b.to_string()),
                Value::Nil => line.push_str("nil"),
                _ => line.push_str(&format!("{:?}", v)),
            }
        }
        ctx_print.append_output(&line);
        Ok(())
    })?;
    globals.set("print", print_fn)?;

    // Chip API'yi yükle
    api::register_chip_api(&lua, ctx.clone())?;
    api::register_sweep_api(&lua, ctx.clone())?;

    Ok(lua)
}

/// Ana script çalıştırıcı — testler ve doğrudan çağırı için; üretimde
/// IPC yolu `run_script_collect` kullanır.
#[allow(dead_code)]
pub fn run_script(script: &str) -> ScriptResult {
    let start = std::time::Instant::now();
    let ctx = ScriptContext::new();

    let lua = match create_sandbox(ctx.clone()) {
        Ok(l) => l,
        Err(e) => {
            return ScriptResult {
                success: false,
                output: String::new(),
                error: Some(format!("Sandbox oluşturma hatası: {e}")),
                action_count: 0,
                sweep_count: 0,
                elapsed_ms: start.elapsed().as_millis() as u64,
            };
        }
    };

    // Script'i çalıştır
    let exec_result = lua.load(script).exec();
    let output = ctx.take_output();
    let actions = ctx.take_actions();
    let action_count = actions.len();

    match exec_result {
        Ok(_) => ScriptResult {
            success: true,
            output,
            error: None,
            action_count,
            sweep_count: 0,
            elapsed_ms: start.elapsed().as_millis() as u64,
        },
        Err(e) => ScriptResult {
            success: false,
            output,
            error: Some(format!("{e}")),
            action_count,
            sweep_count: 0,
            elapsed_ms: start.elapsed().as_millis() as u64,
        },
    }
}

/// Script'i çalıştır ve üretilen action'ları da döndür (IPC için)
pub fn run_script_collect(script: &str) -> (ScriptResult, Vec<DesignAction>) {
    let start = std::time::Instant::now();
    let ctx = ScriptContext::new();

    let lua = match create_sandbox(ctx.clone()) {
        Ok(l) => l,
        Err(e) => {
            let res = ScriptResult {
                success: false, output: String::new(),
                error: Some(format!("Sandbox hatası: {e}")),
                action_count: 0, sweep_count: 0,
                elapsed_ms: start.elapsed().as_millis() as u64,
            };
            return (res, vec![]);
        }
    };

    let exec_result = lua.load(script).exec();
    let output = ctx.take_output();
    let actions = ctx.take_actions();
    let action_count = actions.len();

    let result = match exec_result {
        Ok(_) => ScriptResult {
            success: true, output, error: None,
            action_count, sweep_count: 0,
            elapsed_ms: start.elapsed().as_millis() as u64,
        },
        Err(e) => ScriptResult {
            success: false, output,
            error: Some(format!("{e}")),
            action_count, sweep_count: 0,
            elapsed_ms: start.elapsed().as_millis() as u64,
        },
    };

    (result, actions)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_script() {
        let r = run_script("");
        assert!(r.success);
        assert_eq!(r.action_count, 0);
    }

    #[test]
    fn test_print_output() {
        let r = run_script("print('merhaba')");
        assert!(r.success);
        assert!(r.output.contains("merhaba"));
    }

    #[test]
    fn test_syntax_error() {
        let r = run_script("this is not lua");
        assert!(!r.success);
        assert!(r.error.is_some());
    }

    #[test]
    fn test_sandbox_blocks_os() {
        // os modülü kaldırılmış olmalı
        let r = run_script("return os.time()");
        assert!(!r.success);
    }

    /// Sadece AddComponent tipini say
    fn count_adds(actions: &[DesignAction]) -> usize {
        actions.iter().filter(|a| matches!(a, DesignAction::AddComponent { .. })).count()
    }

    #[test]
    fn test_add_channel() {
        let script = r#"
            local chip = Chip.new("test", {width = 10000, height = 10000})
            chip:add_channel({x1 = 0, y1 = 0, x2 = 5000, y2 = 0, width = 200, depth = 50})
        "#;
        let (r, actions) = run_script_collect(script);
        assert!(r.success, "Script hatası: {:?}", r.error);
        assert_eq!(count_adds(&actions), 1);
    }

    #[test]
    fn test_multiple_components() {
        let script = r#"
            local chip = Chip.new("multi", {})
            chip:add_port({x = 0, y = 0, type = "inlet", diameter = 500})
            chip:add_port({x = 10000, y = 0, type = "outlet", diameter = 500})
            chip:add_channel({x1 = 500, y1 = 0, x2 = 9500, y2 = 0, width = 200, depth = 50})
        "#;
        let (r, actions) = run_script_collect(script);
        assert!(r.success, "Hata: {:?}", r.error);
        assert_eq!(count_adds(&actions), 3);
    }

    #[test]
    fn test_parametric_loop() {
        let script = r#"
            local chip = Chip.new("loop", {})
            for i = 1, 5 do
                chip:add_channel({x1 = 0, y1 = i * 1000, x2 = 5000, y2 = i * 1000, width = 100 + i * 20, depth = 50})
            end
        "#;
        let (r, actions) = run_script_collect(script);
        assert!(r.success);
        assert_eq!(count_adds(&actions), 5);
    }

    #[test]
    fn test_connect() {
        let script = r#"
            local chip = Chip.new("conn", {})
            local inlet = chip:add_port({x = 0, y = 0, type = "inlet"})
            local outlet = chip:add_port({x = 10000, y = 0, type = "outlet"})
            chip:connect(inlet, outlet)
        "#;
        let (r, actions) = run_script_collect(script);
        assert!(r.success, "Hata: {:?}", r.error);
        let connects = actions.iter().filter(|a| matches!(a, DesignAction::Connect { .. })).count();
        assert_eq!(connects, 1);
    }

    #[test]
    fn test_sweep_run() {
        let script = r#"
            local chip = Chip.new("sweep", {})
            Sweep.run({
                param = "width",
                values = {100, 150, 200, 250},
                callback = function(w, i)
                    chip:add_channel({x1 = 0, y1 = i * 500, x2 = 5000, y2 = i * 500, width = w, depth = 50})
                end
            })
        "#;
        let (r, actions) = run_script_collect(script);
        assert!(r.success, "Hata: {:?}", r.error);
        assert_eq!(count_adds(&actions), 4);
    }
}
