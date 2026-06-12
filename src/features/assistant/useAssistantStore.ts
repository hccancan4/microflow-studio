/**
 * useAssistantStore — ✦ Asistan paneli sohbet/ayar state'i.
 * Anahtarın kendisi ASLA burada tutulmaz; yalnız backend'in bildirdiği
 * {has_key, source} durumu yansıtılır.
 */
import { create } from 'zustand';

export interface AssistantMsg {
  id: string;
  /** 'note': sistem kaydı (simülasyon sonucu, onarım bildirimi) — LM'e
   *  "[sistem]" önekli user mesajı olarak gider (bkz. llmHistory.ts). */
  role: 'user' | 'assistant' | 'note';
  /** Lua blokları çıkarılmış düz metin (gerekçe/yanıt). */
  text: string;
  /** Yanıttan çıkarılan çalıştırılabilir mf.* Lua (varsa). */
  lua?: string;
  /** Yanıtı üreten sağlayıcı ('anthropic' | 'openai' | 'local'). */
  provider?: string;
  /** Fallback bilgi notu (uzak sağlayıcıya ulaşılamadıysa). */
  note?: string;
  /** Lua çalıştırıldı mı (rozet için). */
  applied?: boolean;
  /** Bu yanıt kaçıncı onarım denemesi (self-repair zinciri). */
  repairRound?: number;
}

export type ProviderId = 'anthropic' | 'openai';

export interface ProviderStatusInfo {
  hasKey: boolean;
  source: 'env' | 'config' | 'none';
  model: string;
  baseUrl?: string;
  timeoutSecs?: number;
}

/** Backend `llm_status` dönüşünün frontend yansıması (anahtarlar asla gelmez). */
export interface LlmStatusInfo {
  activeProvider: ProviderId;
  anthropic: ProviderStatusInfo;
  openai: ProviderStatusInfo;
}

interface AssistantState {
  messages: AssistantMsg[];
  sending: boolean;
  /** Aktif uzak sağlayıcı (backend active_provider ile senkron). */
  providerId: ProviderId;
  /** Anthropic model seçimi (openai modeli backend config'ten gelir). */
  model: string;
  /** Üretilen Lua çalıştırılmadan önce onay iste (güvenli varsayılan). */
  confirmBeforeRun: boolean;
  status: LlmStatusInfo | null;

  addMessage: (m: AssistantMsg) => void;
  markApplied: (id: string) => void;
  setSending: (v: boolean) => void;
  setProviderId: (p: ProviderId) => void;
  setModel: (m: string) => void;
  setConfirmBeforeRun: (v: boolean) => void;
  setStatus: (s: LlmStatusInfo | null) => void;
  clearChat: () => void;
}

export const MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6 (önerilen)' },
  { id: 'claude-fable-5', label: 'Fable 5 (en güçlü)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 (hızlı)' },
] as const;

let msgCounter = 0;
export const nextMsgId = () => `msg_${Date.now()}_${++msgCounter}`;

export const useAssistantStore = create<AssistantState>()((set) => ({
  messages: [],
  sending: false,
  providerId: 'anthropic',
  model: 'claude-sonnet-4-6',
  confirmBeforeRun: true,
  status: null,

  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  markApplied: (id) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, applied: true } : m)),
    })),
  setSending: (sending) => set({ sending }),
  setProviderId: (providerId) => set({ providerId }),
  setModel: (model) => set({ model }),
  setConfirmBeforeRun: (confirmBeforeRun) => set({ confirmBeforeRun }),
  setStatus: (status) => set({ status }),
  clearChat: () => set({ messages: [] }),
}));
