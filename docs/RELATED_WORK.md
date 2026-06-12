# İlgili Çalışmalar — µFG Companion Repo Analizi

MicroFlow Studio v1.1'in (AI copilot + inverse design + doğrulama) referans aldığı
makale ve resmi kod depoları incelendi. Bu belge bulguları, bizim implementasyonla
farkları ve gelecekte adapte edilebilecek fikirleri kaydeder.

## Referans makale

> Taşoğlu, S. ve ark. (DxBiotech Lab, Koç Üniversitesi).
> **"ML-automated microfluidic circuit design"** (µFluidicGenius / µFG).
> *Science Advances* **12**(5), 28 Ocak 2026.
> DOI: [10.1126/sciadv.aea7598](https://doi.org/10.1126/sciadv.aea7598)

---

## 1. dxbiotech/Microfluidics-Resistance-ML

**Lisans:** BSD-3-Clause · © 2024 DxBiotech Lab, Koç University
(Taşoğlu, V. Aktaş, B. Aktaş, Birtek, Abdullah)
**URL:** https://github.com/dxbiotech/Microfluidics-Resistance-ML

µFG'nin hesap çekirdeği: ML-tabanlı direnç tahmini + metasezgisel inverse design.

| Konu | µFG yaklaşımı | MicroFlow Studio |
|---|---|---|
| Tasarım uzayı | 20×20 hücreli **labirent (maze)** yolları; 270 hazır STL bileşen (6 tip × w/h ∈ {5..20}) — ayrık uzay | Sürekli parametrik bileşenler (10 tip), serpantin turns/pitch |
| Direnç hesabı | **ML-öğrenilmiş** (stacked ensemble + meta-learner, log1p/expm1; `new_sim_library.csv`; her akışkan için yeni dataset gerekir) | **Kapalı-form Hagen–Poiseuille** (0.63 düzeltmeli) — dataset'siz, akışkan değişimi anlık |
| Inverse design | **Tabu Search** (`generative_model.py`: 50 komşu/iter, 120 sn limit, %0.5 hata eşiği) | **Kesin ters çözüm** `l_for_r = R / R(1µm)` — anlık ve tam |
| Devre analizi | Seri `ΣR`, paralel `(Σ1/R)⁻¹`, akım bölücü (`app/utils/table.py`) | Aynı formüller (`analytic.rs` ağ çözücüsü) ✓ |
| Printability | Fitness'ta **fazla-direnç 1.05× daha ağır cezalı** → tasarım R'si hedefin hafif altında (milling toleransı R'yi yukarı iter) | Aynı politika: `solve_targets` L'yi 0.01 mm'ye **aşağı** yuvarlar (bkz. FORMULAS.md) |
| Zarf kontrolü | `resistance_bounds.pkl` (önceden hesaplanmış sınır sözlüğü) | `fits_envelope` / `w_flag` bayrakları (CELL_MM, W_FAB_MIN_UM) |
| LLM entegrasyonu | **Bu repoda yok** (makalenin LM katmanı yayınlanmamış) | Claude (backend'de) + LocalRuleProvider fallback + mf.* Lua eylem API'si |

**Çıkarımlar:**
- "Tek hidrolik çekirdek + kapalı-form ters çözüm" yaklaşımımız, µFG'nin
  ML+Tabu hattına karşı temel farklılaşmamız: dataset üretimi yok, 120 sn
  optimizasyon yok, akışkan değişimi yeniden eğitim istemiyor.
- Yuvarlama politikamız bu repo sayesinde düzeltildi (v1.1'de ters yöndeydik).

## 2. dxbiotech/ML-Micromilling-UI

**Lisans:** MIT · © 2025 Ali Norouzi
**URL:** https://github.com/dxbiotech/ML-Micromilling-UI

Tek-kanal **yüzey pürüzlülüğü (Ra) → sürtünme faktörü → basınç düşümü**
tahmincisi (Dash notebook; LLM yok, görselleştirme yok, yalnız su).

- **Ra:** 4-model ensemble (GBR + Linear + 2×SVR), ters-RMSE ağırlıklı ortalama;
  girdiler: kesme hızı, stepover/stepdown'lar, kanal boyutları (264 örnek).
- **Sürtünme faktörü dalları** (84 literatür ölçümü):
  - `rr ≤ %1` → `f = 64/Re` (pürüzsüz laminer — bizim çözücünün örtük varsayımı)
  - orta `rr` → 5. derece polinom ML modeli
  - yüksek `rr` → ampirik düzeltme **`f = f_lam · (1 + 30·rr^1.35)`**
- Dh = 2wh/(w+h) ✓ bizimkiyle aynı.

**Çıkarım:** Bizim analitik çözücü pürüzsüz duvar varsayar. Micromilled PMMA
hedeflendiğinde yukarıdaki ampirik düzeltme, direnç çarpanı olarak eklenebilir.

## 3. Gelecek adaylar (bu turda YAPILMADI)

1. **Pürüzlülük parametresi (RR %)** — `solve_targets`/`analyze_design`'a
   opsiyonel; direnç `×(1+30·rr^1.35)` düzeltmesi (kaynak: ML-Micromilling-UI).
2. **Maze-tabanlı kompakt direnç bileşeni** — uzun serpantin yerine hücre-içi
   labirent (kaynak: Microfluidics-Resistance-ML tasarım uzayı). Yeni bileşen
   tipi + render + çözücü modeli gerektirir.
3. **Tabu-tarzı çoklu-kısıt arama** — kapalı-form çözümün yetmediği gelecek
   senaryolar için (çok-girişli ağlar, ayrık bileşen kütüphanesi).

## Atıf

µFG'nin yöntemleri (inverse design reçetesi, printability politikası, zarf
kavramı) MicroFlow Studio'da bağımsız olarak yeniden uygulanmıştır — kod
kopyalanmamıştır, dolayısıyla BSD-3/MIT lisans yükümlülükleri doğmaz; atıf
bilimsel teamül gereğidir. MicroFlow Studio ile üretilen çalışmalarda lütfen
kaynak gösterin:

- **Makale:** Taşoğlu, S. ve ark. "ML-automated microfluidic circuit design."
  *Science Advances* 12(5), 2026. doi:10.1126/sciadv.aea7598
- **Kod:** github.com/dxbiotech/Microfluidics-Resistance-ML (BSD-3) ·
  github.com/dxbiotech/ML-Micromilling-UI (MIT)
