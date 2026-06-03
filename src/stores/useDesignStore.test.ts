import { describe, it, expect, beforeEach } from 'vitest';
import { useDesignStore } from './useDesignStore';
import type { ChipComponent, Connection } from '../types';

const S = () => useDesignStore.getState();

function port(id: string): ChipComponent {
  return { id, type: 'port', position: { x: 0, y: 0 }, rotation: 0, params: { diameter: 200, portType: 'inlet' }, ports: [] } as unknown as ChipComponent;
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

describe('addConnection invariant\'ları', () => {
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
  it('tek seçim → kendi rotation\'ı (mod 360)', () => {
    S().addComponent({ ...port('a'), rotation: 350 } as ChipComponent);
    S().setSelected(['a']);
    S().rotateSelected(20);
    expect(S().components.find((c) => c.id === 'a')!.rotation).toBe(10); // 370 % 360
  });
});

describe('undo / redo (KARAKTERİZASYON — mevcut davranış, latent bug dahil)', () => {
  // NOT: pushHistory mutasyondan ÖNCE snapshot alır; son (mutasyon-sonrası)
  // durum history'e GİRMEZ + undo guard'ı `historyIndex <= 0`. Bunun iki
  // gözlemlenebilir sonucu (mevcut davranış — doğruluk fazında düzeltilince
  // bu testler KASITLI güncellenecek):
  //   1) İlk aksiyon geri alınamaz (index 0'da kalır).
  //   2) İkinci undo "pre-everything" snapshot'a düşer (off-by-one).

  it('tek aksiyon → undo no-op (ilk aksiyon geri alınamaz)', () => {
    S().addComponent(port('a'));
    expect(S().components).toHaveLength(1);
    S().undo();
    expect(S().components).toHaveLength(1); // değişmez (guard historyIndex<=0)
  });

  it('iki aksiyon → undo pre-A snapshot\'a döner, redo pre-B snapshot\'a', () => {
    S().addComponent(port('a'));
    S().addComponent(port('b'));
    expect(S().components.map((c) => c.id)).toEqual(['a', 'b']);
    S().undo();
    expect(S().components.map((c) => c.id)).toEqual([]);      // off-by-one: ikisi de gider
    S().redo();
    expect(S().components.map((c) => c.id)).toEqual(['a']);   // [a,b] geri gelmez
  });
});
