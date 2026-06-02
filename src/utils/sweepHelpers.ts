/**
 * sweepHelpers — Parametre tarama yardımcıları (Faz 6B).
 *
 * Her bileşen tipi için süpürülebilir numerik parametrelerin anahtarları,
 * kullanıcıya gösterilecek Türkçe etiketleri ve birimleri burada tanımlıdır.
 * Seçenek dropdown'u ve SweepDialog preview için bu listeden beslenir.
 */
import type { ChipComponent, ComponentType } from '../types';

export interface ParamOption {
  key: string;
  label: string;
  unit: string;
  /** Güvenli minimum değer (pozitiflik vb.). */
  min: number;
  /** Önerilen maksimum (slider sınırı; kullanıcı elle geçebilir). */
  maxHint: number;
}

const PARAM_OPTIONS: Record<ComponentType, ParamOption[]> = {
  straight_channel: [
    { key: 'width',  label: 'Kanal genişliği', unit: 'μm', min: 1, maxHint: 2000 },
    { key: 'length', label: 'Kanal uzunluğu',  unit: 'μm', min: 1, maxHint: 20000 },
    { key: 'depth',  label: 'Kanal derinliği', unit: 'μm', min: 1, maxHint: 500 },
  ],
  curved_channel: [
    { key: 'radius', label: 'Yarıçap',         unit: 'μm', min: 10, maxHint: 5000 },
    { key: 'angle',  label: 'Açı',             unit: '°',  min: 1,  maxHint: 360 },
    { key: 'width',  label: 'Kanal genişliği', unit: 'μm', min: 1,  maxHint: 2000 },
    { key: 'depth',  label: 'Kanal derinliği', unit: 'μm', min: 1,  maxHint: 500 },
  ],
  t_junction: [
    { key: 'mainWidth',   label: 'Ana kanal genişliği',  unit: 'μm', min: 1, maxHint: 2000 },
    { key: 'branchWidth', label: 'Dal kanal genişliği',  unit: 'μm', min: 1, maxHint: 2000 },
    { key: 'angle',       label: 'Açı',                  unit: '°',  min: 1, maxHint: 180 },
    { key: 'depth',       label: 'Derinlik',             unit: 'μm', min: 1, maxHint: 500 },
  ],
  y_junction: [
    { key: 'mainWidth',   label: 'Ana kanal genişliği', unit: 'μm', min: 1, maxHint: 2000 },
    { key: 'branchWidth', label: 'Dal kanal genişliği', unit: 'μm', min: 1, maxHint: 2000 },
    { key: 'branchAngle', label: 'Dal açısı',           unit: '°',  min: 1, maxHint: 180 },
    { key: 'depth',       label: 'Derinlik',            unit: 'μm', min: 1, maxHint: 500 },
  ],
  serpentine_mixer: [
    { key: 'channelWidth', label: 'Kanal genişliği', unit: 'μm', min: 1, maxHint: 2000 },
    { key: 'turns',        label: 'Dönüş sayısı',    unit: '',   min: 1, maxHint: 30 },
    { key: 'pitch',        label: 'Adım',            unit: 'μm', min: 10, maxHint: 5000 },
    { key: 'depth',        label: 'Derinlik',        unit: 'μm', min: 1, maxHint: 500 },
  ],
  port: [
    { key: 'diameter', label: 'Çap', unit: 'μm', min: 50, maxHint: 3000 },
  ],
  droplet_generator: [
    { key: 'orificeWidth',          label: 'Orifis genişliği',        unit: 'μm', min: 1, maxHint: 500 },
    { key: 'mainChannelWidth',      label: 'Ana kanal genişliği',     unit: 'μm', min: 1, maxHint: 2000 },
    { key: 'dispersedChannelWidth', label: 'Dispers kanal genişliği', unit: 'μm', min: 1, maxHint: 2000 },
    { key: 'depth',                 label: 'Derinlik',                unit: 'μm', min: 1, maxHint: 500 },
  ],
  filter_array: [
    { key: 'pillarDiameter', label: 'Pilar çapı',  unit: 'μm', min: 1, maxHint: 500 },
    { key: 'spacing',        label: 'Aralık',      unit: 'μm', min: 1, maxHint: 500 },
    { key: 'rows',           label: 'Sıra sayısı', unit: '',   min: 1, maxHint: 50 },
    { key: 'columns',        label: 'Sütun sayısı',unit: '',   min: 1, maxHint: 50 },
    { key: 'depth',          label: 'Derinlik',    unit: 'μm', min: 1, maxHint: 500 },
  ],
  expansion: [
    { key: 'inletWidth',  label: 'Giriş genişliği', unit: 'μm', min: 1, maxHint: 2000 },
    { key: 'outletWidth', label: 'Çıkış genişliği', unit: 'μm', min: 1, maxHint: 2000 },
    { key: 'length',      label: 'Uzunluk',         unit: 'μm', min: 1, maxHint: 20000 },
    { key: 'depth',       label: 'Derinlik',        unit: 'μm', min: 1, maxHint: 500 },
  ],
  reservoir: [
    { key: 'width',  label: 'Genişlik',   unit: 'μm', min: 10, maxHint: 10000 },
    { key: 'height', label: 'Yükseklik',  unit: 'μm', min: 10, maxHint: 10000 },
    { key: 'depth',  label: 'Derinlik',   unit: 'μm', min: 1,  maxHint: 500 },
  ],
};

export function getSweepableParams(type: ComponentType): ParamOption[] {
  return PARAM_OPTIONS[type] ?? [];
}

export function getParamOption(type: ComponentType, key: string): ParamOption | undefined {
  return getSweepableParams(type).find((p) => p.key === key);
}

/** Türkçe bileşen etiketi — dialog'da dropdown label olarak. */
const TYPE_LABEL: Record<ComponentType, string> = {
  straight_channel: 'Düz Kanal',
  curved_channel: 'Eğri Kanal',
  t_junction: 'T-Birleşim',
  y_junction: 'Y-Birleşim',
  serpentine_mixer: 'Serpentin Mikser',
  port: 'Port',
  droplet_generator: 'Damlacık Üretici',
  filter_array: 'Filtre Dizisi',
  expansion: 'Genleşme',
  reservoir: 'Rezervuar',
};

export function componentDisplayLabel(c: ChipComponent, index: number): string {
  const base = c.label?.trim() || TYPE_LABEL[c.type];
  return `${base} #${index + 1}`;
}

/** Bileşen kopyasında bir param anahtarını yeni değerle üzerine yaz. */
export function withOverriddenParam(c: ChipComponent, key: string, value: number): ChipComponent {
  return {
    ...c,
    params: { ...(c.params as unknown as Record<string, unknown>), [key]: value } as unknown as ChipComponent['params'],
  };
}
