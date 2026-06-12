-- 4 Yol Eşit Bölücü — 10 mbar su, dört çıkışa eşit debi (1'er µL/min).
-- Eşit hedef → eşit direnç → eşit serpantin uzunluğu (R_disp = P/Q = 10 → L≈127 mm).
-- Besleme kanalından dört dala fan-out; script yolu paralel ağı doğrudan kurar.
mf.clear()
mf.set_fluid("su")
mf.set_inlet_pressure(1000) -- 10 mbar

local inl = mf.add_inlet(0, 700, { pressure = 1000 })
local feed = mf.add_channel(600, 700, 1800, 700, { w = 300, h = 80 })
mf.connect(inl, feed)

for k = 1, 4 do
  local y = 150 + (k - 1) * 380
  local s = mf.add_serpentine(2400, y, { w = 100, h = 80, length_mm = 127.0 })
  local o = mf.add_outlet(4800, y, { name = "ÇIKIŞ " .. k })
  mf.connect(feed, s, { from = 1 })
  mf.connect(s, o)
  mf.set_target_flow(o, 1.0)
end

mf.run_quick()
