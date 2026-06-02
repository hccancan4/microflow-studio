//! Lua Chip API
//!
//! Sağlanan fonksiyonlar:
//!   Chip.new(name, opts)                         → yeni çip
//!   chip:add_channel(params)                     → düz kanal
//!   chip:add_curved_channel(params)              → eğri kanal
//!   chip:add_port(params)                        → giriş/çıkış portu
//!   chip:add_t_junction(params)                  → T-bağlantı
//!   chip:add_y_junction(params)                  → Y-bağlantı
//!   chip:add_mixer(params)                       → serpantin mikser
//!   chip:add_droplet_generator(params)           → damla üreteci
//!   chip:add_filter_array(params)                → pillar array
//!   chip:add_expansion(params)                   → genişleme/daralma
//!   chip:add_reservoir(params)                   → rezervuar
//!   chip:connect(from, to)                       → iki bileşeni bağla
//!   chip:clear()                                 → tasarımı temizle
//!   Sweep.run(opts)                              → parametrik tarama

use mlua::{Lua, Result as LuaResult, Table, UserData, UserDataMethods, Value, Function};
use serde_json::json;
use super::{ScriptContext, DesignAction};

/// Lua'da çip referansı — sadece id içerir. Tüm action'lar ctx üzerinden push'lanır.
#[derive(Clone)]
pub struct Chip {
    /// Script'te atanan çip adı; şu an sadece debug için tutulur.
    #[allow(dead_code)]
    pub name: String,
    pub ctx: ScriptContext,
}

/// Port referansı — Lua koduna döndürülür. connect() fonksiyonu bunları alır.
#[derive(Debug, Clone)]
pub struct PortRef {
    pub component_id: String,
    pub port_index: u32,
}

impl UserData for PortRef {
    fn add_fields<F: mlua::UserDataFields<Self>>(fields: &mut F) {
        fields.add_field_method_get("component_id", |_, this| Ok(this.component_id.clone()));
        fields.add_field_method_get("port_index", |_, this| Ok(this.port_index));
    }
}

/// Bileşen referansı — bir komponente eklendikten sonra döner.
/// .input, .output gibi portlarına erişim sağlar.
#[derive(Debug, Clone)]
pub struct ComponentRef {
    pub id: String,
    pub component_type: String,
}

impl UserData for ComponentRef {
    fn add_fields<F: mlua::UserDataFields<Self>>(fields: &mut F) {
        fields.add_field_method_get("id", |_, this| Ok(this.id.clone()));
        fields.add_field_method_get("type", |_, this| Ok(this.component_type.clone()));

        fields.add_field_method_get("input", |_, this| {
            Ok(PortRef { component_id: this.id.clone(), port_index: 0 })
        });
        fields.add_field_method_get("output", |_, this| {
            // Farklı bileşenlerde çıkış port indeksi farklı olabilir.
            // Basit kanallar için 1 (giriş=0, çıkış=1). T/Y için default output=1.
            Ok(PortRef { component_id: this.id.clone(), port_index: 1 })
        });
    }

    fn add_methods<M: UserDataMethods<Self>>(methods: &mut M) {
        // comp:port(n) — n. port referansı
        methods.add_method("port", |_, this, idx: u32| {
            Ok(PortRef { component_id: this.id.clone(), port_index: idx })
        });
    }
}

impl UserData for Chip {
    fn add_methods<M: UserDataMethods<Self>>(methods: &mut M) {
        // ── add_channel(params) ─────────────────────────────────────────────
        methods.add_method("add_channel", |_, this, params: Table| {
            let x1: f64 = params.get("x1").unwrap_or(0.0);
            let y1: f64 = params.get("y1").unwrap_or(0.0);
            let x2: f64 = params.get("x2").unwrap_or(1000.0);
            let y2: f64 = params.get("y2").unwrap_or(0.0);
            let width: f64 = params.get("width").unwrap_or(200.0);
            let depth: f64 = params.get("depth").unwrap_or(50.0);
            let label: Option<String> = params.get("label").ok();

            let length = ((x2 - x1).powi(2) + (y2 - y1).powi(2)).sqrt();
            let rotation = (y2 - y1).atan2(x2 - x1).to_degrees();

            let id = gen_id("comp");
            let component = json!({
                "id": id,
                "type": "straight_channel",
                "position": { "x": x1, "y": y1 },
                "rotation": rotation,
                "label": label,
                "params": { "width": width, "length": length, "depth": depth },
                "ports": []
            });

            this.ctx.push_action(DesignAction::AddComponent { component });
            Ok(ComponentRef { id, component_type: "straight_channel".into() })
        });

        // ── add_curved_channel(params) ──────────────────────────────────────
        methods.add_method("add_curved_channel", |_, this, params: Table| {
            let x: f64 = params.get("x").unwrap_or(0.0);
            let y: f64 = params.get("y").unwrap_or(0.0);
            let radius: f64 = params.get("radius").unwrap_or(1000.0);
            let angle: f64 = params.get("angle").unwrap_or(90.0);
            let width: f64 = params.get("width").unwrap_or(200.0);
            let depth: f64 = params.get("depth").unwrap_or(50.0);
            let rotation: f64 = params.get("rotation").unwrap_or(0.0);
            let label: Option<String> = params.get("label").ok();

            let id = gen_id("comp");
            let component = json!({
                "id": id, "type": "curved_channel",
                "position": { "x": x, "y": y }, "rotation": rotation, "label": label,
                "params": { "radius": radius, "angle": angle, "width": width, "depth": depth },
                "ports": []
            });
            this.ctx.push_action(DesignAction::AddComponent { component });
            Ok(ComponentRef { id, component_type: "curved_channel".into() })
        });

        // ── add_port(params) ────────────────────────────────────────────────
        methods.add_method("add_port", |_, this, params: Table| {
            let x: f64 = params.get("x").unwrap_or(0.0);
            let y: f64 = params.get("y").unwrap_or(0.0);
            let diameter: f64 = params.get("diameter").unwrap_or(500.0);
            let port_type: String = params.get("type").unwrap_or_else(|_| "inlet".to_string());
            let label: Option<String> = params.get("label").ok();

            let id = gen_id("port");
            let component = json!({
                "id": id, "type": "port",
                "position": { "x": x, "y": y }, "rotation": 0.0, "label": label,
                "params": { "diameter": diameter, "portType": port_type },
                "ports": []
            });
            this.ctx.push_action(DesignAction::AddComponent { component });
            Ok(ComponentRef { id, component_type: "port".into() })
        });

        // ── add_t_junction(params) ──────────────────────────────────────────
        methods.add_method("add_t_junction", |_, this, params: Table| {
            let x: f64 = params.get("x").unwrap_or(0.0);
            let y: f64 = params.get("y").unwrap_or(0.0);
            let main_width: f64 = params.get("main_width").unwrap_or(300.0);
            let branch_width: f64 = params.get("branch_width").unwrap_or(200.0);
            let angle: f64 = params.get("angle").unwrap_or(90.0);
            let depth: f64 = params.get("depth").unwrap_or(50.0);
            let rotation: f64 = params.get("rotation").unwrap_or(0.0);
            let label: Option<String> = params.get("label").ok();

            let id = gen_id("tjunc");
            let component = json!({
                "id": id, "type": "t_junction",
                "position": { "x": x, "y": y }, "rotation": rotation, "label": label,
                "params": {
                    "mainWidth": main_width, "branchWidth": branch_width,
                    "angle": angle, "depth": depth
                },
                "ports": []
            });
            this.ctx.push_action(DesignAction::AddComponent { component });
            Ok(ComponentRef { id, component_type: "t_junction".into() })
        });

        // ── add_y_junction(params) ──────────────────────────────────────────
        methods.add_method("add_y_junction", |_, this, params: Table| {
            let x: f64 = params.get("x").unwrap_or(0.0);
            let y: f64 = params.get("y").unwrap_or(0.0);
            let main_width: f64 = params.get("main_width").unwrap_or(300.0);
            let branch_width: f64 = params.get("branch_width").unwrap_or(200.0);
            let branch_angle: f64 = params.get("branch_angle").unwrap_or(45.0);
            let depth: f64 = params.get("depth").unwrap_or(50.0);
            let rotation: f64 = params.get("rotation").unwrap_or(0.0);
            let label: Option<String> = params.get("label").ok();

            let id = gen_id("yjunc");
            let component = json!({
                "id": id, "type": "y_junction",
                "position": { "x": x, "y": y }, "rotation": rotation, "label": label,
                "params": {
                    "mainWidth": main_width, "branchWidth": branch_width,
                    "branchAngle": branch_angle, "depth": depth
                },
                "ports": []
            });
            this.ctx.push_action(DesignAction::AddComponent { component });
            Ok(ComponentRef { id, component_type: "y_junction".into() })
        });

        // ── add_mixer(params) ───────────────────────────────────────────────
        methods.add_method("add_mixer", |_, this, params: Table| {
            let x: f64 = params.get("x").unwrap_or(0.0);
            let y: f64 = params.get("y").unwrap_or(0.0);
            let channel_width: f64 = params.get("channel_width").unwrap_or(200.0);
            let turns: u32 = params.get("turns").unwrap_or(5);
            let pitch: f64 = params.get("pitch").unwrap_or(600.0);
            let depth: f64 = params.get("depth").unwrap_or(50.0);
            let rotation: f64 = params.get("rotation").unwrap_or(0.0);
            let label: Option<String> = params.get("label").ok();

            let id = gen_id("mixer");
            let component = json!({
                "id": id, "type": "serpentine_mixer",
                "position": { "x": x, "y": y }, "rotation": rotation, "label": label,
                "params": {
                    "channelWidth": channel_width, "turns": turns,
                    "pitch": pitch, "depth": depth
                },
                "ports": []
            });
            this.ctx.push_action(DesignAction::AddComponent { component });
            Ok(ComponentRef { id, component_type: "serpentine_mixer".into() })
        });

        // ── add_droplet_generator(params) ───────────────────────────────────
        methods.add_method("add_droplet_generator", |_, this, params: Table| {
            let x: f64 = params.get("x").unwrap_or(0.0);
            let y: f64 = params.get("y").unwrap_or(0.0);
            let orifice_width: f64 = params.get("orifice_width").unwrap_or(100.0);
            let main_channel_width: f64 = params.get("main_channel_width").unwrap_or(300.0);
            let dispersed_channel_width: f64 = params.get("dispersed_channel_width").unwrap_or(200.0);
            let depth: f64 = params.get("depth").unwrap_or(50.0);
            let rotation: f64 = params.get("rotation").unwrap_or(0.0);
            let label: Option<String> = params.get("label").ok();

            let id = gen_id("drop");
            let component = json!({
                "id": id, "type": "droplet_generator",
                "position": { "x": x, "y": y }, "rotation": rotation, "label": label,
                "params": {
                    "orificeWidth": orifice_width,
                    "mainChannelWidth": main_channel_width,
                    "dispersedChannelWidth": dispersed_channel_width,
                    "depth": depth
                },
                "ports": []
            });
            this.ctx.push_action(DesignAction::AddComponent { component });
            Ok(ComponentRef { id, component_type: "droplet_generator".into() })
        });

        // ── add_filter_array(params) ────────────────────────────────────────
        methods.add_method("add_filter_array", |_, this, params: Table| {
            let x: f64 = params.get("x").unwrap_or(0.0);
            let y: f64 = params.get("y").unwrap_or(0.0);
            let pillar_diameter: f64 = params.get("pillar_diameter").unwrap_or(50.0);
            let spacing: f64 = params.get("spacing").unwrap_or(100.0);
            let rows: u32 = params.get("rows").unwrap_or(5);
            let columns: u32 = params.get("columns").unwrap_or(10);
            let depth: f64 = params.get("depth").unwrap_or(50.0);
            let rotation: f64 = params.get("rotation").unwrap_or(0.0);
            let label: Option<String> = params.get("label").ok();

            let id = gen_id("filter");
            let component = json!({
                "id": id, "type": "filter_array",
                "position": { "x": x, "y": y }, "rotation": rotation, "label": label,
                "params": {
                    "pillarDiameter": pillar_diameter, "spacing": spacing,
                    "rows": rows, "columns": columns, "depth": depth
                },
                "ports": []
            });
            this.ctx.push_action(DesignAction::AddComponent { component });
            Ok(ComponentRef { id, component_type: "filter_array".into() })
        });

        // ── add_expansion(params) ───────────────────────────────────────────
        methods.add_method("add_expansion", |_, this, params: Table| {
            let x: f64 = params.get("x").unwrap_or(0.0);
            let y: f64 = params.get("y").unwrap_or(0.0);
            let inlet_width: f64 = params.get("inlet_width").unwrap_or(200.0);
            let outlet_width: f64 = params.get("outlet_width").unwrap_or(500.0);
            let length: f64 = params.get("length").unwrap_or(1000.0);
            let depth: f64 = params.get("depth").unwrap_or(50.0);
            let rotation: f64 = params.get("rotation").unwrap_or(0.0);
            let label: Option<String> = params.get("label").ok();

            let id = gen_id("exp");
            let component = json!({
                "id": id, "type": "expansion",
                "position": { "x": x, "y": y }, "rotation": rotation, "label": label,
                "params": {
                    "inletWidth": inlet_width, "outletWidth": outlet_width,
                    "length": length, "depth": depth
                },
                "ports": []
            });
            this.ctx.push_action(DesignAction::AddComponent { component });
            Ok(ComponentRef { id, component_type: "expansion".into() })
        });

        // ── add_reservoir(params) ───────────────────────────────────────────
        methods.add_method("add_reservoir", |_, this, params: Table| {
            let x: f64 = params.get("x").unwrap_or(0.0);
            let y: f64 = params.get("y").unwrap_or(0.0);
            let width: f64 = params.get("width").unwrap_or(2000.0);
            let height: f64 = params.get("height").unwrap_or(2000.0);
            let depth: f64 = params.get("depth").unwrap_or(500.0);
            let label: Option<String> = params.get("label").ok();

            let id = gen_id("rsv");
            let component = json!({
                "id": id, "type": "reservoir",
                "position": { "x": x, "y": y }, "rotation": 0.0, "label": label,
                "params": { "width": width, "height": height, "depth": depth },
                "ports": []
            });
            this.ctx.push_action(DesignAction::AddComponent { component });
            Ok(ComponentRef { id, component_type: "reservoir".into() })
        });

        // ── connect(from_port, to_port) ─────────────────────────────────────
        methods.add_method("connect", |_, this, (from, to): (Value, Value)| {
            let (from_comp, from_idx) = port_from_value(&from)?;
            let (to_comp,   to_idx)   = port_from_value(&to)?;

            let conn_id = gen_id("conn");
            let connection = json!({
                "id": conn_id,
                "fromComponentId": from_comp,
                "fromPortIndex": from_idx,
                "toComponentId": to_comp,
                "toPortIndex": to_idx
            });
            this.ctx.push_action(DesignAction::Connect { connection });
            Ok(())
        });

        // ── clear() ─────────────────────────────────────────────────────────
        methods.add_method("clear", |_, this, _: ()| {
            this.ctx.push_action(DesignAction::ClearDesign);
            Ok(())
        });
    }
}

/// Chip.new ve global fonksiyonları Lua'ya kaydet
pub fn register_chip_api(lua: &Lua, ctx: ScriptContext) -> LuaResult<()> {
    let chip_table = lua.create_table()?;

    let ctx_new = ctx.clone();
    let new_fn = lua.create_function(move |_, (name, opts): (String, Option<Table>)| {
        // Opsiyonel canvas boyutunu güncelle
        if let Some(opts) = opts {
            if let Ok(w) = opts.get::<f64>("width") {
                if let Ok(h) = opts.get::<f64>("height") {
                    ctx_new.push_action(DesignAction::UpdateCanvas {
                        updates: json!({ "width": w, "height": h }),
                    });
                }
            }
        }
        // Yeni çip başlangıcında mevcut tasarımı temizle (script tekrar çalıştırıldığında)
        ctx_new.push_action(DesignAction::ClearDesign);
        Ok(Chip { name, ctx: ctx_new.clone() })
    })?;
    chip_table.set("new", new_fn)?;

    lua.globals().set("Chip", chip_table)?;
    Ok(())
}

/// Sweep API'yi kaydet — parametrik tarama
pub fn register_sweep_api(lua: &Lua, _ctx: ScriptContext) -> LuaResult<()> {
    let sweep_table = lua.create_table()?;

    let run_fn = lua.create_function(|lua, opts: Table| {
        let _param_name: String = opts.get("param")?;
        let values: Table = opts.get("values")?;
        let callback: Function = opts.get("callback")?;

        let count: usize = values.len()? as usize;
        for i in 1..=count {
            let value: Value = values.get(i)?;
            // callback'i çağır — callback içindeki Chip API çağrıları ctx'e action push'lar
            let _: Value = callback.call((value.clone(), (i - 1) as u32))?;
        }
        lua.globals().set("_last_sweep_count", count as i64)?;
        Ok(count as u32)
    })?;
    sweep_table.set("run", run_fn)?;

    lua.globals().set("Sweep", sweep_table)?;
    Ok(())
}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

use std::sync::atomic::{AtomicU64, Ordering};
static ID_COUNTER: AtomicU64 = AtomicU64::new(1);

fn gen_id(prefix: &str) -> String {
    let n = ID_COUNTER.fetch_add(1, Ordering::SeqCst);
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{prefix}_{ts}_{n}")
}

/// Lua'dan gelen port referansı: ya `PortRef`, ya da `{component_id, port_index}` tablosu
fn port_from_value(v: &Value) -> LuaResult<(String, u32)> {
    match v {
        Value::UserData(ud) => {
            // PortRef veya ComponentRef olabilir (ComponentRef'ten otomatik output al)
            if let Ok(p) = ud.borrow::<PortRef>() {
                return Ok((p.component_id.clone(), p.port_index));
            }
            if let Ok(c) = ud.borrow::<ComponentRef>() {
                // default: output port (index 1)
                return Ok((c.id.clone(), 1));
            }
            Err(mlua::Error::RuntimeError("Geçersiz port referansı".into()))
        }
        Value::Table(t) => {
            let id: String = t.get("component_id")
                .or_else(|_| t.get("id"))?;
            let idx: u32 = t.get("port_index").unwrap_or(0);
            Ok((id, idx))
        }
        _ => Err(mlua::Error::RuntimeError(
            "connect() argümanları port referansı olmalı".into()
        )),
    }
}
