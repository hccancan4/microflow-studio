/**
 * componentDefaults.ts
 * Her bileşen tipi için varsayılan parametreler ve boyutlar.
 */

import type { ComponentType } from '../types';
import type {
  StraightChannelParams,
  CurvedChannelParams,
  TJunctionParams,
  YJunctionParams,
  SerpentineMixerParams,
  PortParams,
  DropletGeneratorParams,
  FilterArrayParams,
  ExpansionParams,
  ReservoirParams,
} from '../types';

import type { ComponentParams } from '../types';

/**
 * Default'lar viewport'a sığacak şekilde kompakt seçildi.
 * Tipik viewport ~1200×800px @ zoom=1 → 1200×800 μm.
 * Hiçbir bileşen tek başına viewport'un yarısını aşmasın.
 */
export function getDefaultParams(type: ComponentType): ComponentParams {
  switch (type) {
    case 'straight_channel':
      return { width: 200, length: 3000, depth: 50 } as StraightChannelParams;
    case 'curved_channel':
      // radius 1500→800: 90° dönüşte yaklaşık 800×800 μm yer kaplar
      return { radius: 800, angle: 90, width: 200, depth: 50 } as CurvedChannelParams;
    case 't_junction':
      // Önceki (mainWidth*5 = 1500) çok geniş; arm'ı kısalttık (4×)
      return { mainWidth: 250, branchWidth: 200, angle: 90, depth: 50 } as TJunctionParams;
    case 'y_junction':
      return { mainWidth: 250, branchWidth: 200, branchAngle: 45, depth: 50 } as YJunctionParams;
    case 'serpentine_mixer':
      // 6 dönüş × 600 pitch = 4200 μm yükseklik (çok büyük) → 5×400 = 2000 μm
      return { channelWidth: 150, turns: 5, pitch: 400, depth: 50 } as SerpentineMixerParams;
    case 'port':
      return { diameter: 200, portType: 'inlet' } as PortParams;
    case 'droplet_generator':
      // mainChannelWidth*6 = 1800 her yana → çok uzun. Kompakt 1200 μm hedef.
      return {
        orificeWidth: 80,
        mainChannelWidth: 200,
        dispersedChannelWidth: 150,
        depth: 50,
      } as DropletGeneratorParams;
    case 'filter_array':
      return {
        pillarDiameter: 50,
        spacing: 100,
        rows: 5,
        columns: 8,
        depth: 50,
      } as FilterArrayParams;
    case 'expansion':
      return { inletWidth: 150, outletWidth: 400, length: 1200, depth: 50 } as ExpansionParams;
    case 'reservoir':
      return { width: 1500, height: 1500, depth: 500 } as ReservoirParams;
    default:
      return { width: 200, length: 3000, depth: 50 } as StraightChannelParams;
  }
}

/** Bileşen adı → Türkçe etiket */
export function getComponentLabel(type: ComponentType): string {
  const labels: Record<ComponentType, string> = {
    straight_channel: 'Düz Kanal',
    curved_channel: 'Eğri Kanal',
    t_junction: 'T-Bağlantı',
    y_junction: 'Y-Bağlantı',
    serpentine_mixer: 'Serpantin Mikser',
    port: 'Port',
    droplet_generator: 'Damla Üreteci',
    filter_array: 'Filtre Dizisi',
    expansion: 'Genişleme',
    reservoir: 'Rezervuar',
  };
  return labels[type] ?? type;
}
