import { describe, it, expect, beforeEach } from 'vitest';
import { useDesignStore } from './useDesignStore';
import { applyActionBatch } from '../hooks/useScriptDispatcher';
import type { ChipComponent, Connection } from '../types';

const S = () => useDesignStore.getState();

function port(id: string): ChipComponent {
  return {
    id,
    type: 'port',
    position: { x: 0, y: 0 },
    rotation: 0,
    params: { diameter: 200, portType: 'inlet' },
    ports: [],
  } as unknown as ChipComponent;
}
function conn(id: string, from: string, fp: number, to: string, tp: number): Connection {
  return { id, fromComponentId: from, fromPortIndex: fp, toComponentId: to, toPortIndex: tp };
}

beforeEach(() => {
  S().clearDesign();
});

describe('addComponent', () => {
  it('bileşen ekler', () => {
    S().addComponent(port('a'));
    expect(S().components.map((c) => c.id)).toEqual(['a']);
  });
});

describe("addConnection invariant'ları", () => {
  beforeEach(() => {
    S().addComponent(port('a'));
    S().addComponent(port('b'));
    S().addComponent(port('c'));
  });

  it('geçerli bağlantı eklenir', () => {
    S().addConnection(conn('e1', 'a', 0, 'b', 0));
    expect(S().connections).toHaveLength(1);
  });

  it('duplikat (aynı çift) yok sayılır', () => {
    S().addConnection(conn('e1', 'a', 0, 'b', 0));
    S().addConnection(conn('e2', 'a', 0, 'b', 0));
    expect(S().connections).toHaveLength(1);
  });

  it('self-loop (aynı bileşen+port) yok sayılır', () => {
    S().addConnection(conn('e1', 'a', 0, 'a', 0));
    expect(S().connections).toHaveLength(0);
  });

  it('meşgul port yok sayılır', () => {
    S().addConnection(conn('e1', 'a', 0, 'b', 0)); // a:0 meşgul
    S().addConnection(conn('e2', 'a', 0, 'c', 0)); // a:0 tekrar → reddedilir
    expect(S().connections).toHaveLength(1);
  });
});

describe('moveComponents', () => {
  it('pozisyonu delta kadar kaydırır', () => {
    S().addComponent(port('a'));
    S().moveComponents([{ id: 'a', dx: 100, dy: -50 }]);
    const a = S().components.find((c) => c.id === 'a')!;
    expect(a.position).toEqual({ x: 100, y: -50 });
  });
});

describe('rotateSelected', () => {
  it("tek seçim → kendi rotation'ı (mod 360)", () => {
    S().addComponent({ ...port('a'), rotation: 350 } as ChipComponent);
    S().setSelected(['a']);
    S().rotateSelected(20);
    expect(S().components.find((c) => c.id === 'a')!.rotation).toBe(10); // 370 % 360
  });
});

// İki-yığın modeli (fix/stabilization). Spec: BUGS.md #1 çözüldü — her undo/redo
// TAM BİR adım hareket eder; ilk aksiyon geri alınabilir; redo son durumu getirir.
describe('undo / redo (iki-yığın — DOĞRU davranış)', () => {
  it('tek aksiyon geri alınabilir; redo ileri alır', () => {
    S().addComponent(port('a'));
    expect(S().components).toHaveLength(1);
    expect(S().canUndo()).toBe(true);
    S().undo();
    expect(S().components).toHaveLength(0); // aksiyon-öncesi duruma döner
    expect(S().canRedo()).toBe(true);
    S().redo();
    expect(S().components.map((c) => c.id)).toEqual(['a']); // aksiyon-sonrasına döner
  });

  it('N aksiyon birer birer geri/ileri alınır', () => {
    S().addComponent(port('a'));
    S().addComponent(port('b'));
    S().addComponent(port('c'));
    expect(S().components.map((c) => c.id)).toEqual(['a', 'b', 'c']);

    S().undo();
    expect(S().components.map((c) => c.id)).toEqual(['a', 'b']); // yalnız c gider
    S().undo();
    expect(S().components.map((c) => c.id)).toEqual(['a']);
    S().undo();
    expect(S().components.map((c) => c.id)).toEqual([]); // başlangıç
    expect(S().canUndo()).toBe(false);

    S().redo();
    expect(S().components.map((c) => c.id)).toEqual(['a']); // birer birer ileri
    S().redo();
    expect(S().components.map((c) => c.id)).toEqual(['a', 'b']);
    S().redo();
    expect(S().components.map((c) => c.id)).toEqual(['a', 'b', 'c']); // en son durum
    expect(S().canRedo()).toBe(false);
  });

  it('undo sonrası yeni aksiyon redo yığınını temizler', () => {
    S().addComponent(port('a'));
    S().addComponent(port('b'));
    S().undo(); // [a]
    expect(S().canRedo()).toBe(true);
    S().addComponent(port('c')); // yeni dal → terk edilen redo temizlenir
    expect(S().canRedo()).toBe(false);
    expect(S().components.map((c) => c.id)).toEqual(['a', 'c']);
    S().redo(); // redo boş → no-op
    expect(S().components.map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('sınırlarda no-op (boş undo/redo bir şey yapmaz)', () => {
    expect(S().canUndo()).toBe(false);
    expect(S().canRedo()).toBe(false);
    S().undo();
    S().redo();
    expect(S().components).toHaveLength(0);
    S().addComponent(port('a'));
    S().redo(); // ileri alınacak yok
    expect(S().components.map((c) => c.id)).toEqual(['a']);
  });

  it('50 (MAX_HISTORY) adım cap — en eski düşer, yalnız son 50 geri alınabilir', () => {
    for (let i = 0; i < 60; i++) S().addComponent(port(`c${i}`));
    expect(S().components).toHaveLength(60);
    let undos = 0;
    while (S().canUndo()) {
      S().undo();
      undos++;
    }
    expect(undos).toBe(50); // cap: en fazla 50 adım geri
    // En eski 10 ekleme (c0..c9) geri alınamaz → kalır.
    expect(S().components.map((c) => c.id)).toEqual(Array.from({ length: 10 }, (_, i) => `c${i}`));
  });

  it('bileşik aksiyon = TEK undo girdisi (moveComponents)', () => {
    S().addComponent({ ...port('a'), position: { x: 0, y: 0 } } as ChipComponent);
    S().addComponent({ ...port('b'), position: { x: 0, y: 0 } } as ChipComponent);
    S().moveComponents([
      { id: 'a', dx: 100, dy: 0 },
      { id: 'b', dx: 100, dy: 0 },
    ]);
    expect(S().components.every((c) => c.position.x === 100)).toBe(true);
    S().undo(); // tek undo → iki taşıma birden geri
    expect(S().components.every((c) => c.position.x === 0)).toBe(true);
  });

  it('bileşik aksiyon = TEK undo girdisi (paste)', () => {
    S().addComponent(port('a'));
    S().setSelected(['a']);
    S().copySelected();
    S().pasteClipboard();
    expect(S().components.length).toBeGreaterThan(1); // en az 1 yeni bileşen
    S().undo(); // tek undo → yapıştırılanların tümü gider
    expect(S().components.map((c) => c.id)).toEqual(['a']);
  });

  it('bileşik aksiyon = TEK undo girdisi (script batch)', () => {
    S().addComponent(port('a'));
    applyActionBatch([
      { type: 'add_component', component: port('b') },
      { type: 'add_component', component: port('c') },
    ]);
    expect(S().components.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    S().undo(); // tek undo → tüm script sonucu geri
    expect(S().components.map((c) => c.id)).toEqual(['a']);
  });
});
