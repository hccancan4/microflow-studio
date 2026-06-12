# MicroFlow Studio

Mikroakışkan çip tasarımı ve simülasyonu için profesyonel masaüstü uygulaması. [Tauri v2](https://tauri.app/) (Rust backend + React frontend), AutoCAD/Fusion 360 tarzı bir CAD ergonomisiyle inşa edildi.

[![CI](https://github.com/hccancan4/microflow-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/hccancan4/microflow-studio/actions/workflows/ci.yml) ![Version](https://img.shields.io/badge/version-1.1.0-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![Tauri](https://img.shields.io/badge/tauri-v2-orange) ![Tests](https://img.shields.io/badge/tests-57%20rust%20%2B%20104%20frontend-brightgreen)

---

## Ne yapar

Sürükle-bırak canvas editöründe 10 tip parametrik bileşenden mikroakışkan çip tasarımı yaparsın. Tasarımı **analitik ağ çözücü** (Hagen-Poiseuille) veya **2D CFD çözücüsü** (Chorin projeksiyon) ile analiz edersin. Sonuçlar sekmeli panellerde gösterilir; deney verileriyle karşılaştırılır. Tamamlanan tasarımlar **PNG / SVG / GDS-II** (fotomask üretimi) olarak dışa aktarılır. Gömülü **Lua scripting** ortamı tam programatik çip üretimi + parametre taraması sağlar.

**v1.1 — AI destekli tasarım:** ✦ **Asistan** doğal dilden (`"10 mbar 2:1:1 bölücü su"`) `mf.*` Lua üretir ve çalıştırır; API anahtarı yoksa **yerel kural motoru** aynı işi çevrimdışı yapar. ✦ **Oto-Tasarım** hedef debilerden devreyi tersine çözer (R=P/Q → serpantin uzunluğu). **Doğrulama** sekmesi hedef-vs-fiili debiyi renk kodlu raporlar. 7 akışkan ön tanımı, mbar gösterimi, üretilebilirlik (≥40 µm, ≤180 mm) bayrakları ve hazır Lua şablonları.

---

> **Ekran görüntüleri:** henüz eklenmedi — `npm run tauri dev` ile çekilip `docs/images/` altına konacak.

---

## Özellikler

### Bileşenler (10 tip)

| Tip | Parametreler |
|---|---|
| Düz Kanal | width, length, depth (μm) |
| Eğri Kanal | radius, angle (1°–359°), width, depth |
| T-Bağlantı | mainWidth, branchWidth, angle, depth |
| Y-Bağlantı | mainWidth, branchWidth, branchAngle, depth |
| Serpantin Mikser | channelWidth, turns, pitch, depth |
| Port | diameter, portType (inlet/outlet) |
| Damla Üreteci | orificeWidth, mainChannelWidth, dispersedChannelWidth, depth |
| Filtre Dizisi | pillarDiameter, spacing, rows, columns, depth |
| Genişleme/Daralma | inletWidth, outletWidth, length, depth |
| Rezervuar | width, height, depth |

### Canvas Editörü (CAD-stili)

- **Pan**: Spacebar+drag (Figma) veya orta tık (AutoCAD), wheel/touchpad iki parmak
- **Zoom**: `Ctrl+wheel` / pinch · `Ctrl+= / Ctrl+- / Ctrl+0` klavye · `F` = fit-all · status bar'da tıklanabilir preset menü
- **Seçim**: tek tık · `Ctrl+tık` çoklu · rubber-band (rotation-aware bbox intersect)
- **Hareket**: drag · `↑↓←→` 1 grid step · `Shift+ok` 5× step
- **Transform**: `R / Shift+R` ±15° döndür (çoklu seçim → centroid etrafında)
- **Drag akıcılığı**: bağlantı çizgileri sürükleme esnasında canlı uzar
- **Snap**: `Shift+;` toggle · `G` grid toggle · `P` port toggle
- **Cursor states**: hover→move, drag→grabbing, pan-held→grab, port→crosshair
- **Bağlantı çizimi**: tıkla→hedef tıkla; uyumlu hedef port'lar sarı dashed halo ile vurgulanır, uyumsuzlar soluk
- **Smart routing**: yakın port'lar direkt çizgi, uzaklar manhattan L-bend
- **Bağlantı sağ tık**: Sil · Yönü tersine çevir
- **Geri al/ileri al**: 50-step history
- **Zoom-aware koordinat**: status bar fare konumu zoom seviyesine göre 0/1/2 ondalık

### Simülasyon

**Analitik çözücü** (`run_analytic_network`):
- 10 bileşen tipi için Hagen-Poiseuille direnci
- DFS tabanlı path bulma (tüm direnç ağı)
- Seri/paralel direnç birleştirme
- Bileşen başına: debi (μL/min), basınç düşümü (Pa), Reynolds, Dean (eğri), karıştırma verimi (serpantin)
- Parabolik hız profili (21 nokta) her kanal için
- NaN/Inf koruması (serde JSON güvenli)

**CFD çözücü** (`run_cfd_simulation`):
- 2D sıkıştırılamaz Navier-Stokes, Chorin projeksiyon
- Parabolik inlet profili, no-slip duvarlar, outflow boundary
- Gauss-Seidel SOR Poisson çözücü (ω = 1.7, 80 alt-iter)
- Grid çözünürlüğü: Kaba (60×16), Orta (100×24), İnce (160×36)
- Çıktılar: u/v hızları, basınç, |v| büyüklük, duvar kesme, residual geçmişi

### Sonuç Paneli

- **Özet** — max hız, basınç aralığı, toplam debi, akış rejimi
- **Bileşenler** — tüm metrikler tablo
- **Grafik** — recharts ile debi/basınç bar chart'ı
- **Profil** — bileşen kesitinde parabolik hız profili
- **Deney** — CSV/JSON deney verisi import + R²/RMSE/MAPE
- **Tarama** — parametrik sweep sonuçları (canlı grafik + CSV export)

### Script Editörü (Lua)

- Monaco-tabanlı (Lua syntax highlighting) — **yerel bundle'dan yüklenir, CDN yok (offline)**
- Gömülü Lua 5.4 (mlua), **sandboxed** (no os/io/debug/package)
- `Chip` API: `Chip.new`, 10 `chip:add_*`, `chip:connect`, `chip:clear`
- **`mf.*` API** (v1.1): copilot/şablon/oto-tasarımın ortak eylem yüzeyi — `mf.add_inlet/add_outlet/add_serpentine{length_mm}/connect/set_fluid/set_inlet_pressure/set_target_flow/run_quick/run_cfd` (tam referans: [`docs/SCRIPTING.md`](docs/SCRIPTING.md))
- `Sweep.run` parametrik batch
- Canlı output log

### ✦ AI Asistan + Oto-Tasarım (v1.1)

- **Asistan** (sağ dock sekmesi): doğal dil → tek `mf.*` Lua bloğu → script pipeline → canvas. Üretilen Lua Script sekmesine yazılır, düzenlenebilir; "çalıştırmadan önce onayla" varsayılan açık
- **Sağlayıcı-bağımsız:** Claude (model seçici: Sonnet 4.6 / Fable 5 / Haiku 4.5) → hata/zaman aşımında (≤14 sn) **yerel kural motoru** — `"N:M:K bölücü"`, `"N çıkış eşit"`, mbar/Pa, akışkan adlarını ayrıştırır ve **aynı hidrolik çekirdekle** çözer (UI asla bloke olmaz)
- **Oto-Tasarım** (dialog): N çıkış + hedef debi tablosu → `solve_targets` (R_i = (P−Q·R_feed)/Q_i) → önizleme (R/L/Re + zarf bayrakları) → tek tıkla devre
- **Doğrulama** sekmesi: çıkış başına hedef-vs-fiili debi, sapma yüzdesi (≤%5 yeşil · ≤%15 sarı · üstü kırmızı), zarf/üretim bayrakları
- **API anahtarı yalnız backend'de**: `ANTHROPIC_API_KEY` ortam değişkeni (öncelikli) veya Asistan ⚙ ayarlarından girilen anahtar uygulama config dizinine yazılır; webview anahtarı asla görmez

### Dışa Aktarma

- **PNG** — Konva offscreen render → base64 → Rust alpha-composite, DPI 72–600, beyaz/koyu/şeffaf bg
- **SVG** — vektör export, opsiyonel ölçek çubuğu, kenar payı
- **GDS-II** — binary Stream Format, BOUNDARY polygons, layer 1, 1 nm db-unit; KLayout uyumlu

### Konsantre Simülasyon Akışı

- Toolbar'da **Hızlı Analiz**, **CFD Sim.**, **Tarama** butonları
- Concurrent guard: simülasyon çalışırken diğer sim butonları disabled
- Progress overlay (sağ alt)
- Render error boundary (beyaz ekran yerine kullanıcı dostu hata)

---

## Gereksinimler

| Araç | Versiyon | Not |
|---|---|---|
| [Node.js](https://nodejs.org/) | ≥ 20 | |
| [Rust](https://rustup.rs/) | stable (≥ 1.77) | `rustup update stable` |
| [Tauri CLI](https://tauri.app/v2/) | v2 | `cargo install tauri-cli` |
| **Windows** | Win 10/11 | WebView2 ile birlikte gelir |
| **macOS** | ≥ 10.15 | Xcode Command Line Tools |
| **Linux** | — | `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev` |

---

## Başlangıç

```bash
# 1. Bağımlılıkları kur
npm install

# 2. Geliştirme (frontend hot-reload + Rust backend)
npm run tauri dev

# 3. Production build
npm run tauri build
```

Derlenmiş binary `src-tauri/target/release/` altında; installer/bundle ise `src-tauri/target/release/bundle/`.

> **NOT**: Projeyi başka klasöre taşırsan `cargo clean` çalıştır. Cargo incremental cache absolute path tutar; klasör adı değişince yeniden derleme gerek.

---

## Klavye Kısayolları

### Dosya
| Kısayol | Eylem |
|---|---|
| `Ctrl+N` | Yeni proje |
| `Ctrl+O` | Aç |
| `Ctrl+S` | Kaydet |
| `Ctrl+Shift+S` | Farklı kaydet |
| `Ctrl+E` | Dışa aktar |

### Düzenleme
| Kısayol | Eylem |
|---|---|
| `Ctrl+Z` / `Ctrl+Y` | Geri al / İleri al |
| `Ctrl+A` | Tümünü seç |
| `Ctrl+C` / `Ctrl+V` | Kopyala / Yapıştır |
| `Ctrl+D` | Çoğalt |
| `Delete` / `Backspace` | Seçili bağlantı varsa onu, yoksa seçili bileşenleri sil |
| `Esc` | Bağlantı çizimi iptal / seçim temizle / menü kapat |

### Canvas Görünümü
| Kısayol | Eylem |
|---|---|
| `Ctrl+= / Ctrl++` | Zoom in |
| `Ctrl+-` | Zoom out |
| `Ctrl+0` | Zoom %100 |
| `F` | Tüm bileşenleri ekrana sığdır |
| `G` | Grid göster/gizle |
| `P` | Port'ları göster/gizle |
| `Shift+;` (`:`) | Snap on/off |
| `Spacebar` (basılı tut) + drag | Pan modu (Figma stili) |
| Orta tık + drag | Pan modu (AutoCAD stili) |
| Ctrl+wheel / pinch | Zoom at cursor |

### Bileşen Manipülasyonu
| Kısayol | Eylem |
|---|---|
| Sürükle | Seçili bileşenleri taşı (snap aktifse grid'e) |
| `Shift` + drag | Tek eksende kilitlenmiş drag |
| `↑↓←→` | Seçili bileşenleri 1 grid step nudge |
| `Shift + ok` | 5× nudge |
| `R` / `Shift+R` | ±15° döndür (tek: kendi origin'i, çoklu: centroid etrafında) |

---

## Proje Dosya Formatı

Projeler `.mflow` (JSON) olarak kaydedilir. Schema için [`docs/FILE_FORMAT.md`](docs/FILE_FORMAT.md).

---

## Güvenlik & Gizlilik

MicroFlow Studio **offline-öncelikli** bir desktop uygulamasıdır:

- **Hiçbir telemetri** gönderilmez
- **Tek opt-in ağ çağrısı**: ✦ Asistan'ın Claude isteği — yalnız kullanıcı API anahtarı tanımlayıp mesaj gönderirse, **backend'den** (`reqwest`) `api.anthropic.com`'a gider; webview hiçbir dış host'a çıkamaz (CSP). Anahtar yoksa yerel kural motoru devrededir, uygulama tamamen çevrimdışı çalışır
- Onun dışında **hiçbir ağ çağrısı** yapılmaz — fontlar (`@fontsource` ile self-hosted IBM Plex) ve **Monaco editör tamamen yerel bundle'dan** gelir; build çıktısı `dist/` içinde CDN URL'si yoktur
- **API anahtarı**: `ANTHROPIC_API_KEY` ortam değişkeni veya uygulama config dizinindeki `llm.json` (UI'dan kaydedilir, Unix'te 0600); anahtar webview'a/loglara asla dönmez
- **Dosya erişimi**: kullanıcının seçtiği `.mflow` / export hedef klasörüne sınırlıdır (Tauri dialog)
- **Lua sandbox**: `os`, `io`, `debug`, `package` modülleri devre dışı (kod execution attack surface yok)
- **CSP**: Tauri config'inde XSS karşı temel `default-src 'self'` policy

> **Geliştirici notu**: `fs:scope` `**` ile geniş tutulmuştur çünkü kullanıcı export için her yere yazabilmeli. Sınırlı bir kullanım istersen `src-tauri/capabilities/default.json` içinde `$HOME/Documents/MicroFlow/**` gibi daraltabilirsin.

---

## Dokümantasyon

| Dosya | İçerik |
|---|---|
| [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) | Klasör sorumlulukları, "şu şuraya gider" kuralları, isimlendirme, pattern'ler |
| [`docs/BUGS.md`](docs/BUGS.md) | Bilinen sorun kaydı (keşif + kök neden + çözüm geçmişi) |
| [`docs/CODE_MAP.md`](docs/CODE_MAP.md) | "X nerede?" + uçtan uca akışlar (UI → hook → IPC → Rust domain) |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Frontend/backend katman, IPC komut listesi, veri akışı |
| [`docs/COMPONENTS.md`](docs/COMPONENTS.md) | 10 bileşen tipi, parametreler, port topoloji, direnç formülleri |
| [`docs/SIMULATION.md`](docs/SIMULATION.md) | Analitik ağ çözücü + CFD algoritmaları |
| [`docs/FORMULAS.md`](docs/FORMULAS.md) | Tüm fizik formülleri (direnç, Re, Dean, karıştırma) türetimleriyle |
| [`docs/RELATED_WORK.md`](docs/RELATED_WORK.md) | µFG companion repo analizi — yaklaşım farkları, atıflar, gelecek adaylar |
| [`docs/SCRIPTING.md`](docs/SCRIPTING.md) | Lua API referansı + örnekler |
| [`docs/FILE_FORMAT.md`](docs/FILE_FORMAT.md) | `.mflow` JSON schema, GDS-II layer stratejisi |
| [`docs/SHORTCUTS.md`](docs/SHORTCUTS.md) | Tam klavye kısayolu tablosu |
| [`docs/TESTING.md`](docs/TESTING.md) | Rust + Vitest test envanteri ve felsefesi |
| [`CHANGELOG.md`](CHANGELOG.md) | Faz-faz değişiklik geçmişi |

---

## Örnekler

```
examples/
  data/
    velocity_profile.csv             — 200 μm kanalda parabolik hız ölçümü
    velocity_profile_experiment.csv  — Deney import diyaloğu için örnek ölçüm
    pressure_drop.csv                — Basınç düşümü vs debi, 5 kanal uzunluğu
    pressure_drop_experiment.csv     — Deney import diyaloğu için örnek ölçüm
    mixing_efficiency.json           — 4 Re'de karıştırma verimi (JSON formatı)
  scripts/
    basic_t_junction.lua             — Chip API ile basit T-bağlantı
    parametric_sweep.lua             — Kanal genişliği taraması
    gradient_generator.lua           — Konsantrasyon gradiyent ağı
    droplet_generator.lua            — Damla üreteci tasarımı (script ile)
    parametric_mixer.lua             — Parametrik serpantin mikser
  projects/
    t_junction_basic.mflow           — Basit T-bağlantı tasarımı (uygulamada aç)
    serpentine_mixer.mflow           — Serpantin mikser tasarımı
```

---

## Geliştirme Notları

Kod tabanında gezinme için: klasör kuralları [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md), "X nerede?" + akışlar [`docs/CODE_MAP.md`](docs/CODE_MAP.md).

```bash
# Frontend: lint + format + tip kontrolü + testler
npm run lint            # eslint (0 hata hedefi; uyarılar bilgilendirici)
npm run format          # prettier --write
npm run typecheck       # tsc --noEmit
npm test                # vitest (104 test: karakterizasyon + correctness + AI yardımcıları)

# Rust testleri (57 test, ~2 sn) + clippy strict
cd src-tauri && cargo test --lib
cd src-tauri && cargo clippy --all-targets -- -D warnings

# Production build
npm run tauri build
```

> **pre-commit hook** (husky + lint-staged): her commit'te değişen dosyalarda `eslint --fix` + `prettier --write`, ardından proje-geneli `typecheck` + `test` çalışır; başarısızsa commit iptal olur. Acil durumda `git commit --no-verify` ile atlanabilir.

---

## Bilimsel Referans

AI copilot + inverse design + doğrulama özellikleri (v1.1), **µFluidicGenius (µFG)**
çalışmasından esinlenmiştir ve yöntemleri bağımsız olarak yeniden uygular:

> Taşoğlu, S. ve ark. *"ML-automated microfluidic circuit design."*
> **Science Advances** 12(5), 2026. [doi:10.1126/sciadv.aea7598](https://doi.org/10.1126/sciadv.aea7598)
> Companion kod: [Microfluidics-Resistance-ML](https://github.com/dxbiotech/Microfluidics-Resistance-ML) (BSD-3) · [ML-Micromilling-UI](https://github.com/dxbiotech/ML-Micromilling-UI) (MIT)

Yaklaşım karşılaştırması ve ayrıntılı analiz: [`docs/RELATED_WORK.md`](docs/RELATED_WORK.md).
MicroFlow Studio ile üretilen akademik çalışmalarda lütfen yukarıdaki makaleyi kaynak gösterin.

---

## Lisans

MIT — [`LICENSE`](LICENSE) dosyasına bakın.
