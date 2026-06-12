-- T-Bağlantı Damla Üreteci — sürekli faz ana kanaldan, dispers faz daldan.
-- Şematik kurulum: iki giriş + T-bağlantı + çıkış kanalı. Damla rejimi
-- analitik çözücüde modellenmez; bu şablon topoloji + debi dengesi içindir.
mf.clear()
mf.set_fluid("su")
mf.set_inlet_pressure(1000) -- 10 mbar

-- Sürekli faz hattı (yatay ana kanal)
local inl_c = mf.add_inlet(0, 400, { pressure = 1000, name = "Sürekli faz" })
local ch_c = mf.add_channel(600, 400, 2200, 400, { w = 200, h = 60 })

-- Dispers faz hattı (yukarıdan dala girer)
local inl_d = mf.add_inlet(2600, 0, { name = "Dispers faz" })
local ch_d = mf.add_channel(2600, 500, 2600, 1300, { w = 100, h = 60 })

local t = mf.add_tjunction(2600, 400)

-- Çıkış hattı
local ch_o = mf.add_channel(3000, 400, 5000, 400, { w = 200, h = 60 })
local o = mf.add_outlet(5400, 400, { name = "ÇIKIŞ 1" })

mf.connect(inl_c, ch_c)
mf.connect(ch_c, t) -- ana giriş (port 0)
mf.connect(inl_d, ch_d)
mf.connect(ch_d, t, { to = 2 }) -- dispers faz dala girer
mf.connect(t, ch_o) -- T çıkışı (port 1)
mf.connect(ch_o, o)

mf.run_quick()
