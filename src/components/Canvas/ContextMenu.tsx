/**
 * ContextMenu.tsx
 * Canvas sağ-tık context menüsü.
 * Seçili bileşenler için: sil, kopyala, yapıştır, döndür, özellikler.
 */
import React, { useEffect, useRef } from 'react';
import {
  FiTrash2, FiCopy, FiClipboard, FiRotateCw, FiRotateCcw,
  FiLayers, FiMove, FiLink, FiLink2,
} from 'react-icons/fi';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  divider?: boolean;
  danger?: boolean;
  disabled?: boolean;
}

interface ContextMenuProps {
  x: number;         // screen px
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Dışarıya tıklayınca kapat
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick, true);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick, true);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Ekran sınırlarını aş
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 200),
    top:  Math.min(y, window.innerHeight - items.length * 32 - 16),
    zIndex: 9999,
  };

  return (
    <div
      ref={menuRef}
      style={style}
      className="bg-gray-900 border border-mf-border rounded shadow-2xl py-1 min-w-44 select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, idx) => (
        <React.Fragment key={idx}>
          {item.divider && idx > 0 && (
            <div className="border-t border-mf-border my-1" />
          )}
          <button
            className={`
              flex items-center gap-2.5 w-full px-3 py-1.5 text-xs text-left
              transition-colors duration-75
              ${item.disabled
                ? 'text-mf-text-dark cursor-not-allowed'
                : item.danger
                  ? 'text-mf-red hover:bg-red-900/30'
                  : 'text-mf-text hover:bg-mf-surface hover:text-mf-blue'}
            `}
            onClick={() => { if (!item.disabled) { item.onClick(); onClose(); } }}
            disabled={item.disabled}
          >
            {item.icon && (
              <span className="flex-shrink-0 opacity-70">{item.icon}</span>
            )}
            <span>{item.label}</span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};

export default ContextMenu;
