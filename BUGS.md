# Bilinen Sorunlar (Known Issues)

Bu dosya keşfedilmiş ama henüz düzeltilmemiş davranış hatalarını izler.
Her kayıt: semptom + kök neden + düzeltme planı.

---

## #1 — Undo/Redo off-by-one (geçmiş yönetimi)

**Durum:** Açık · **Önem:** Orta · **Keşif:** Kod-düzeni refactor'ü, FAZ 1 (karakterizasyon testleri)

**Semptomlar:**
- İlk aksiyondan sonra **Ctrl+Z hiçbir şey yapmaz** (ilk aksiyon geri alınamaz).
- İki aksiyon yapıp undo'ya basınca **her iki aksiyon birden** geri alınır (tek değil).
- Undo sonrası redo, undo'dan önceki son durumu **geri getirmez** (bir önceki snapshot'a düşer).

**Kök neden** (`src/stores/useDesignStore.ts`):
- `pushHistory` snapshot'ı **mutasyondan ÖNCE** alır → son (mutasyon-sonrası) durum hiçbir zaman history'e girmez.
- `undo` guard'ı `if (historyIndex <= 0) return;` → index 0'daki ilk snapshot'a erişilemez.
- İkisi birleşince klasik off-by-one: `undo` `history[historyIndex - 1]`'e gider; bu, son aksiyonun değil ondan ÖNCEKİ durumun snapshot'ıdır.

**Doğru desen:** Geçmiş, mutasyon-SONRASI durumları tutmalı; mevcut durum daima `history[historyIndex]` olmalı. Undo `history[historyIndex-1]`'e, redo `history[historyIndex+1]`'e gider ve guard'lar buna göre.

**Düzeltme planı:**
- ❌ Bu refactor turunda **düzeltilmeyecek** — turun sözü "sıfır davranış değişikliği". Undo'yu düzeltmek davranışı değiştirir.
- Refactor tamamlandıktan sonra **ayrı bir bugfix commit'i** ile düzeltilecek; aynı commit'te `src/stores/useDesignStore.test.ts`'teki karakterizasyon testi (şu an off-by-one'ı kilitliyor) **kasıtlı olarak** doğru davranışı yansıtacak şekilde güncellenecek.
- Bu kayıt yalnızca **dokümantasyon** — kod davranışı şu an değişmiyor.
