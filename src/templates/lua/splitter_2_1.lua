-- 2:1 Bölücü — 10 mbar su, T-bağlantıdan iki çıkışa 2:1 debi oranı.
-- Elektrik analojisi: R_i = P/Q_i → dal direnci serpantin uzunluğuna çevrilir.
-- Uzunluklar su + 100×80 µm kesit + 10 mbar için yaklaşık çözümdür;
-- Doğrulama sekmesi gerçek sapmayı gösterir (besleme/kavşak direnci küçük ek).
mf.clear()
mf.set_fluid("su")
mf.set_inlet_pressure(1000) -- 10 mbar

local inl = mf.add_inlet(0, 400, { pressure = 1000 })
local feed = mf.add_channel(600, 400, 1800, 400, { w = 300, h = 80 })
local t = mf.add_tjunction(2200, 400)

local s1 = mf.add_serpentine(3000, 150, { w = 100, h = 80, length_mm = 63.5 }) -- Q=2.0
local s2 = mf.add_serpentine(3000, 650, { w = 100, h = 80, length_mm = 127.0 }) -- Q=1.0
local o1 = mf.add_outlet(5400, 150, { name = "ÇIKIŞ 1" })
local o2 = mf.add_outlet(5400, 650, { name = "ÇIKIŞ 2" })

mf.connect(inl, feed)
mf.connect(feed, t)
mf.connect(t, s1) -- T çıkış 1
mf.connect(t, s2) -- T çıkış 2 (akıllı fan-out)
mf.connect(s1, o1)
mf.connect(s2, o2)

mf.set_target_flow(o1, 2.0)
mf.set_target_flow(o2, 1.0)
mf.run_quick()
