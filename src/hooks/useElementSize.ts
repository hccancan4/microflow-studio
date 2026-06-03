import React, { useEffect, useState } from 'react';

/**
 * useElementSize — bir DOM elemanının canlı genişlik/yüksekliğini izler
 * (ResizeObserver). Panel/canvas boyutlandırması için. Başlangıç 800×600.
 */
export function useElementSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
