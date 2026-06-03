/**
 * Sidebar — Sol panel: Bileşen kütüphanesi
 * Kategorize edilmiş mikroakışkan bileşenler, sürükle-bırak desteği
 */
import React, { useState } from 'react';
import { FiChevronDown, FiChevronRight } from 'react-icons/fi';
import type { ComponentType } from '../../types';
import clsx from 'clsx';
import { COMPONENT_COLORS, PORT_COLORS } from '../../theme/componentColors';

// Bileşen renkleri — canvas ile birebir aynı (componentColors.ts tek kaynak)
const C_CHANNEL   = COMPONENT_COLORS.straight_channel.stroke;
const C_JUNCTION  = COMPONENT_COLORS.t_junction.stroke;
const C_MIXER     = COMPONENT_COLORS.serpentine_mixer.stroke;
const C_DROPLET   = COMPONENT_COLORS.droplet_generator.stroke;
const C_FILTER    = COMPONENT_COLORS.filter_array.stroke;
const C_EXPANSION = COMPONENT_COLORS.expansion.stroke;
const C_RESERVOIR = COMPONENT_COLORS.reservoir.stroke;

interface ComponentDef {
  type: ComponentType;
  label: string;
  icon: React.ReactNode;
  description: string;
  /** 'port' tipi için giriş/çıkış ayrımı (Sidebar'da iki ayrı item) */
  portType?: 'inlet' | 'outlet';
}

interface Category {
  name: string;
  components: ComponentDef[];
}

// SVG önizleme ikonları
const ChannelIcon = () => (
  <svg width="32" height="20" viewBox="0 0 32 20">
    <rect x="1" y="7" width="30" height="6" fill="none" stroke={C_CHANNEL} strokeWidth="1.5" rx="1" />
  </svg>
);
const CurvedIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32">
    <path d="M 4 28 A 24 24 0 0 1 28 4" fill="none" stroke={C_CHANNEL} strokeWidth="3" />
  </svg>
);
const TIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32">
    <rect x="1" y="13" width="30" height="6" fill="none" stroke={C_JUNCTION} strokeWidth="1.5" />
    <rect x="13" y="1" width="6" height="14" fill="none" stroke={C_JUNCTION} strokeWidth="1.5" />
  </svg>
);
const YIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32">
    <line x1="16" y1="16" x2="4" y2="4" stroke={C_JUNCTION} strokeWidth="3" strokeLinecap="round" />
    <line x1="16" y1="16" x2="28" y2="4" stroke={C_JUNCTION} strokeWidth="3" strokeLinecap="round" />
    <line x1="16" y1="16" x2="16" y2="31" stroke={C_JUNCTION} strokeWidth="3" strokeLinecap="round" />
  </svg>
);
const MixerIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32">
    <path d="M4 8 H28 M4 14 H28 M4 20 H28 M4 26 H28" fill="none" stroke={C_MIXER} strokeWidth="2" />
    <line x1="4" y1="8" x2="4" y2="26" stroke={C_MIXER} strokeWidth="2" />
    <line x1="28" y1="8" x2="28" y2="26" stroke={C_MIXER} strokeWidth="2" />
  </svg>
);
const PortIcon = ({ type }: { type: 'inlet' | 'outlet' }) => {
  const col = type === 'inlet' ? PORT_COLORS.inlet.stroke : PORT_COLORS.outlet.stroke;
  return (
    <svg width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="10" fill="none" stroke={col} strokeWidth="2" />
      <circle cx="16" cy="16" r="4" fill={col} />
    </svg>
  );
};
const DropletIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32">
    <rect x="1" y="13" width="30" height="6" fill="none" stroke={C_DROPLET} strokeWidth="1.5" />
    <rect x="13" y="1" width="6" height="30" fill="none" stroke={C_DROPLET} strokeWidth="1.5" />
    <circle cx="16" cy="16" r="4" fill={C_DROPLET} opacity="0.8" />
  </svg>
);
const FilterIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32">
    {[8, 16, 24].map(x =>
      [8, 16, 24].map(y => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5" fill={C_FILTER} />
      ))
    )}
  </svg>
);
const ExpansionIcon = () => (
  <svg width="32" height="20" viewBox="0 0 32 20">
    <path d="M1 7 H10 L22 3 H31" fill="none" stroke={C_EXPANSION} strokeWidth="1.5" />
    <path d="M1 13 H10 L22 17 H31" fill="none" stroke={C_EXPANSION} strokeWidth="1.5" />
  </svg>
);
const ReservoirIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32">
    <rect x="3" y="3" width="26" height="26" fill="none" stroke={C_RESERVOIR} strokeWidth="1.5" rx="2" />
    <rect x="7" y="7" width="18" height="18" fill={C_RESERVOIR} opacity="0.2" rx="1" />
  </svg>
);

const CATEGORIES: Category[] = [
  {
    name: 'Kanallar',
    components: [
      { type: 'straight_channel', label: 'Düz Kanal', icon: <ChannelIcon />, description: 'Dikdörtgen kesitli düz kanal' },
      { type: 'curved_channel', label: 'Eğri Kanal', icon: <CurvedIcon />, description: 'Kavisli kanal segmenti' },
      { type: 'serpentine_mixer', label: 'Serpantin Mikser', icon: <MixerIcon />, description: 'Zigzag pasif mikser' },
      { type: 'expansion', label: 'Genişleme/Daralma', icon: <ExpansionIcon />, description: 'Trapez geçiş kanalı' },
    ],
  },
  {
    name: 'Bağlantılar',
    components: [
      { type: 't_junction', label: 'T-Bağlantı', icon: <TIcon />, description: 'T şeklinde üç yollu kavşak' },
      { type: 'y_junction', label: 'Y-Bağlantı', icon: <YIcon />, description: 'Y şeklinde kavşak' },
      { type: 'droplet_generator', label: 'Damla Üreteci', icon: <DropletIcon />, description: 'Cross-junction damla üreteci' },
    ],
  },
  {
    name: 'Filtreler',
    components: [
      { type: 'filter_array', label: 'Filtre Dizisi', icon: <FilterIcon />, description: 'Pillar array filtresi' },
    ],
  },
  {
    name: 'Portlar & Rezervuarlar',
    components: [
      { type: 'port', label: 'Giriş Portu', icon: <PortIcon type="inlet" />, description: 'Sıvı giriş noktası', portType: 'inlet' },
      { type: 'port', label: 'Çıkış Portu', icon: <PortIcon type="outlet" />, description: 'Sıvı çıkış noktası', portType: 'outlet' },
      { type: 'reservoir', label: 'Rezervuar', icon: <ReservoirIcon />, description: 'Büyük sıvı deposu' },
    ],
  },
];

interface SidebarProps {
  width: number;
}

const Sidebar: React.FC<SidebarProps> = ({ width }) => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(CATEGORIES.map((c) => c.name))
  );
  const [search, setSearch] = useState('');

  const toggleCategory = (name: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const filtered = search.trim()
    ? CATEGORIES.map((cat) => ({
        ...cat,
        components: cat.components.filter(
          (c) =>
            c.label.toLowerCase().includes(search.toLowerCase()) ||
            c.description.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter((cat) => cat.components.length > 0)
    : CATEGORIES;

  const handleDragStart = (e: React.DragEvent, comp: ComponentDef) => {
    e.dataTransfer.setData('application/microflow-component', JSON.stringify({
      type: comp.type,
      label: comp.label,
      portType: comp.portType, // 'port' için inlet/outlet ayrımını taşı
    }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div
      className="flex flex-col bg-mf-surface border-r border-mf-border overflow-hidden"
      style={{ width }}
    >
      {/* Başlık */}
      <div className="panel-header">
        <span>Bileşenler</span>
        <span className="text-mf-text-dark normal-case font-mono text-2xs">
          {CATEGORIES.reduce((s, c) => s + c.components.length, 0)}
        </span>
      </div>

      {/* Arama */}
      <div className="px-2 py-2 border-b border-mf-border">
        <input
          type="text"
          placeholder="Ara — tip / etiket"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mf-input text-xs"
          aria-label="Bileşen ara"
        />
      </div>

      {/* Bileşen listesi */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && search.trim() && (
          <div className="px-3 py-6 text-center">
            <div className="text-xs text-mf-text-dark mb-1">
              "<span className="text-mf-text">{search}</span>" için eşleşme yok
            </div>
            <button
              onClick={() => setSearch('')}
              className="text-[11px] text-mf-blue hover:underline mt-1"
            >
              Aramayı temizle
            </button>
          </div>
        )}
        {filtered.map((category) => (
          <div key={category.name}>
            {/* Kategori başlığı */}
            <button
              className="flex items-center justify-between w-full px-3 py-1.5
                         text-2xs font-semibold text-mf-text-dim uppercase tracking-caps
                         hover:text-mf-text hover:bg-mf-elev transition-colors group/cat"
              onClick={() => toggleCategory(category.name)}
              aria-expanded={expandedCategories.has(category.name)}
            >
              <span className="flex items-center gap-1.5">
                {expandedCategories.has(category.name)
                  ? <FiChevronDown size={10} />
                  : <FiChevronRight size={10} />}
                {category.name}
              </span>
              <span className="text-mf-text-dark font-mono">
                {category.components.length}
              </span>
            </button>

            {/* Bileşen listesi */}
            {expandedCategories.has(category.name) && (
              <div className="pb-1">
                {category.components.map((comp, idx) => (
                  <div
                    key={`${comp.type}-${idx}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, comp)}
                    className="flex items-center gap-2 px-3 py-1.5 mx-1 rounded
                               hover:bg-mf-bg cursor-grab active:cursor-grabbing
                               border border-transparent hover:border-mf-border
                               transition-colors group"
                    title={comp.description}
                  >
                    {/* İkon */}
                    <div className="w-8 h-8 flex items-center justify-center flex-shrink-0 opacity-80 group-hover:opacity-100">
                      {comp.icon}
                    </div>
                    {/* Etiket */}
                    <div className="min-w-0">
                      <div className="text-xs text-mf-text truncate">{comp.label}</div>
                      <div className="text-xs text-mf-text-dark truncate">{comp.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Alt bilgi */}
      <div className="px-3 py-1.5 border-t border-mf-border text-2xs text-mf-text-dark uppercase tracking-caps flex items-center gap-1.5">
        <span className="text-mf-text-dark">↗</span>
        Sürükle → canvas
      </div>
    </div>
  );
};

export default Sidebar;
