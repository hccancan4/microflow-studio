/**
 * AssistantPanel — ✦ Asistan: doğal dilden mf.* Lua üreten copilot sohbeti.
 *
 * Akış: komut → completeWithFallback (Claude backend'de; hata/timeout →
 * LocalRuleProvider) → ```lua bloğu çıkar → Script sekmesine yaz →
 * (onaylıysa) çalıştır → canvas + Doğrulama sekmesi. Anahtar yalnız
 * backend'e gönderilir; panel sadece {has_key, source} görür.
 */
import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import clsx from 'clsx';
import {
  FiSend,
  FiSettings,
  FiPlay,
  FiCheck,
  FiLoader,
  FiKey,
  FiTrash2,
  FiCpu,
} from 'react-icons/fi';
import { useProjectStore } from '../../stores/useProjectStore';
import { toast } from '../../stores/useUiStore';
import { completeWithFallback } from './providers';
import { SYSTEM_PROMPT_TR } from './systemPrompt';
import { extractLuaBlocks, stripLuaBlocks } from './luaExtract';
import { buildRepairMessage, repairBadge, MAX_REPAIR_ROUNDS } from './selfRepair';
import { toLlmMessages } from './llmHistory';
import type { ScriptRunOutcome } from '../../hooks/useScriptRun';
import {
  useAssistantStore,
  nextMsgId,
  MODELS,
  type AssistantMsg,
  type LlmStatusInfo,
  type ProviderId,
  type ProviderStatusInfo,
} from './useAssistantStore';

/** Backend `llm_status` ham şekli (snake_case). */
interface RawProviderStatus {
  has_key: boolean;
  source: string;
  model: string;
  base_url?: string;
  timeout_secs?: number;
}
interface RawLlmStatus {
  active_provider: string;
  anthropic: RawProviderStatus;
  openai: RawProviderStatus;
}

function mapStatus(raw: RawLlmStatus): LlmStatusInfo {
  const map = (p: RawProviderStatus): ProviderStatusInfo => ({
    hasKey: p.has_key,
    source: p.source as ProviderStatusInfo['source'],
    model: p.model,
    baseUrl: p.base_url,
    timeoutSecs: p.timeout_secs,
  });
  return {
    activeProvider: raw.active_provider === 'openai' ? 'openai' : 'anthropic',
    anthropic: map(raw.anthropic),
    openai: map(raw.openai),
  };
}

const EXAMPLE_CHIPS = [
  '10 mbar 2:1:1 bölücü su',
  '4 çıkış eşit, 20 mbar, pbs',
  '2:1 bölücü gliserol',
];

interface Props {
  runScript: (code?: string) => Promise<ScriptRunOutcome>;
}

const AssistantPanel: React.FC<Props> = ({ runScript }) => {
  const {
    messages,
    sending,
    providerId,
    model,
    confirmBeforeRun,
    status,
    addMessage,
    markApplied,
    setSending,
    setProviderId,
    setModel,
    setConfirmBeforeRun,
    setStatus,
    clearChat,
  } = useAssistantStore();

  const [input, setInput] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  // OpenAI-uyumlu sağlayıcı form alanları (backend config'e kaydedilir)
  const [baseUrlInput, setBaseUrlInput] = useState('');
  const [openaiModelInput, setOpenaiModelInput] = useState('');
  const [timeoutInput, setTimeoutInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sağlayıcı/anahtar durumunu yükle (panel ilk açıldığında)
  useEffect(() => {
    invoke<RawLlmStatus>('llm_status')
      .then((raw) => {
        const s = mapStatus(raw);
        setStatus(s);
        setProviderId(s.activeProvider);
        setBaseUrlInput(s.openai.baseUrl ?? '');
        setOpenaiModelInput(s.openai.model);
        setTimeoutInput(String(s.openai.timeoutSecs ?? 60));
      })
      .catch(() => setStatus(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Yeni mesajda en alta kaydır
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, sending]);

  /**
   * Lua'yı çalıştır; BAŞARISIZSA hata mesajını LM'e geri besleyip onarım
   * turu başlat (maks MAX_REPAIR_ROUNDS; yerel kural motoru kendini
   * onaramaz). Onarım yanıtı da onay akışına saygı duyar — confirmBeforeRun
   * açıkken sürpriz koşu olmaz.
   */
  const applyLua = async (msg: AssistantMsg) => {
    if (!msg.lua) return;
    useProjectStore.getState().setScriptContent(msg.lua);
    const outcome = await runScript(msg.lua);
    if (outcome.success) {
      markApplied(msg.id);
      toast.success('Tasarıma uygulandı — Script sekmesinde düzenlenebilir');
      return;
    }
    const error = outcome.error ?? 'bilinmeyen script hatası';
    const round = (msg.repairRound ?? 0) + 1;
    if (msg.provider === 'local' || round > MAX_REPAIR_ROUNDS) {
      addMessage({
        id: nextMsgId(),
        role: 'note',
        text:
          round > MAX_REPAIR_ROUNDS
            ? `Onarım ${MAX_REPAIR_ROUNDS} turda başaramadı — script'i elle düzenleyin. Son hata: ${error}`
            : `Script hatası: ${error}`,
      });
      return;
    }
    await requestRepair(msg.lua, error, round);
  };

  /** Onarım turu: hatayı + bozuk Lua'yı LM'e gönder, düzeltilmiş yanıtı işle. */
  const requestRepair = async (failedLua: string, error: string, round: number) => {
    addMessage({
      id: nextMsgId(),
      role: 'note',
      text: `${repairBadge(round)} — hata: ${error.slice(0, 160)}`,
    });
    setSending(true);
    try {
      const history = toLlmMessages(useAssistantStore.getState().messages);
      history.push({ role: 'user', content: buildRepairMessage(failedLua, error) });
      const res = await completeWithFallback(
        {
          model: providerId === 'anthropic' ? model : '',
          system: SYSTEM_PROMPT_TR,
          messages: history,
        },
        providerId,
      );
      const blocks = extractLuaBlocks(res.text);
      const lua = blocks.length > 0 ? blocks.join('\n\n') : undefined;
      const aMsg: AssistantMsg = {
        id: nextMsgId(),
        role: 'assistant',
        text: stripLuaBlocks(res.text) || (lua ? `Onarım denemesi ${round}:` : res.text),
        lua,
        provider: res.provider,
        note: res.fallbackNote,
        repairRound: round,
      };
      addMessage(aMsg);
      if (lua && res.provider !== 'local') {
        useProjectStore.getState().setScriptContent(lua);
        if (!confirmBeforeRun) {
          await applyLua(aMsg); // başarısızsa zincir bir sonraki tura geçer
        }
      }
    } catch (err) {
      addMessage({ id: nextMsgId(), role: 'note', text: `Onarım isteği başarısız: ${err}` });
    } finally {
      setSending(false);
    }
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setInput('');
    const userMsg: AssistantMsg = { id: nextMsgId(), role: 'user', text: trimmed };
    addMessage(userMsg);
    setSending(true);
    try {
      // Geçmişi LM formatına çevir (lua blokları geri eklenir, note'lar
      // "[sistem]" user mesajına dönüşür — bkz. llmHistory.ts)
      const history = toLlmMessages(useAssistantStore.getState().messages);
      // anthropic: panel model seçimi; openai: backend config'teki model ('' → backend çözer)
      const res = await completeWithFallback(
        {
          model: providerId === 'anthropic' ? model : '',
          system: SYSTEM_PROMPT_TR,
          messages: history,
        },
        providerId,
      );
      const blocks = extractLuaBlocks(res.text);
      const lua = blocks.length > 0 ? blocks.join('\n\n') : undefined;
      const aMsg: AssistantMsg = {
        id: nextMsgId(),
        role: 'assistant',
        text: stripLuaBlocks(res.text) || (lua ? 'Tasarım hazır:' : res.text),
        lua,
        provider: res.provider,
        note: res.fallbackNote,
      };
      addMessage(aMsg);
      if (lua) {
        useProjectStore.getState().setScriptContent(lua);
        if (!confirmBeforeRun) {
          await applyLua(aMsg); // başarısızsa self-repair zinciri devreye girer
        }
      }
    } catch (err) {
      addMessage({
        id: nextMsgId(),
        role: 'assistant',
        text: `Bir hata oluştu: ${err}`,
      });
    } finally {
      setSending(false);
    }
  };

  const saveSettings = async () => {
    try {
      const args =
        providerId === 'openai'
          ? {
              provider: 'openai',
              key: keyInput.length > 0 ? keyInput : null,
              model: openaiModelInput.trim() || null,
              baseUrl: baseUrlInput.trim() || null,
              timeoutSecs: Number.parseInt(timeoutInput, 10) || null,
              activeProvider: providerId,
            }
          : {
              provider: 'anthropic',
              key: keyInput.length > 0 ? keyInput : null,
              model,
              activeProvider: providerId,
            };
      const raw = await invoke<RawLlmStatus>('save_llm_settings', args);
      setStatus(mapStatus(raw));
      setKeyInput('');
      toast.success('Asistan ayarları kaydedildi');
    } catch (err) {
      toast.error(`Ayar kaydedilemedi: ${err}`);
    }
  };

  /** Sağlayıcı değişimi anında backend'e de yazılır (kalıcı). */
  const switchProvider = async (p: ProviderId) => {
    setProviderId(p);
    try {
      const raw = await invoke<RawLlmStatus>('save_llm_settings', {
        provider: p,
        activeProvider: p,
      });
      setStatus(mapStatus(raw));
    } catch {
      /* durum yenilenemese de UI seçimi geçerli — complete çağrısı provider'ı açıkça geçer */
    }
  };

  // Durum rozeti — sağlayıcıya göre: openai'de anahtarsızlık NORMALDİR (lokal sunucu)
  const active: ProviderStatusInfo | null =
    status === null ? null : providerId === 'openai' ? status.openai : status.anthropic;
  const keyBadge = (() => {
    if (active === null) return { text: '...', cls: 'text-mf-text-dark' };
    if (providerId === 'openai') {
      const host = (active.baseUrl ?? '').replace(/^https?:\/\//, '');
      return active.hasKey
        ? { text: `openai · ${host} · anahtarlı`, cls: 'text-mf-green' }
        : { text: `openai · ${host} · anahtarsız (lokal)`, cls: 'text-mf-green' };
    }
    return active.hasKey
      ? {
          text: active.source === 'env' ? 'Claude · ortam değişkeni' : 'Claude · yapılandırma',
          cls: 'text-mf-green',
        }
      : { text: 'Claude anahtarı yok — yerel kural modu', cls: 'text-mf-orange' };
  })();

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Durum + ayar çubuğu */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-mf-border flex-shrink-0">
        <span className={clsx('flex items-center gap-1 text-2xs', keyBadge.cls)}>
          <FiKey size={10} />
          {keyBadge.text}
        </span>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="p-1 text-mf-text-dark hover:text-mf-red transition-colors"
              title="Sohbeti temizle"
            >
              <FiTrash2 size={12} />
            </button>
          )}
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className={clsx(
              'p-1 transition-colors',
              settingsOpen ? 'text-mf-blue' : 'text-mf-text-dark hover:text-mf-text',
            )}
            title="Asistan ayarları"
          >
            <FiSettings size={12} />
          </button>
        </div>
      </div>

      {/* Ayarlar */}
      {settingsOpen && (
        <div className="px-3 py-2 border-b border-mf-border space-y-2 flex-shrink-0 bg-mf-bg/50">
          {/* Sağlayıcı seçimi */}
          <div>
            <label className="text-2xs text-mf-text-dim uppercase tracking-caps block mb-1">
              Sağlayıcı
            </label>
            <div className="flex gap-0 bg-mf-bg border border-mf-border rounded-sm overflow-hidden">
              {(
                [
                  ['anthropic', 'Claude API'],
                  ['openai', 'OpenAI-uyumlu (lokal/uzak)'],
                ] as [ProviderId, string][]
              ).map(([id, label], i) => (
                <button
                  key={id}
                  onClick={() => void switchProvider(id)}
                  className={clsx(
                    'flex-1 py-1 text-2xs font-semibold transition-colors',
                    i > 0 && 'border-l border-mf-border',
                    providerId === id
                      ? 'bg-mf-blue/15 text-mf-blue'
                      : 'text-mf-text-dim hover:text-mf-text hover:bg-mf-elev',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {providerId === 'anthropic' ? (
            <>
              <div>
                <label className="text-2xs text-mf-text-dim uppercase tracking-caps block mb-1">
                  Model
                </label>
                <select
                  className="mf-input text-xs"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-2xs text-mf-text-dim uppercase tracking-caps block mb-1">
                  Anthropic API Anahtarı
                </label>
                <input
                  type="password"
                  className="mf-input text-xs"
                  placeholder="sk-ant-..."
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  autoComplete="off"
                />
                <div className="text-2xs text-mf-text-dark mt-1 leading-snug">
                  Anahtar yalnız backend'de saklanır; ANTHROPIC_API_KEY ortam değişkeni
                  önceliklidir.
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-2xs text-mf-text-dim uppercase tracking-caps block mb-1">
                  Sunucu Adresi (base URL)
                </label>
                <input
                  type="text"
                  className="mf-input text-xs font-mono"
                  placeholder="http://localhost:11434/v1  (Ollama)"
                  value={baseUrlInput}
                  onChange={(e) => setBaseUrlInput(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="grid grid-cols-[1fr_72px] gap-1.5">
                <div>
                  <label className="text-2xs text-mf-text-dim uppercase tracking-caps block mb-1">
                    Model Adı
                  </label>
                  <input
                    type="text"
                    className="mf-input text-xs font-mono"
                    placeholder="qwen2.5:14b · gemma3:12b · fine-tune adınız"
                    value={openaiModelInput}
                    onChange={(e) => setOpenaiModelInput(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="text-2xs text-mf-text-dim uppercase tracking-caps block mb-1">
                    Süre (sn)
                  </label>
                  <input
                    type="number"
                    className="mf-input text-xs font-mono"
                    min={5}
                    max={600}
                    value={timeoutInput}
                    onChange={(e) => setTimeoutInput(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="text-2xs text-mf-text-dim uppercase tracking-caps block mb-1">
                  API Anahtarı (opsiyonel — lokal sunucularda gerekmez)
                </label>
                <input
                  type="password"
                  className="mf-input text-xs"
                  placeholder="boş bırakılabilir"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  autoComplete="off"
                />
                <div className="text-2xs text-mf-text-dark mt-1 leading-snug">
                  Ollama / LM Studio / vLLM ve fine-tune modeliniz bu protokolü konuşur;
                  OPENAI_API_KEY ortam değişkeni önceliklidir.
                </div>
              </div>
            </>
          )}

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-mf-text-dim cursor-pointer">
              <input
                type="checkbox"
                checked={confirmBeforeRun}
                onChange={(e) => setConfirmBeforeRun(e.target.checked)}
              />
              Çalıştırmadan önce onayla
            </label>
            <button
              onClick={saveSettings}
              className="px-2.5 py-1 text-xs rounded border border-mf-blue/40 text-mf-blue hover:bg-mf-blue/10"
            >
              Kaydet
            </button>
          </div>
        </div>
      )}

      {/* Mesajlar */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2">
        {messages.length === 0 && (
          <div className="text-center py-6 space-y-2">
            <FiCpu size={22} className="mx-auto text-mf-text-dark opacity-40" />
            <div className="text-xs text-mf-text-dim leading-relaxed">
              Doğal dille devre tarif edin — mf.* Lua üretilir, çalıştırılır ve Script sekmesine
              yazılır.
            </div>
            <div className="flex flex-wrap gap-1.5 justify-center pt-1">
              {EXAMPLE_CHIPS.map((c) => (
                <button
                  key={c}
                  onClick={() => void send(c)}
                  className="px-2 py-1 text-2xs rounded-full border border-mf-border text-mf-text-dim hover:border-mf-blue hover:text-mf-blue transition-colors"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) =>
          m.role === 'note' ? (
            // Sistem kaydı (onarım/simülasyon notu) — soluk, ortalanmış satır
            <div
              key={m.id}
              className="text-2xs text-mf-text-dark text-center px-2 py-0.5 leading-snug"
            >
              {m.text}
            </div>
          ) : (
            <div
              key={m.id}
              className={clsx(
                'rounded-ds-sm px-2.5 py-2 text-xs leading-relaxed',
                m.role === 'user'
                  ? 'bg-mf-blue/10 border border-mf-blue/20 text-mf-text ml-6'
                  : 'bg-mf-bg border border-mf-border text-mf-text mr-2',
              )}
            >
              {m.note && <div className="text-2xs text-mf-orange mb-1">{m.note}</div>}
              <div className="whitespace-pre-wrap break-words">{m.text}</div>
              {m.lua && (
                <div className="mt-2 space-y-1.5">
                  <pre className="text-2xs font-mono bg-mf-panel border border-mf-border rounded p-2 max-h-40 overflow-auto whitespace-pre">
                    {m.lua}
                  </pre>
                  <div className="flex items-center gap-2">
                    {m.applied ? (
                      <span className="flex items-center gap-1 text-2xs text-mf-green">
                        <FiCheck size={11} /> tasarıma uygulandı
                      </span>
                    ) : (
                      <button
                        onClick={() => void applyLua(m)}
                        className="flex items-center gap-1 px-2 py-0.5 text-2xs rounded border border-mf-orange/50 text-mf-orange hover:bg-mf-orange/10"
                      >
                        <FiPlay size={10} /> Çalıştır
                      </button>
                    )}
                    {m.provider === 'local' && (
                      <span className="text-2xs text-mf-text-dark">yerel kural motoru</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ),
        )}

        {sending && (
          <div className="flex items-center gap-2 text-xs text-mf-text-dim px-1">
            <FiLoader size={12} className="animate-spin" /> yanıt bekleniyor… (≤
            {providerId === 'openai' ? (active?.timeoutSecs ?? 60) : 14} sn, sonra yerel motor)
          </div>
        )}
      </div>

      {/* Girdi */}
      <div className="px-3 py-2 border-t border-mf-border flex-shrink-0">
        <div className="flex gap-1.5">
          <textarea
            className="mf-input text-xs flex-1 resize-none"
            rows={2}
            placeholder='Örn: "10 mbar 2:1:1 bölücü su"'
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            disabled={sending}
          />
          <button
            onClick={() => void send(input)}
            disabled={sending || input.trim().length === 0}
            className="self-end px-2.5 py-2 rounded-sm bg-mf-orange text-white hover:bg-orange-500 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title="Gönder (Enter)"
          >
            <FiSend size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssistantPanel;
