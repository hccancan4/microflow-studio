# Bilinen Sorunlar (Known Issues)

Bu dosya keşfedilmiş ama henüz düzeltilmemiş davranış hatalarını izler.
Her kayıt: semptom + kök neden + düzeltme planı.

---

## #1 — Undo/Redo off-by-one (geçmiş yönetimi)

**Durum:** ✅ Çözüldü — `fc4f6ba` (fix/stabilization turu) · **Önem:** Orta · **Keşif:** Kod-düzeni refactor'ü, FAZ 1 (karakterizasyon testleri)

**Semptomlar:**
- İlk aksiyondan sonra **Ctrl+Z hiçbir şey yapmaz** (ilk aksiyon geri alınamaz).
- İki aksiyon yapıp undo'ya basınca **her iki aksiyon birden** geri alınır (tek değil).
- Undo sonrası redo, undo'dan önceki son durumu **geri getirmez** (bir önceki snapshot'a düşer).

**Kök neden** (`src/stores/useDesignStore.ts`):
- `pushHistory` snapshot'ı **mutasyondan ÖNCE** alır → son (mutasyon-sonrası) durum hiçbir zaman history'e girmez.
- `undo` guard'ı `if (historyIndex <= 0) return;` → index 0'daki ilk snapshot'a erişilemez.
- İkisi birleşince klasik off-by-one: `undo` `history[historyIndex - 1]`'e gider; bu, son aksiyonun değil ondan ÖNCEKİ durumun snapshot'ıdır.

**Doğru desen:** Geçmiş, mutasyon-SONRASI durumları tutmalı; mevcut durum daima `history[historyIndex]` olmalı. Undo `history[historyIndex-1]`'e, redo `history[historyIndex+1]`'e gider ve guard'lar buna göre.

**Çözüm** (`fc4f6ba`, fix/stabilization turu):
- Tek-dizi `history[]` + `historyIndex` modeli **iki-yığın** (undoStack + redoStack) ile değiştirildi. Bu, mevcut "mutasyondan ÖNCE pushHistory" çağrı desenine birebir oturur (call-site değişikliği yok).
- `pushHistory` mevcut (mutasyon-öncesi) durumu undoStack'e iter ve redoStack'i temizler (yeni aksiyon redo dalını terk eder). `undo`/`redo` geçişten önce mevcut durumu karşı yığına kaydeder → her biri **tam bir adım** hareket eder.
- `canUndo`/`canRedo` yığın boşluğuna bakar; sınırda no-op.
- Korunan invariant'lar: 50-adım cap (`MAX_HISTORY`, en eski düşer), bileşik aksiyon = tek girdi (addComponents / moveComponents / paste / script batch), load/new history reset.
- Karakterizasyon testleri **kasıtlı olarak** doğru spec'e güncellendi + 6 yeni test eklendi (tek/N-adım/redo-temizleme/sınır/50-cap/bileşik×3). vitest 66 → 72.
