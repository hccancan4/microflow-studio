-- gradient_generator.lua
-- Christmas-tree concentration gradient generator network.
-- Two fluid streams (A and B) merge progressively through Y-junctions
-- and serpentine mixers to produce multiple dilution ratios.
--
-- Topology (2-level tree → 50% and 75% outputs):
--
--   [Inlet A] ──┐
--               ├─ Y1 ─ Mixer1 ──── [Outlet 50%]
--   [Inlet B] ──┘       │
--                        └─ Y2 ─ Mixer2 ─ [Outlet 75%]
--               [Inlet A2] ──┘
--
-- All dimensions in micrometres (μm).

local chip = Chip.new("Gradient Generator")
chip:clear()

-- ── Inlets ─────────────────────────────────────────────────────────────────
local inlet_a = chip:add_port({
    port_type = "inlet",
    diameter  = 500,
    label     = "Fluid A (100%)",
})

local inlet_b = chip:add_port({
    port_type = "inlet",
    diameter  = 500,
    label     = "Fluid B (0%)",
})

local inlet_a2 = chip:add_port({
    port_type = "inlet",
    diameter  = 500,
    label     = "Fluid A (100%) - Stage 2",
})

-- ── Stage 1: A + B → 50% mixture ────────────────────────────────────────────
local y1 = chip:add_y_junction({
    main_width   = 300,
    branch_width = 200,
    branch_angle = 30,
    depth        = 50,
    label        = "Y1 (A+B merge)",
})

local mixer1 = chip:add_serpentine({
    channel_width = 200,
    turns         = 6,
    pitch         = 500,
    depth         = 50,
    label         = "Mixer 1 (→50%)",
})

-- ── Stage 2: 50% + A → 75% mixture ──────────────────────────────────────────
local y2 = chip:add_y_junction({
    main_width   = 300,
    branch_width = 200,
    branch_angle = 30,
    depth        = 50,
    label        = "Y2 (50%+A merge)",
})

local mixer2 = chip:add_serpentine({
    channel_width = 200,
    turns         = 6,
    pitch         = 500,
    depth         = 50,
    label         = "Mixer 2 (→75%)",
})

-- ── Outlets ──────────────────────────────────────────────────────────────────
local out_50 = chip:add_port({
    port_type = "outlet",
    diameter  = 500,
    label     = "50% output",
})

local out_75 = chip:add_port({
    port_type = "outlet",
    diameter  = 500,
    label     = "75% output",
})

-- ── Connections ──────────────────────────────────────────────────────────────

-- Stage 1: Fluid A + Fluid B → Y1 → Mixer1 → 50% outlet
chip:connect(inlet_a, y1)
chip:connect(inlet_b, y1:port(2))
chip:connect(y1,      mixer1)
chip:connect(mixer1,  out_50)

-- Stage 2: Mixer1 output + extra A → Y2 → Mixer2 → 75% outlet
chip:connect(mixer1,   y2)
chip:connect(inlet_a2, y2:port(2))
chip:connect(y2,       mixer2)
chip:connect(mixer2,   out_75)

print("Gradient generator created.")
print("Stage 1 (Y1 + Mixer1): 50% concentration at Outlet 50%")
print("Stage 2 (Y2 + Mixer2): 75% concentration at Outlet 75%")
print("Mixing efficiency depends on Pe = v*w/D_mol (Stroock model).")
print("Run Analytic simulation to inspect flow rates and mixing efficiencies.")
