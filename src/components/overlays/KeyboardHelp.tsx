/**
 * KeyboardHelp.tsx — Klavye kısayolları cheat-sheet overlay'i.
 *
 * Kullanıcı `?` veya `F1` tuşuna basınca açılır. Profesyonel CAD/IDE
 * standardı: tüm kısayollar tek bakışta görünür, ESC ile kapanır.
 */
import React from 'react';
import { FiX } from 'react-icons/fi';
import { useEscapeClose } from '../../hooks/useEscapeClose';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  items: Array<{ keys: string[]; desc: string }>;
}

const GROUPS: ShortcutGroup[] = [
  {
    title: 'Dosya',
    items: [
      { keys: ['Ctrl', 'N'], desc: 'Yeni proje' },
      { keys: ['Ctrl', 'O'], desc: 'Aç' },
      { keys: ['Ctrl', 'S'], desc: 'Kaydet' },
      { keys: ['Ctrl', 'Shift', 'S'], desc: 'Farklı kaydet' },
      { keys: ['Ctrl', 'E'], desc: 'Dışa aktar' },
    ],
  },
  {
    title: 'Düzenleme',
    items: [
      { keys: ['Ctrl', 'Z'], desc: 'Geri al' },
      { keys: ['Ctrl', 'Y'], desc: 'İleri al' },
      { keys: ['Ctrl', 'A'], desc: 'Tümünü seç' },
      { keys: ['Ctrl', 'C'], desc: 'Kopyala' },
      { keys: ['Ctrl', 'V'], desc: 'Yapıştır' },
      { keys: ['Ctrl', 'D'], desc: 'Çoğalt' },
      { keys: ['Del'], desc: 'Seçileni sil' },
    ],
  },
  {
    title: 'Görünüm / Zoom',
    items: [
      { keys: ['Ctrl', '+'], desc: 'Yakınlaştır' },
      { keys: ['Ctrl', '−'], desc: 'Uzaklaştır' },
      { keys: ['Ctrl', '0'], desc: 'Zoom %100, sıfırla' },
      { keys: ['F'], desc: 'Tüm bileşenleri sığdır' },
      { keys: ['Ctrl', 'Wheel'], desc: 'Cursor üzerinde zoom' },
    ],
  },
  {
    title: 'Pan / Navigasyon',
    items: [
      { keys: ['Space', '+ Drag'], desc: 'Pan (Figma stili)' },
      { keys: ['Orta Tık'], desc: 'Pan (CAD stili)' },
      { keys: ['Wheel'], desc: 'Dikey pan' },
      { keys: ['Shift', 'Wheel'], desc: 'Yatay pan' },
    ],
  },
  {
    title: 'Canvas',
    items: [
      { keys: ['R'], desc: 'Seçileni 15° döndür (CW)' },
      { keys: ['Shift', 'R'], desc: 'Seçileni 15° döndür (CCW)' },
      { keys: ['Shift', '+ Drag'], desc: 'Aks-kilitleme (yatay/dikey)' },
      { keys: ['G'], desc: 'Grid göster/gizle' },
      { keys: ['P'], desc: 'Portları göster/gizle' },
      { keys: ['Shift', ';'], desc: 'Snap-to-grid aç/kapa' },
      { keys: ['Esc'], desc: 'Bağlantı / seçim iptali' },
      { keys: ['Sağ Tık'], desc: 'Bağlam menüsü' },
    ],
  },
  {
    title: 'Yardım',
    items: [
      { keys: ['?'], desc: 'Bu pencereyi aç / kapat' },
      { keys: ['F1'], desc: 'Bu pencereyi aç / kapat' },
    ],
  },
];

const KeyboardHelp: React.FC<Props> = ({ open, onClose }) => {
  useEscapeClose(open, onClose);

  if (!open) return null;

  return (
    <div
      className="backdrop-enter fixed inset-0 z-[60] flex items-center justify-center bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kbhelp-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-enter bg-mf-surface border border-mf-border-strong rounded-ds-lg shadow-pop w-[640px] max-w-[92vw] max-h-[88vh] flex flex-col">
        <div className="panel-header">
          <span id="kbhelp-title">Klavye Kısayolları</span>
          <button
            onClick={onClose}
            className="text-mf-text-dim hover:text-mf-text"
            aria-label="Kapat"
          >
            <FiX size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-2 gap-x-8 gap-y-5">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <div className="section-title mb-2">{group.title}</div>
              <div className="space-y-1">
                {group.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-0.5">
                    <span className="text-xs text-mf-text-dim">{item.desc}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {item.keys.map((k, ki) => (
                        <React.Fragment key={ki}>
                          {ki > 0 && <span className="text-mf-text-dark text-2xs">+</span>}
                          <kbd className="kbd">{k}</kbd>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-mf-border bg-mf-panel text-2xs text-mf-text-dark text-center uppercase tracking-caps">
          ESC veya <kbd className="kbd">?</kbd> ile kapat
        </div>
      </div>
    </div>
  );
};

export default KeyboardHelp;
