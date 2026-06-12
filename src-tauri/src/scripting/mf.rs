//! `mf.*` Lua API — AI copilot, Otomatik Tasarım ve şablonların ortak eylem yüzeyi.
//!
//! `Chip` API'sinin üstünde semantik bir katman: LM'in üreteceği kod kısa ve
//! niyet-odaklı kalsın diye giriş/çıkış, hedef-uzunluklu serpantin, akıllı
//! bağlantı varsayılanları ve simülasyon tetikleme sağlar. Her şey aynı
//! `DesignAction` akışından geçer — özel bir komut protokolü YOKTUR.
//!
//! Yüzey (birimler: koordinat/genişlik µm, basınç Pa, uzunluk mm):
//!   mf.clear()
//!   mf.set_fluid(key)                 -- "su"|"pbs"|"plazma"|"etanol"|"gliserol50"|...
//!   mf.set_inlet_pressure(pa)
//!   local i = mf.add_inlet(x, y, {pressure=pa, name=...})
//!   local o = mf.add_outlet(x, y, {name="ÇIKIŞ 1"})
//!   local c = mf.add_channel(x1,y1, x2,y2, {w=200, h=50})
//!   local s = mf.add_serpentine(x, y, {w=100, h=80, length_mm=63.5, pitch=600})
//!   mf.add_tjunction(x, y, rot) / mf.add_yjunction(x, y, rot)
//!   mf.connect(a, b [, {from=, to=}])  -- akıllı varsayılan portlar
//!   mf.set_target_flow(outlet, q_ul_min)
//!   mf.run_quick() / mf.run_cfd("kaba"|"orta"|"ince")
//!
//! Not: `mf.add_cross` yok (cross bileşeni tanımlı değil) — iki t_junction ile
//! kurulabilir; bkz. docs/SCRIPTING.md.

use super::api::{gen_id, port_from_value, ComponentRef};
use super::{DesignAction, ScriptContext};
use crate::simulation::hydraulic::{fluid_by_key, SERPENTINE_LEN_FACTOR};
use mlua::{Lua, Result as LuaResult, Table, Value};
use parking_lot::Mutex;
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;

/// Serpantin pitch'inin makul render aralığı (µm).
const PITCH_MIN_UM: f64 = 200.0;
const PITCH_MAX_UM: f64 = 1200.0;

/// mf.connect'in akıllı port seçimi için script-içi kayıt.
#[derive(Default)]
struct MfState {
    /// id → component_type (mf ile eklenenler)
    types: HashMap<String, String>,
    /// id → label (set_target_flow etiketleri için)
    labels: HashMap<String, String>,
    /// id → kullanılmış çıkış port indeksleri (junction fan-out)
    used_out: HashMap<String, Vec<u32>>,
}

type SharedState = Arc<Mutex<MfState>>;

fn err(msg: impl Into<String>) -> mlua::Error {
    mlua::Error::RuntimeError(msg.into())
}

/// Hedef uzunluğu (µm) çözücünün serpantin modeline KESİN oturan
/// (turns, pitch) çiftine çevirir: turns·pitch·K == l_um (inşa gereği).
fn serpentine_geometry(l_um: f64, preferred_pitch: f64) -> Result<(u32, f64), String> {
    let k = SERPENTINE_LEN_FACTOR;
    if !l_um.is_finite() || l_um < k * PITCH_MIN_UM {
        return Err(format!(
            "Serpantin için hedef uzunluk çok kısa (en az {:.2} mm gerekli).",
            k * PITCH_MIN_UM / 1000.0
        ));
    }
    let p0 = preferred_pitch.clamp(PITCH_MIN_UM, PITCH_MAX_UM);
    let mut turns = (l_um / (k * p0)).round().max(1.0);
    let mut pitch = l_um / (turns * k);
    if pitch > PITCH_MAX_UM {
        turns = (l_um / (k * PITCH_MAX_UM)).ceil();
        pitch = l_um / (turns * k);
    } else if pitch < PITCH_MIN_UM {
        turns = (l_um / (k * PITCH_MIN_UM)).floor().max(1.0);
        pitch = l_um / (turns * k);
    }
    Ok((turns as u32, pitch))
}

/// Kaynak tarafı varsayılan çıkış portu: port→0, junction→kullanılmamış ilk
/// çıkış (1, sonra 2), diğerleri→1. Hedef tarafı her zaman 0'dır.
fn default_out_port(state: &mut MfState, id: &str) -> u32 {
    let ty = state.types.get(id).map(String::as_str).unwrap_or("");
    match ty {
        "port" => 0,
        "t_junction" | "y_junction" => {
            let used = state.used_out.entry(id.to_string()).or_default();
            let next = if used.contains(&1) { 2 } else { 1 };
            used.push(next);
            next
        }
        _ => 1,
    }
}

/// Lua değerinden (ComponentRef/PortRef/tablo) bileşen id'si çıkar.
fn id_from_value(v: &Value) -> LuaResult<String> {
    match v {
        Value::UserData(ud) => {
            if let Ok(c) = ud.borrow::<ComponentRef>() {
                return Ok(c.id.clone());
            }
            if let Ok(p) = ud.borrow::<super::api::PortRef>() {
                return Ok(p.component_id.clone());
            }
            Err(err("Geçersiz bileşen referansı"))
        }
        Value::Table(t) => Ok(t.get("component_id").or_else(|_| t.get("id"))?),
        Value::String(s) => Ok(s.to_string_lossy().to_string()),
        _ => Err(err("Bileşen referansı bekleniyor (mf.add_* dönüşü)")),
    }
}

/// Port bileşeni (inlet/outlet) ekleme ortak yolu.
#[allow(clippy::too_many_arguments)]
fn push_port(
    ctx: &ScriptContext,
    state: &SharedState,
    x: f64,
    y: f64,
    port_type: &str,
    label: Option<String>,
    diameter: f64,
) -> ComponentRef {
    let id = gen_id("port");
    let component = json!({
        "id": id,
        "type": "port",
        "position": { "x": x, "y": y },
        "rotation": 0.0,
        "label": label,
        "params": { "diameter": diameter, "portType": port_type },
        "ports": []
    });
    ctx.push_action(DesignAction::AddComponent { component });
    let mut st = state.lock();
    st.types.insert(id.clone(), "port".into());
    if let Some(l) = component_label(&st, &id, &label) {
        st.labels.insert(id.clone(), l);
    }
    ComponentRef { id, component_type: "port".into() }
}

fn component_label(_st: &MfState, _id: &str, label: &Option<String>) -> Option<String> {
    label.clone()
}

/// `mf` global tablosunu kaydet.
pub fn register_mf_api(lua: &Lua, ctx: ScriptContext) -> LuaResult<()> {
    let mf = lua.create_table()?;
    let state: SharedState = Arc::new(Mutex::new(MfState::default()));

    // ── mf.clear() ──────────────────────────────────────────────────────────
    let (c, s) = (ctx.clone(), state.clone());
    mf.set(
        "clear",
        lua.create_function(move |_, _: ()| {
            c.push_action(DesignAction::ClearDesign);
            *s.lock() = MfState::default();
            Ok(())
        })?,
    )?;

    // ── mf.set_fluid(key) ───────────────────────────────────────────────────
    let c = ctx.clone();
    mf.set(
        "set_fluid",
        lua.create_function(move |_, key: String| {
            let (canonical, _) = fluid_by_key(&key).ok_or_else(|| {
                err(format!(
                    "Bilinmeyen akışkan \"{key}\". Geçerli: su, pbs, plazma, etanol, gliserol50, pdms, oil"
                ))
            })?;
            c.push_action(DesignAction::SetFluid { key: canonical.to_string() });
            Ok(())
        })?,
    )?;

    // ── mf.set_inlet_pressure(pa) ───────────────────────────────────────────
    let c = ctx.clone();
    mf.set(
        "set_inlet_pressure",
        lua.create_function(move |_, pa: f64| {
            if !pa.is_finite() || pa <= 0.0 {
                return Err(err("Giriş basıncı pozitif olmalı (Pa)."));
            }
            c.push_action(DesignAction::SetInletPressure { pa });
            Ok(())
        })?,
    )?;

    // ── mf.add_inlet(x, y, opts?) ───────────────────────────────────────────
    let (c, s) = (ctx.clone(), state.clone());
    mf.set(
        "add_inlet",
        lua.create_function(move |_, (x, y, opts): (f64, f64, Option<Table>)| {
            let name: Option<String> = opts.as_ref().and_then(|o| o.get("name").ok());
            let diameter: f64 = opts.as_ref().and_then(|o| o.get("diameter").ok()).unwrap_or(500.0);
            let r = push_port(&c, &s, x, y, "inlet", name, diameter);
            if let Some(p) = opts.as_ref().and_then(|o| o.get::<f64>("pressure").ok()) {
                if p.is_finite() && p > 0.0 {
                    c.push_action(DesignAction::SetInletPressure { pa: p });
                }
            }
            Ok(r)
        })?,
    )?;

    // ── mf.add_outlet(x, y, opts?) ──────────────────────────────────────────
    let (c, s) = (ctx.clone(), state.clone());
    mf.set(
        "add_outlet",
        lua.create_function(move |_, (x, y, opts): (f64, f64, Option<Table>)| {
            let name: Option<String> = opts.as_ref().and_then(|o| o.get("name").ok());
            let diameter: f64 = opts.as_ref().and_then(|o| o.get("diameter").ok()).unwrap_or(500.0);
            Ok(push_port(&c, &s, x, y, "outlet", name, diameter))
        })?,
    )?;

    // ── mf.add_channel(x1,y1,x2,y2, opts?) ─────────────────────────────────
    let (c, s) = (ctx.clone(), state.clone());
    mf.set(
        "add_channel",
        lua.create_function(move |_, (x1, y1, x2, y2, opts): (f64, f64, f64, f64, Option<Table>)| {
            let w: f64 = opts.as_ref().and_then(|o| o.get("w").ok()).unwrap_or(200.0);
            let h: f64 = opts.as_ref().and_then(|o| o.get("h").ok()).unwrap_or(50.0);
            let label: Option<String> = opts.as_ref().and_then(|o| o.get("label").ok());
            let length = ((x2 - x1).powi(2) + (y2 - y1).powi(2)).sqrt();
            let rotation = (y2 - y1).atan2(x2 - x1).to_degrees();
            let id = gen_id("comp");
            let component = json!({
                "id": id,
                "type": "straight_channel",
                "position": { "x": x1, "y": y1 },
                "rotation": rotation,
                "label": label,
                "params": { "width": w, "length": length, "depth": h },
                "ports": []
            });
            c.push_action(DesignAction::AddComponent { component });
            s.lock().types.insert(id.clone(), "straight_channel".into());
            Ok(ComponentRef { id, component_type: "straight_channel".into() })
        })?,
    )?;

    // ── mf.add_serpentine(x, y, {w,h,length_mm,pitch?}) ────────────────────
    let (c, s) = (ctx.clone(), state.clone());
    mf.set(
        "add_serpentine",
        lua.create_function(move |_, (x, y, opts): (f64, f64, Table)| {
            let w: f64 = opts.get("w").unwrap_or(200.0);
            let h: f64 = opts.get("h").unwrap_or(50.0);
            let length_mm: f64 = opts
                .get("length_mm")
                .map_err(|_| err("mf.add_serpentine için length_mm zorunlu (mm)."))?;
            let pitch_pref: f64 = opts.get("pitch").unwrap_or(600.0);
            let label: Option<String> = opts.get("label").ok();
            let (turns, pitch) = serpentine_geometry(length_mm * 1000.0, pitch_pref).map_err(err)?;
            let id = gen_id("mixer");
            let component = json!({
                "id": id,
                "type": "serpentine_mixer",
                "position": { "x": x, "y": y },
                "rotation": 0.0,
                "label": label,
                "params": { "channelWidth": w, "turns": turns, "pitch": pitch, "depth": h },
                "ports": []
            });
            c.push_action(DesignAction::AddComponent { component });
            s.lock().types.insert(id.clone(), "serpentine_mixer".into());
            Ok(ComponentRef { id, component_type: "serpentine_mixer".into() })
        })?,
    )?;

    // ── mf.add_tjunction / mf.add_yjunction (x, y, rot?, opts?) ────────────
    for (fn_name, comp_type, prefix) in
        [("add_tjunction", "t_junction", "tjunc"), ("add_yjunction", "y_junction", "yjunc")]
    {
        let (c, s) = (ctx.clone(), state.clone());
        mf.set(
            fn_name,
            lua.create_function(move |_, (x, y, rot, opts): (f64, f64, Option<f64>, Option<Table>)| {
                let main_w: f64 =
                    opts.as_ref().and_then(|o| o.get("main_width").ok()).unwrap_or(300.0);
                let branch_w: f64 =
                    opts.as_ref().and_then(|o| o.get("branch_width").ok()).unwrap_or(200.0);
                let depth: f64 = opts.as_ref().and_then(|o| o.get("h").ok()).unwrap_or(50.0);
                let label: Option<String> = opts.as_ref().and_then(|o| o.get("label").ok());
                let id = gen_id(prefix);
                let mut params = json!({
                    "mainWidth": main_w, "branchWidth": branch_w, "depth": depth
                });
                if comp_type == "t_junction" {
                    params["angle"] = json!(90.0);
                } else {
                    params["branchAngle"] = json!(45.0);
                }
                let component = json!({
                    "id": id,
                    "type": comp_type,
                    "position": { "x": x, "y": y },
                    "rotation": rot.unwrap_or(0.0),
                    "label": label,
                    "params": params,
                    "ports": []
                });
                c.push_action(DesignAction::AddComponent { component });
                s.lock().types.insert(id.clone(), comp_type.into());
                Ok(ComponentRef { id, component_type: comp_type.into() })
            })?,
        )?;
    }

    // ── mf.connect(a, b, opts?) ─────────────────────────────────────────────
    let (c, s) = (ctx.clone(), state.clone());
    mf.set(
        "connect",
        lua.create_function(move |_, (a, b, opts): (Value, Value, Option<Table>)| {
            // PortRef açıkça verilmişse onu kullan; aksi halde akıllı varsayılan.
            let from_override: Option<u32> = opts.as_ref().and_then(|o| o.get("from").ok());
            let to_override: Option<u32> = opts.as_ref().and_then(|o| o.get("to").ok());

            let (from_id, from_idx) = match (&a, from_override) {
                (_, Some(idx)) => (id_from_value(&a)?, idx),
                (Value::UserData(ud), None) if ud.borrow::<super::api::PortRef>().is_ok() => {
                    port_from_value(&a)?
                }
                _ => {
                    let id = id_from_value(&a)?;
                    let idx = default_out_port(&mut s.lock(), &id);
                    (id, idx)
                }
            };
            let (to_id, to_idx) = match (&b, to_override) {
                (_, Some(idx)) => (id_from_value(&b)?, idx),
                (Value::UserData(ud), None) if ud.borrow::<super::api::PortRef>().is_ok() => {
                    port_from_value(&b)?
                }
                _ => (id_from_value(&b)?, 0), // hedef varsayılanı: giriş portu 0
            };

            let connection = json!({
                "id": gen_id("conn"),
                "fromComponentId": from_id,
                "fromPortIndex": from_idx,
                "toComponentId": to_id,
                "toPortIndex": to_idx
            });
            c.push_action(DesignAction::Connect { connection });
            Ok(())
        })?,
    )?;

    // ── mf.set_target_flow(outlet, q_ul_min) ────────────────────────────────
    let (c, s) = (ctx.clone(), state.clone());
    mf.set(
        "set_target_flow",
        lua.create_function(move |_, (target, q): (Value, f64)| {
            if !q.is_finite() || q <= 0.0 {
                return Err(err("Hedef debi pozitif olmalı (µL/min)."));
            }
            let outlet_id = id_from_value(&target)?;
            let label = s.lock().labels.get(&outlet_id).cloned();
            c.push_action(DesignAction::SetTargetFlow { outlet_id, q_ul_min: q, label });
            Ok(())
        })?,
    )?;

    // ── mf.run_quick() / mf.run_cfd(res) ────────────────────────────────────
    let c = ctx.clone();
    mf.set(
        "run_quick",
        lua.create_function(move |_, _: ()| {
            c.push_action(DesignAction::RunSimulation {
                mode: "analytic".into(),
                resolution: None,
            });
            Ok(())
        })?,
    )?;

    let c = ctx.clone();
    mf.set(
        "run_cfd",
        lua.create_function(move |_, res: Option<String>| {
            let resolution = match res.as_deref().map(str::trim) {
                None | Some("") | Some("orta") | Some("medium") => "medium",
                Some("kaba") | Some("coarse") => "coarse",
                Some("ince") | Some("fine") => "fine",
                Some(other) => {
                    return Err(err(format!(
                        "Geçersiz CFD çözünürlüğü \"{other}\". Geçerli: kaba, orta, ince"
                    )))
                }
            };
            c.push_action(DesignAction::RunSimulation {
                mode: "cfd".into(),
                resolution: Some(resolution.into()),
            });
            Ok(())
        })?,
    )?;

    lua.globals().set("mf", mf)?;
    Ok(())
}

// ─── Testler ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::super::{run_script_collect, DesignAction};
    use super::*;

    fn count<F: Fn(&DesignAction) -> bool>(actions: &[DesignAction], f: F) -> usize {
        actions.iter().filter(|a| f(a)).count()
    }

    #[test]
    fn mf_basic_emission() {
        let script = r#"
            mf.clear()
            mf.set_fluid("su")
            mf.set_inlet_pressure(1000)
            local i = mf.add_inlet(0, 250)
            local s = mf.add_serpentine(300, 100, {w=100, h=80, length_mm=63.5})
            local o = mf.add_outlet(700, 100, {name="ÇIKIŞ 1"})
            mf.connect(i, s)
            mf.connect(s, o)
            mf.set_target_flow(o, 2.0)
            mf.run_quick()
        "#;
        let (r, actions) = run_script_collect(script);
        assert!(r.success, "Hata: {:?}", r.error);
        assert_eq!(count(&actions, |a| matches!(a, DesignAction::ClearDesign)), 1);
        assert_eq!(count(&actions, |a| matches!(a, DesignAction::SetFluid { .. })), 1);
        assert_eq!(count(&actions, |a| matches!(a, DesignAction::SetInletPressure { .. })), 1);
        assert_eq!(count(&actions, |a| matches!(a, DesignAction::AddComponent { .. })), 3);
        assert_eq!(count(&actions, |a| matches!(a, DesignAction::Connect { .. })), 2);
        assert_eq!(count(&actions, |a| matches!(a, DesignAction::SetTargetFlow { .. })), 1);
        assert_eq!(count(&actions, |a| matches!(a, DesignAction::RunSimulation { .. })), 1);
        // set_fluid alias çözümü: "su" → kanonik "water"
        assert!(actions.iter().any(|a| matches!(a,
            DesignAction::SetFluid { key } if key == "water")));
        // set_target_flow outlet etiketini taşımalı
        assert!(actions.iter().any(|a| matches!(a,
            DesignAction::SetTargetFlow { label: Some(l), .. } if l == "ÇIKIŞ 1")));
    }

    #[test]
    fn mf_set_fluid_invalid_errors() {
        let (r, _) = run_script_collect(r#"mf.set_fluid("civa")"#);
        assert!(!r.success);
        assert!(r.error.unwrap().contains("Bilinmeyen akışkan"));
    }

    #[test]
    fn mf_serpentine_exact_length() {
        // turns·pitch·K == L (çözücünün uzunluk modeliyle birebir)
        let script = r#"mf.add_serpentine(0, 0, {w=100, h=80, length_mm=63.5})"#;
        let (r, actions) = run_script_collect(script);
        assert!(r.success, "Hata: {:?}", r.error);
        let comp = actions.iter().find_map(|a| match a {
            DesignAction::AddComponent { component } => Some(component),
            _ => None,
        }).unwrap();
        let turns = comp["params"]["turns"].as_f64().unwrap();
        let pitch = comp["params"]["pitch"].as_f64().unwrap();
        let l = turns * pitch * SERPENTINE_LEN_FACTOR;
        assert!((l - 63_500.0).abs() / 63_500.0 < 1e-9, "L={l}");
        assert!((PITCH_MIN_UM..=PITCH_MAX_UM).contains(&pitch), "pitch={pitch}");
    }

    #[test]
    fn mf_serpentine_too_short_errors() {
        let (r, _) = run_script_collect(r#"mf.add_serpentine(0,0,{length_mm=0.1})"#);
        assert!(!r.success);
    }

    #[test]
    fn mf_serpentine_missing_length_errors() {
        let (r, _) = run_script_collect(r#"mf.add_serpentine(0,0,{w=100})"#);
        assert!(!r.success);
        assert!(r.error.unwrap().contains("length_mm"));
    }

    #[test]
    fn mf_connect_junction_fanout_uses_next_output() {
        let script = r#"
            local t = mf.add_tjunction(0, 0)
            local o1 = mf.add_outlet(500, 0)
            local o2 = mf.add_outlet(500, 500)
            mf.connect(t, o1)
            mf.connect(t, o2)
        "#;
        let (r, actions) = run_script_collect(script);
        assert!(r.success, "Hata: {:?}", r.error);
        let ports: Vec<u64> = actions.iter().filter_map(|a| match a {
            DesignAction::Connect { connection } => connection["fromPortIndex"].as_u64(),
            _ => None,
        }).collect();
        assert_eq!(ports, vec![1, 2], "junction fan-out 1 sonra 2 olmalı");
    }

    #[test]
    fn mf_connect_inlet_uses_port_zero() {
        let script = r#"
            local i = mf.add_inlet(0, 0)
            local c = mf.add_channel(100, 0, 600, 0)
            mf.connect(i, c)
        "#;
        let (r, actions) = run_script_collect(script);
        assert!(r.success, "Hata: {:?}", r.error);
        let conn = actions.iter().find_map(|a| match a {
            DesignAction::Connect { connection } => Some(connection),
            _ => None,
        }).unwrap();
        assert_eq!(conn["fromPortIndex"].as_u64(), Some(0), "port bileşeninin tek portu 0");
        assert_eq!(conn["toPortIndex"].as_u64(), Some(0), "hedef varsayılanı giriş portu 0");
    }

    /// Şablon Lua dosyaları (src/templates/lua/) gerçek yorumlayıcıda koşar —
    /// frontend `?raw` ile aynı dosyaları kullanır (tek kaynak, çift doğrulama).
    #[test]
    fn lua_templates_execute_successfully() {
        let templates: [(&str, &str); 4] = [
            ("splitter_2_1", include_str!("../../../src/templates/lua/splitter_2_1.lua")),
            ("splitter_4_equal", include_str!("../../../src/templates/lua/splitter_4_equal.lua")),
            (
                "serpentine_resistor",
                include_str!("../../../src/templates/lua/serpentine_resistor.lua"),
            ),
            (
                "droplet_tjunction",
                include_str!("../../../src/templates/lua/droplet_tjunction.lua"),
            ),
        ];
        for (name, lua) in templates {
            let (r, actions) = run_script_collect(lua);
            assert!(r.success, "şablon {name} hata verdi: {:?}", r.error);
            assert!(
                actions.iter().any(|a| matches!(a, DesignAction::AddComponent { .. })),
                "şablon {name} hiç bileşen üretmedi"
            );
            assert!(
                actions.iter().any(|a| matches!(a, DesignAction::RunSimulation { .. })),
                "şablon {name} simülasyon tetiklemiyor"
            );
        }
    }

    #[test]
    fn mf_run_cfd_resolution_mapping() {
        let (r, actions) = run_script_collect(r#"mf.run_cfd("kaba")"#);
        assert!(r.success);
        assert!(actions.iter().any(|a| matches!(a,
            DesignAction::RunSimulation { mode, resolution: Some(res) }
                if mode == "cfd" && res == "coarse")));
        let (r2, _) = run_script_collect(r#"mf.run_cfd("çokince")"#);
        assert!(!r2.success);
    }
}
