-- ============================================================
-- droplet_generator.lua
-- Flow-Focusing Droplet Generator — Orifice Size Optimization
-- ============================================================
-- Optimizes orifice width for a flow-focusing droplet generator.
-- Sweeps orifice width from 20 to 100 μm and computes:
--   - Capillary number
--   - Droplet generation regime (squeezing / dripping / jetting)
--   - Predicted droplet diameter
--   - Droplet frequency
--   - Monodispersity score (proxy: lower Ca → better)
--
-- Physics reference:
--   Garstecki et al. Lab Chip 6 (2006) 437 — T-junction scaling
--   van Steijn et al. Lab Chip 10 (2010) 2513 — flow-focusing
--   Utada et al. PRL 99 (2007) 094502 — dripping-jetting transition
-- ============================================================

-- ---- Configuration ----------------------------------------
local Q_DISPERSED  = 2.0    -- dispersed phase (water) [μL/min]
local Q_CONTINUOUS = 8.0    -- continuous phase (oil)  [μL/min]
local DEPTH        = 50     -- channel depth [μm]

-- Upstream (feeding) channel widths
local W_DISPERSED  = 100    -- μm
local W_DOWNSTREAM = 300    -- μm (collection channel after orifice)

-- Orifice sweep
local ORIFICE_MIN  = 20     -- μm
local ORIFICE_MAX  = 100    -- μm
local ORIFICE_STEP = 10     -- μm

-- Fixed orifice length (L_orifice = 2 × orifice_width is common)
local function orifice_length(w_or)
    return 2.0 * w_or
end

-- ---- Fluid properties -------------------------------------
local MU_OIL   = 0.025     -- mineral oil viscosity [Pa·s]
local MU_WATER = 0.000890  -- water viscosity [Pa·s]
local RHO_OIL  = 838       -- mineral oil density [kg/m³]
local GAMMA    = 0.035     -- water-oil interfacial tension [N/m] (no surfactant)
--   With 0.5% SDS surfactant: GAMMA ≈ 0.005 N/m

-- ---- Helper functions -------------------------------------
local function capillary_number(mu, U, gamma)
    return mu * U / gamma
end

local function velocity_in_channel(Q_ul_min, w_um, h_um)
    local Q_SI = Q_ul_min * 1.667e-11   -- m³/s
    local A = (w_um * 1e-6) * (h_um * 1e-6)
    return Q_SI / A                     -- m/s
end

local function droplet_diameter_dripping(Q_d, Q_c, w_or_um, alpha, beta)
    -- Power-law fit for dripping regime (van Steijn 2010):
    -- d_drop / w_orifice ≈ α * (Q_d/Q_c)^β
    alpha = alpha or 1.5
    beta  = beta  or 0.33
    local ratio = Q_d / Q_c
    return alpha * w_or_um * ratio^beta   -- μm
end

local function droplet_diameter_squeezing(Q_d, Q_c, w_main_um)
    -- Garstecki 2006: L_drop/w_main ≈ 1 + Q_d/Q_c
    return w_main_um * (1.0 + Q_d / Q_c)
end

local function droplet_frequency(Q_d_ul_min, d_drop_um, depth_um)
    -- f = Q_d / V_drop,  V_drop ≈ π/6 * d³ (sphere) or d²*h (plug)
    local Q_d_SI = Q_d_ul_min * 1.667e-11   -- m³/s
    -- Plug model: V = d² * h
    local d = d_drop_um * 1e-6
    local h = depth_um * 1e-6
    local V = d * d * h
    if V <= 0 then return 0 end
    return Q_d_SI / V   -- Hz
end

-- ---- Print header -----------------------------------------
mf.log("=== Flow-Focusing Droplet Generator — Orifice Optimization ===")
mf.log(string.format("Q_dispersed=%.1f μL/min (water) | Q_continuous=%.1f μL/min (oil)",
    Q_DISPERSED, Q_CONTINUOUS))
mf.log(string.format("Depth=%d μm | γ=%.3f N/m | μ_oil=%.3f Pa·s",
    DEPTH, GAMMA, MU_OIL))
mf.log(string.rep("-", 100))
mf.log(string.format("%-10s %-10s %-10s %-12s %-14s %-10s %-12s",
    "W_or(μm)", "Ca_oil", "Regime", "d_drop(μm)", "d/W_or", "f(Hz)", "Mono-score"))
mf.log(string.rep("-", 100))

local best_orifice = nil
local best_score   = -1e9
local results_table = {}

local w_or = ORIFICE_MIN
while w_or <= ORIFICE_MAX do

    -- Continuous phase velocity at orifice (two side streams → sum)
    -- In flow-focusing: each side stream has width = orifice width approx.
    -- Oil velocity in side inlet (width ~ orifice width)
    local U_oil = velocity_in_channel(Q_CONTINUOUS, w_or * 2, DEPTH)  -- approximate

    -- Capillary number (oil continuous phase)
    local Ca = capillary_number(MU_OIL, U_oil, GAMMA)

    -- Regime classification
    local regime
    local d_drop_um
    if Ca < 0.01 then
        regime    = "SQUEEZING"
        d_drop_um = droplet_diameter_squeezing(Q_DISPERSED, Q_CONTINUOUS, w_or)
    elseif Ca < 0.3 then
        regime    = "DRIPPING"
        d_drop_um = droplet_diameter_dripping(Q_DISPERSED, Q_CONTINUOUS, w_or, 1.5, 0.33)
    else
        regime    = "JETTING"
        -- Jetting: large, polydisperse droplets; size ill-defined
        d_drop_um = w_or * 3.0  -- rough estimate
    end

    -- Ratio d/W_orifice
    local d_ratio = d_drop_um / w_or

    -- Droplet frequency
    local freq = droplet_frequency(Q_DISPERSED, d_drop_um, DEPTH)

    -- Monodispersity score: higher = better
    -- Penalize: jetting (-100), high Ca (less control), very small drops (diff to handle)
    local score
    if regime == "SQUEEZING" then
        -- Best monodispersity but slow
        score = 80.0 - Ca * 100 - math.abs(d_drop_um - w_or) / w_or * 10
    elseif regime == "DRIPPING" then
        -- Optimal: controllable, good monodispersity
        score = 100.0 - (Ca - 0.05)^2 * 1000 - math.abs(d_drop_um - w_or * 0.8) / w_or * 5
    else
        score = -100.0
    end

    if score > best_score then
        best_score   = score
        best_orifice = w_or
    end

    table.insert(results_table, {
        w_or = w_or, Ca = Ca, regime = regime,
        d_drop = d_drop_um, d_ratio = d_ratio, freq = freq, score = score
    })

    mf.log(string.format("%-10d %-10.4f %-10s %-12.1f %-14.2f %-10.1f %-12.1f",
        w_or, Ca, regime, d_drop_um, d_ratio, freq, score))

    w_or = w_or + ORIFICE_STEP
end

mf.log(string.rep("-", 100))
mf.log(string.format("Optimal orifice width: %d μm (score=%.1f)", best_orifice, best_score))

-- ---- Regime guide -----------------------------------------
mf.log("\n--- Regime Guide ---")
mf.log("SQUEEZING (Ca<0.01): largest, most uniform droplets. Best for plug flow.")
mf.log("DRIPPING  (Ca 0.01-0.30): smaller droplets, excellent monodispersity (<2% CV).")
mf.log("JETTING   (Ca>0.30): polydisperse, avoid for quantitative applications.")
mf.log("Tip: add 0.5% SDS surfactant to reduce γ by 7×, shift all Ca up 7×.")

-- ---- Build optimal design on canvas ----------------------
mf.log(string.format("\nBuilding optimal design (orifice=%d μm) on canvas...", best_orifice))
mf.clear()

-- Dispersed phase inlet (water/sample)
local disp_in = mf.add_component("inlet_port", {
    x = 2000, y = 2500,
    label = "Dispersed (water)",
    diameter = 400,
    boundary_type = "flow_rate",
    value = Q_DISPERSED,
    fluid = "water"
})

-- Continuous phase inlets (oil, left and right symmetric)
local cont_left = mf.add_component("inlet_port", {
    x = 500, y = 4000,
    label = "Continuous (oil) L",
    diameter = 400,
    boundary_type = "flow_rate",
    value = Q_CONTINUOUS / 2,
    fluid = "mineral_oil"
})
local cont_right = mf.add_component("inlet_port", {
    x = 3500, y = 4000,
    label = "Continuous (oil) R",
    diameter = 400,
    boundary_type = "flow_rate",
    value = Q_CONTINUOUS / 2,
    fluid = "mineral_oil"
})

-- Flow-focusing droplet generator
local dgen = mf.add_component("droplet_generator", {
    x = 2000, y = 4000,
    label = string.format("FF Generator (or=%d μm)", best_orifice),
    orifice_width = best_orifice,
    orifice_length = orifice_length(best_orifice),
    upstream_width = W_DISPERSED,
    side_width = best_orifice * 2,
    downstream_width = W_DOWNSTREAM,
    depth = DEPTH
})

-- Collection channel
local outlet = mf.add_component("outlet_port", {
    x = 8000, y = 4000,
    label = "Droplet Collection",
    diameter = 500,
    pressure = 0
})

-- Connect
mf.add_channel({ from = mf.get_port(disp_in, "outlet"),
    to = mf.get_port(dgen, "dispersed_inlet"),
    width = W_DISPERSED, depth = DEPTH, label = "Dispersed feed" })

mf.add_channel({ from = mf.get_port(cont_left, "outlet"),
    to = mf.get_port(dgen, "continuous_left"),
    width = best_orifice * 2, depth = DEPTH, label = "Oil left" })

mf.add_channel({ from = mf.get_port(cont_right, "outlet"),
    to = mf.get_port(dgen, "continuous_right"),
    width = best_orifice * 2, depth = DEPTH, label = "Oil right" })

mf.add_channel({ from = mf.get_port(dgen, "outlet"),
    to = mf.get_port(outlet, "inlet"),
    width = W_DOWNSTREAM, depth = DEPTH, label = "Collection" })

local result = mf.simulate({ fluid = "water" })
mf.log(string.format("Simulation ΔP = %.1f Pa", result.total_pressure_drop_pa))
mf.log("Done — optimal flow-focusing droplet generator built on canvas.")
