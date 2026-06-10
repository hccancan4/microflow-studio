# MicroFlow Studio — Kod Konvansiyonları

Bu belge "şu kod nereye gider?" sorusunu yapıya bakarak yanıtlamak içindir.
Her dosyanın **tek net sorumluluğu** olmalı; bir mühendis projeyi açınca
gezinebilmeli. Uçtan uca akışlar için bkz. [`docs/CODE_MAP.md`](docs/CODE_MAP.md).

---

## Klasör sorumlulukları (frontend — `src/`)

| Klasör | Sorumluluk | Örnek |
|---|---|---|
| `components/<Alan>/` | Görsel React bileşenleri, alana göre gruplu | `Canvas/`, `ResultsPanel/`, `Toolbar/`, `Sidebar/`, `PropertiesPanel/`, `StatusBar/`, `ScriptEditor/`, `overlays/` (toast/progress/yardım) |
| `features/<özellik>/` | Kendine yeten, dikey bir özelliğin tüm parçaları (UI + store + util) | `features/experiment/`, `features/export/`, `features/sweep/` |
| `hooks/` | Yeniden kullanılabilir React hook'ları; App orkestrasyonu hook'lara taşınır | `useProjectIO`, `useSimulationRun`, `useExportFlow`, `useScriptRun`, `useKeyboardShortcuts` |
| `stores/` | Zustand global state; her store tek bir alan (feature'a özel store ilgili `features/` klasöründe) | `useDesignStore` (tasarım+canvas), `useSimulationStore`, `useUiStore`, `useProjectStore` |
| `types/` | Domain'e bölünmüş TypeScript tipleri + re-export hub | `component.ts`, `canvas.ts`, `simulation.ts`, `project.ts`, `experiment.ts`, `ui.ts`, `index.ts` |
| `utils/` | Saf, framework'süz yardımcılar (paylaşılan) | `portUtils`, `componentBbox`, `colormaps`, `componentDefaults` |
| `theme/` | Tasarım token'ları ve renk kaynakları (JS tarafı kanonik) | `tokens.ts`, `componentColors.ts` |
| `templates/` | "Şablondan başla" başlangıç tasarımları | `starters.ts` |

## Klasör sorumlulukları (backend — `src-tauri/src/`)

| Klasör | Sorumluluk |
|---|---|
| `commands/` | **İnce IPC adapter'ları**. İş mantığı YOK; sadece DTO eşleme + domain çağrısı + hata→`String`. |
| `simulation/` | Çözücüler: `analytic.rs` (Hagen-Poiseuille ağ), `cfd.rs` (Chorin 2D Stokes) |
| `export/` | PNG / SVG / GDS-II serileştirme |
| `project/` | `.mflow` dosya şeması + kaydet/yükle |
| `scripting/` | Lua yorumlayıcı + `DesignAction` köprüsü |
| `geometry/` | Geometrik yardımcılar |

---

## "Şu şuraya gider" kuralları

- **Yeni bir dikey özellik** (kendi dialog'u + store'u + util'i olan)? → `features/<ad>/` altında topla.
- **Birden çok yerin kullandığı saf yardımcı**? → `utils/`. Tek bir özelliğe aitse o feature klasörüne.
- **Canvas/Konva'ya özel çizim**? → `components/Canvas/`.
- **App.tsx'e handler eklemek mi istiyorsun?** → Hayır. Bir `hooks/useXxx.ts` aç; App ince kompozisyon kökü kalır.
- **Yeni IPC komutu**? → `commands/<alan>_commands.rs` ince adapter; iş mantığını ilgili domain modülüne koy.
- **Paylaşılan tip**? → `types/<domain>.ts` (proje şemasına giren tipler burada kalır; feature'a taşınmaz — bkz. `experiment.ts`).

## İsimlendirme

- Hook: `useXxx.ts` (camelCase, `use` öneki).
- Bileşen: `PascalCase.tsx`, default export bileşenin kendisi.
- Store: `useXxxStore.ts`.
- Util: `camelCase.ts`, isimli export'lar.
- Test: kaynak dosyanın yanında `*.test.ts` (co-located).

## Kullanılacak pattern'ler

- **Açık import yolları** — barrel/`index.ts` re-export YOK (`types/index.ts` istisnası: var olan giriş noktası).
- **Zustand seçici abonelik** — `useStore((s) => s.x)`; tüm store'u çekme (gereksiz re-render).
- **`React.memo` + kararlı `useCallback`** — handler'ları inline arrow yerine doğrudan geçir.
- **İsimli sabitler** — magic number yerine dokümante `const`. Grab-bag `constants.ts` YOK; sabiti kullanıldığı domain'e/dosyaya koy (ör. zoom limitleri `useDesignStore`, solver sabitleri `cfd.rs`/`analytic.rs`).
- **Tipli veri** — modüller arası `any` değil, `types/`'tan interface.

## Kaçınılacaklar

- Dev dosyalar: bir dosya çok sorumluluk taşıyor/~300-400 satırı aşıyorsa böl (App.tsx ve ResultsPanel.tsx bu yüzden bölündü).
- `console.log` yerine `useUiStore` toast / yapılandırılmış akış.
- IPC sonucu işlenmeden state'e yazmak — önce tip doğrula (`RawMFlowProject` → `MFlowProject`).

## Dosya boyutu rehberi

- Bileşen/modül ~300-400 satırı aşıyor **ve** birden çok sorumluluk varsa → böl.
- Konva etkileşim mantığı gibi yüksek-coupling bütünler bir arada kalabilir (aşırı bölme coupling riski).

## Lint / Format / Test

```bash
npm run lint          # eslint (0 hata hedefi; uyarılar bilgilendirici)
npm run format        # prettier --write
npm run typecheck     # tsc --noEmit
npm test              # vitest (karakterizasyon testleri)
```

- **pre-commit hook** (husky + lint-staged): her commit'te değişen dosyalarda `eslint --fix` + `prettier --write`, ardından proje-geneli `typecheck` + `test`. Başarısızsa commit iptal. Drift'in asıl önleyicisi budur — `--no-verify` ile atlama.
- **Rust**: `cargo fmt`, `cargo clippy --all-targets -- -D warnings`, `cargo test --lib`.
- Stil ESLint değil **Prettier**'in işi; `eslint-config-prettier` çakışmayı kapatır.

## Test felsefesi

Testlerin çoğu **karakterizasyon testleri** — ŞU ANKİ davranışı kilitler (doğru olanı değil). Refactor boyunca değişmeden geçmeli. Bilinçli bir doğruluk düzeltmesi (formül/solver) bir testi "kırarsa" o test kasıtlı güncellenir. Bu tam olarak undo/redo'da yaşandı: stabilizasyon turunda off-by-one düzeltildi (BUGS.md #1), undo testleri kasıtlı olarak **doğru davranış** testlerine dönüştürüldü + yeni testler eklendi. Bilinen latent bug'lar [`BUGS.md`](BUGS.md)'de.
