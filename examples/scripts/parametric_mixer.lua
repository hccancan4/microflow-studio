-- ============================================================
-- parametric_mixer.lua
-- Parametric Serpentine Mixer — Channel Width Sweep
-- ============================================================
-- Sweeps channel width from 100 to 400 μm in steps of 50 μm.
-- For each width, builds a complete 8-turn serpentine mixer
-- and computes: resistance, pressure drop, Re, Pe, mixing length,
-- and estimated mixing index after all 8 turns.
--
-- Usage: open this script in MicroFlow Studio Script Editor,
--        then click Run (Ctrl+Enter).
-- ============================================================

-- ---- Configuration ----------------------------------------
local DEPTH        = 50        -- channel depth [μm]
local N_TURNS      = 8         -- number of U-turns
local TURN_RADIUS  = 300       -- bend radius [μm]
local STRAIGHT_LEN = 2000      -- straight segment length [μm]
local Q_TOTAL      = 10        -- total flow rate [μL/min]
local FLUID        = "water"   -- fluid preset

-- Molecular diffusivity of solute (rhodamine B in water ≈ 4e-10 m²/s)
local D_MOL = 4e-10            -- m²/s

-- Width sweep range
local WIDTH_MIN  = 100
local WIDTH_MAX  = 400
local WIDTH_STEP = 50

-- ---- Fluid constants --------------------------------------
local MU  = 0.000890   -- dynamic viscosity [Pa·s] water at 25°C
local RHO = 997        -- density [kg/m³]

-- ---- Helper functions -------------------------------------
local function resistance(w_um, h_um, L_um, mu_pa_s)
    local w = w_um * 1e-6
    local h = h_um * 1e-6
    local L = L_um * 1e-6
    -- Mortensen (2005) aspect-ratio correction: φ = 1 - 0.63*(h/w) for h<=w
    local h_small = math.min(w, h)
    local w_large = math.max(w, h)
    local phi = 1.0 - 0.630 * (h_small / w_large)
    return 12.0 * mu_pa_s * L / (w_large * h_small^3 * phi)
end

local function hydraulic_diameter(w_um, h_um)
    local w = w_um * 1e-6
    local h = h_um * 1e-6
    return 2.0 * w * h / (w + h)   -- meters
end

local function serpentine_length(n_turns, R_um, L_straight_um)
    -- Total length = n_turns * (straight + semicircle arc)
    local L_arc = math.pi * R_um   -- 180° arc in μm
    return n_turns * (L_straight_um + L_arc)   -- μm
end

-- ---- Print header -----------------------------------------
mf.log("=== Parametric Serpentine Mixer — Width Sweep ===")
mf.log(string.format("Depth=%d μm | %d turns | R_bend=%d μm | L_straight=%d μm",
    DEPTH, N_TURNS, TURN_RADIUS, STRAIGHT_LEN))
mf.log(string.format("Q_total=%.1f μL/min | Fluid: %s | D_mol=%.1e m²/s",
    Q_TOTAL, FLUID, D_MOL))
mf.log(string.rep("-", 90))
mf.log(string.format("%-8s %-10s %-10s %-8s %-10s %-12s %-10s %-8s",
    "W(μm)", "R(Pa·s/m³)", "ΔP(Pa)", "Re", "Pe",
    "L_mix(mm)", "MI_8turns", "Status"))
mf.log(string.rep("-", 90))

-- ---- Sweep ------------------------------------------------
local best_width = nil
local best_mi = -1

local width = WIDTH_MIN
while width <= WIDTH_MAX do

    -- Geometry
    local L_total_um = serpentine_length(N_TURNS, TURN_RADIUS, STRAIGHT_LEN)
    local Dh = hydraulic_diameter(width, DEPTH)   -- m

    -- Resistance (one straight + arcs combined as single L_total)
    local R = resistance(width, DEPTH, L_total_um, MU)

    -- Flow: Q is fixed, ΔP = Q * R
    local Q_SI = Q_TOTAL * 1.667e-11   -- m³/s
    local dP = Q_SI * R                -- Pa

    -- Velocity and Re
    local A = (width * 1e-6) * (DEPTH * 1e-6)
    local U = Q_SI / A                 -- m/s
    local Re = RHO * U * Dh / MU

    -- Péclet number
    local Pe = U * Dh / D_MOL

    -- Dean number (for U-turns)
    local De = Re * math.sqrt(Dh / (2.0 * TURN_RADIUS * 1e-6))

    -- Dean enhancement of mixing (empirical)
    local enhancement = 1.0
    if De > 11.6 then
        enhancement = 1.0 + 0.15 * (De - 11.6) / 11.6
    end

    -- Characteristic mixing length [m]
    local L_mix_m = Pe * Dh / (2.0 * math.pi^2 * enhancement)
    local L_mix_mm = L_mix_m * 1000

    -- Mixing index after N_TURNS turns
    local L_total_m = L_total_um * 1e-6
    local MI = 1.0 - math.exp(-L_total_m / math.max(L_mix_m, 1e-9))
    MI = math.min(1.0, math.max(0.0, MI))

    -- Status
    local status
    if MI > 0.95 then
        status = "EXCELLENT"
    elseif MI > 0.80 then
        status = "GOOD"
    elseif MI > 0.50 then
        status = "PARTIAL"
    else
        status = "POOR"
    end

    if MI > best_mi then
        best_mi = MI
        best_width = width
    end

    mf.log(string.format("%-8d %-10.3e %-10.1f %-8.3f %-10.1f %-12.2f %-10.3f %-8s",
        width, R, dP, Re, Pe, L_mix_mm, MI, status))

    width = width + WIDTH_STEP
end

mf.log(string.rep("-", 90))
mf.log(string.format("Best width for mixing: %d μm (MI = %.3f)", best_width, best_mi))

-- ---- Build the best design on canvas ----------------------
mf.log("\nBuilding best-mix design on canvas...")
mf.clear()

local inlet_a = mf.add_component("inlet_port", {
    x = 500, y = 3500,
    label = string.format("Stream A (%d μm)", best_width),
    diameter = 400,
    boundary_type = "flow_rate",
    value = Q_TOTAL / 2,
    fluid = FLUID
})

local inlet_b = mf.add_component("inlet_port", {
    x = 500, y = 4500,
    label = "Stream B",
    diameter = 400,
    boundary_type = "flow_rate",
    value = Q_TOTAL / 2,
    fluid = FLUID
})

local yj = mf.add_component("y_junction", {
    x = 1500, y = 4000,
    label = "Merge",
    arm_width = best_width,
    stem_width = best_width,
    depth = DEPTH,
    half_angle = 15
})

local mixer = mf.add_component("serpentine_mixer", {
    x = 5000, y = 4000,
    label = string.format("Serpentine (%d μm × %d turns)", best_width, N_TURNS),
    channel_width = best_width,
    depth = DEPTH,
    turn_radius = TURN_RADIUS,
    straight_length = STRAIGHT_LEN,
    n_turns = N_TURNS,
    pitch = best_width * 5
})

local outlet = mf.add_component("outlet_port", {
    x = 11000, y = 4000,
    label = "Mixed Output",
    diameter = 400,
    pressure = 0
})

mf.add_channel({ from = mf.get_port(inlet_a, "outlet"), to = mf.get_port(yj, "arm_a"),
    width = best_width, depth = DEPTH })
mf.add_channel({ from = mf.get_port(inlet_b, "outlet"), to = mf.get_port(yj, "arm_b"),
    width = best_width, depth = DEPTH })
mf.add_channel({ from = mf.get_port(yj, "stem"), to = mf.get_port(mixer, "inlet"),
    width = best_width, depth = DEPTH })
mf.add_channel({ from = mf.get_port(mixer, "outlet"), to = mf.get_port(outlet, "inlet"),
    width = best_width, depth = DEPTH })

local result = mf.simulate({ fluid = FLUID })
mf.log(string.format("Simulation ΔP = %.1f Pa", result.total_pressure_drop_pa))
mf.log("Done — optimal serpentine mixer built on canvas.")
