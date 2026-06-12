-- Serpantin Direnci — spec referans tasarımı (µFG doğrulama örneği).
-- Su, 100×80 µm kesit, 10 mbar: hedef Q = 2 µL/min → R_disp = 5 mbar/(µL/min)
-- → L = 63.5 mm. Doğrulama sekmesinde sapma ≈ %0 görünmelidir.
mf.clear()
mf.set_fluid("su")
mf.set_inlet_pressure(1000) -- 10 mbar

local inl = mf.add_inlet(0, 300, { pressure = 1000 })
local s = mf.add_serpentine(800, 300, { w = 100, h = 80, length_mm = 63.5 })
local o = mf.add_outlet(3400, 300, { name = "ÇIKIŞ 1" })

mf.connect(inl, s)
mf.connect(s, o)
mf.set_target_flow(o, 2.0)
mf.run_quick()
