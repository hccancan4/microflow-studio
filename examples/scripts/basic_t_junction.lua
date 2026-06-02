-- basic_t_junction.lua
-- Demonstrates a simple T-junction chip design using the MicroFlow Chip API.
--
-- Network topology:
--   [Inlet] → [Main Channel] → [T-Junction] → [Branch A] → [Outlet A]
--                                            ↘ [Branch B] → [Outlet B]
--
-- All dimensions in micrometres (μm).

local chip = Chip.new("Basic T-Junction")
chip:clear()

-- Inlet port (external fluid source)
local inlet = chip:add_port({
    port_type = "inlet",
    diameter  = 500,
    label     = "Inlet",
})

-- Main feeding channel
local main_ch = chip:add_channel({
    width  = 300,
    length = 4000,
    depth  = 50,
    label  = "Main Channel",
})

-- T-junction splitting node
local tjunc = chip:add_t_junction({
    main_width   = 300,
    branch_width = 200,
    angle        = 90,
    depth        = 50,
    label        = "T-Split",
})

-- Branch A: straight outlet channel
local branch_a = chip:add_channel({
    width  = 200,
    length = 3000,
    depth  = 50,
    label  = "Branch A",
})

-- Branch B: straight outlet channel (same geometry, symmetric)
local branch_b = chip:add_channel({
    width  = 200,
    length = 3000,
    depth  = 50,
    label  = "Branch B",
})

-- Outlet ports
local outlet_a = chip:add_port({
    port_type = "outlet",
    diameter  = 500,
    label     = "Outlet A",
})

local outlet_b = chip:add_port({
    port_type = "outlet",
    diameter  = 500,
    label     = "Outlet B",
})

-- Connect the network
chip:connect(inlet,    main_ch)    -- inlet → main channel
chip:connect(main_ch,  tjunc)      -- main channel → T-junction (port 0 → port 0)
chip:connect(tjunc,    branch_a)   -- T-junction output → branch A
chip:connect(tjunc:port(2), branch_b.input)  -- T-junction branch port → branch B
chip:connect(branch_a, outlet_a)   -- branch A → outlet A
chip:connect(branch_b, outlet_b)   -- branch B → outlet B

print("T-junction design created.")
print("Components: 1 inlet, 1 main channel, 1 T-junction, 2 branches, 2 outlets")
print("Run Analytic simulation to see flow distribution between branches.")
