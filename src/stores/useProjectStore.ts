import { create } from 'zustand';
import type { ProjectMetadata, ActiveTab } from '../types';

interface ProjectState {
  metadata: ProjectMetadata;
  filePath: string | null; // mevcut .mflow dosyası yolu
  isDirty: boolean; // kaydedilmemiş değişiklik var mı
  recentFiles: string[];
  activeTab: ActiveTab;

  // Panel durumları
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  bottomPanelOpen: boolean;
  leftPanelWidth: number;
  rightPanelWidth: number;
  bottomPanelHeight: number;
  /** Sağ dock sekmesi: Özellikler | ✦ Asistan */
  rightPanelTab: 'properties' | 'assistant';

  // Script içeriği
  scriptContent: string;

  // Eylemler
  setMetadata: (metadata: Partial<ProjectMetadata>) => void;
  setFilePath: (path: string | null) => void;
  setDirty: (dirty: boolean) => void;
  addRecentFile: (path: string) => void;
  setActiveTab: (tab: ActiveTab) => void;

  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  toggleBottomPanel: () => void;
  setLeftPanelWidth: (width: number) => void;
  setRightPanelWidth: (width: number) => void;
  setBottomPanelHeight: (height: number) => void;
  setRightPanelTab: (tab: 'properties' | 'assistant') => void;

  setScriptContent: (content: string) => void;
  newProject: () => void;
}

const DEFAULT_METADATA: ProjectMetadata = {
  name: 'Yeni Proje',
  author: '',
  created: new Date().toISOString(),
  modified: new Date().toISOString(),
  description: '',
  tags: [],
};

const DEFAULT_SCRIPT = `-- MicroFlow Studio Lua Scripti
-- Çip tasarımınızı buradan programlayabilirsiniz

local chip = Chip.new("Yeni Çip", {width = 30000, height = 20000})

-- Giriş ve çıkış portları
local inlet = chip:add_port({x = 500, y = 10000, type = "inlet", diameter = 500})
local outlet = chip:add_port({x = 29500, y = 10000, type = "outlet", diameter = 500})

-- Düz kanal
local channel = chip:add_channel({
    x1 = 500, y1 = 10000,
    x2 = 29500, y2 = 10000,
    width = 200,
    depth = 50
})

-- Bağlantılar
chip:connect(inlet, channel.input)
chip:connect(channel.output, outlet)

return chip
`;

export const useProjectStore = create<ProjectState>()((set) => ({
  metadata: DEFAULT_METADATA,
  filePath: null,
  isDirty: false,
  recentFiles: [],
  activeTab: 'canvas',

  leftPanelOpen: true,
  rightPanelOpen: true,
  bottomPanelOpen: true,
  leftPanelWidth: 240,
  rightPanelWidth: 280,
  bottomPanelHeight: 220,
  rightPanelTab: 'properties',

  scriptContent: DEFAULT_SCRIPT,

  setMetadata: (metadata) =>
    set((state) => ({
      metadata: { ...state.metadata, ...metadata, modified: new Date().toISOString() },
      isDirty: true,
    })),

  setFilePath: (path) => set({ filePath: path }),

  setDirty: (dirty) => set({ isDirty: dirty }),

  addRecentFile: (path) =>
    set((state) => ({
      recentFiles: [path, ...state.recentFiles.filter((f) => f !== path)].slice(0, 10),
    })),

  setActiveTab: (tab) => set({ activeTab: tab }),

  toggleLeftPanel: () => set((state) => ({ leftPanelOpen: !state.leftPanelOpen })),
  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
  toggleBottomPanel: () => set((state) => ({ bottomPanelOpen: !state.bottomPanelOpen })),

  setLeftPanelWidth: (width) => set({ leftPanelWidth: width }),
  setRightPanelWidth: (width) => set({ rightPanelWidth: width }),
  setBottomPanelHeight: (height) => set({ bottomPanelHeight: height }),
  setRightPanelTab: (rightPanelTab) => set({ rightPanelTab }),

  setScriptContent: (content) => set({ scriptContent: content, isDirty: true }),

  newProject: () =>
    set({
      metadata: { ...DEFAULT_METADATA, created: new Date().toISOString() },
      filePath: null,
      isDirty: false,
      activeTab: 'canvas',
      scriptContent: DEFAULT_SCRIPT,
    }),
}));
