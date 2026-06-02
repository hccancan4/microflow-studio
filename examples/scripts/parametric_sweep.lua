-- parametric_sweep.lua
-- Sweeps channel width from 50 μm to 400 μm in 8 steps.
-- For each width, creates a single inlet→channel→outlet network.
-- The MicroFlow analytical solver can then be run on each design.
--
-- Note: Sweep.run replaces the canvas design on each callback invocation.
-- The last step's design remains on the canvas after the sweep completes.

local widths = { 50, 75, 100, 150, 200, 250, 300, 400 }

print("Starting channel width sweep (" .. #widths .. " steps)...")
print("Channel geometry: length=10000 μm, depth=50 μm, ΔP=1000 Pa (water)")
print("------------------------------------------------------------")

Sweep.run({
    param  = "channel_width_um",
    values = widths,
    callback = function(w, idx)
        -- Build a fresh single-channel design for this width
        local chip = Chip.new("sweep_w" .. w)
        chip:clear()

        local inlet   = chip:add_port({ port_type = "inlet",  diameter = 500 })
        local channel = chip:add_channel({
            width  = w,
            length = 10000,
            depth  = 50,
            label  = string.format("w=%d μm", w),
        })
        local outlet  = chip:add_port({ port_type = "outlet", diameter = 500 })

        chip:connect(inlet,   channel)
        chip:connect(channel, outlet)

        -- Hagen-Poiseuille analytical estimate (informational)
        -- R = 12*mu*L / (w*h^3*(1-0.63*h/w))
        local mu = 1.002e-3  -- Pa·s water
        local L  = 10000e-6  -- m
        local wi = w * 1e-6  -- m
        local h  = 50e-6     -- m
        local R  = 12 * mu * L / (wi * h^3 * (1 - 0.63 * h / wi))
        local dP = 1000      -- Pa
        local Q_m3s = dP / R
        local Q_ul_min = Q_m3s * 1e9 * 60

        print(string.format(
            "Step %d/%d: width=%3d μm | R=%.2e Pa·s/m³ | Q≈%.4f μL/min",
            idx, #widths, w, R, Q_ul_min
        ))
    end
})

print("------------------------------------------------------------")
print("Sweep complete. Last design (w=400 μm) is on the canvas.")
print("Press 'Analytic Run' to analyse the current design.")
