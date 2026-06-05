/**
 * starters.ts — Boş canvas "Şablondan Başla" başlangıç tasarımları.
 *
 * Her şablon geçerli {components, connections} üretir; bileşenler
 * `getDefaultParams` + `generateId` ile programatik kurulur (elle hex/param
 * hatası riski yok). Empty-state kartları bunları `loadDesign(...)` ile yükler.
 *
 * Port indeks kuralı (portUtils.ts):
 *   - port:            index 0  (inlet → kaynak, outlet → drenaj)
 *   - straight_channel: 0 = giriş (x=0), 1 = çıkış (x=length)
 *   - t_junction:       0 = sol giriş, 1 = sağ çıkış, 2 = dal
 *   - serpentine_mixer: 0 = giriş, 1 = çıkış
 */
import type { ChipComponent, Connection, ComponentType, Point } from '../types';
import { generateId } from '../stores/useDesignStore';
import { getDefaultParams } from '../utils/componentDefaults';

interface StarterResult {
  components: ChipComponent[];
  connections: Connection[];
}
export interface StarterTemplate {
  key: string;
  label: string;
  description: string;
  build: () => StarterResult;
}

function mk(
  type: ComponentType,
  position: Point,
  paramsOverride?: Record<string, unknown>,
): ChipComponent {
  const base = getDefaultParams(type) as unknown as Record<string, unknown>;
  const params = { ...base, ...paramsOverride };
  return {
    id: generateId('comp'),
    type,
    position,
    rotation: 0,
    params: params as unknown as ChipComponent['params'],
    ports: [],
  };
}

function conn(
  from: ChipComponent,
  fromPortIndex: number,
  to: ChipComponent,
  toPortIndex: number,
): Connection {
  return {
    id: generateId('conn'),
    fromComponentId: from.id,
    fromPortIndex,
    toComponentId: to.id,
    toPortIndex,
  };
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    key: 'single-channel',
    label: 'Tek Kanal',
    description: 'Giriş → düz kanal → çıkış',
    build: () => {
      const inlet = mk('port', { x: 600, y: 2000 }, { portType: 'inlet' });
      const ch = mk('straight_channel', { x: 1200, y: 2000 }, { length: 3000 });
      const outlet = mk('port', { x: 4700, y: 2000 }, { portType: 'outlet' });
      return {
        components: [inlet, ch, outlet],
        connections: [conn(inlet, 0, ch, 0), conn(ch, 1, outlet, 0)],
      };
    },
  },
  {
    key: 't-junction',
    label: 'T-Birleşim',
    description: 'İki giriş bir dalda birleşir',
    build: () => {
      const t = mk('t_junction', { x: 2600, y: 2200 });
      const inL = mk('port', { x: 600, y: 2200 }, { portType: 'inlet' });
      const inR = mk('port', { x: 4600, y: 2200 }, { portType: 'inlet' });
      const outlet = mk('port', { x: 2600, y: 600 }, { portType: 'outlet' });
      return {
        components: [t, inL, inR, outlet],
        connections: [conn(inL, 0, t, 0), conn(inR, 0, t, 1), conn(t, 2, outlet, 0)],
      };
    },
  },
  {
    key: 'serpentine',
    label: 'Serpantin Mikser',
    description: 'Giriş → serpantin → çıkış',
    build: () => {
      const inlet = mk('port', { x: 600, y: 1200 }, { portType: 'inlet' });
      const mix = mk('serpentine_mixer', { x: 1200, y: 1200 });
      // Çıkış serpantinin bittiği köşeye (turns=5 tek → sol-alt) yakın
      const outlet = mk('port', { x: 1000, y: 3400 }, { portType: 'outlet' });
      return {
        components: [inlet, mix, outlet],
        connections: [conn(inlet, 0, mix, 0), conn(mix, 1, outlet, 0)],
      };
    },
  },
];
