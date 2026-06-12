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
import {
  useAssistantStore,
  nextMsgId,
  MODELS,
  type AssistantMsg,
  type LlmStatusInfo,
} from './useAssistantStore';

const EXAMPLE_CHIPS = [
  '10 mbar 2:1:1 bölücü su',
  '4 çıkış eşit, 20 mbar, pbs',
  '2:1 bölücü gliserol',
];

interface Props {
  runScript: (code?: string) => Promise<void>;
}

const AssistantPanel: React.FC<Props> = ({ runScript }) => {
  const {
    messages,
    sending,
    model,
    confirmBeforeRun,
    status,
    addMessage,
    markApplied,
    setSending,
    setModel,
    setConfirmBeforeRun,
    setStatus,
    clearChat,
  } = useAssistantStore();

  const [input, setInput] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Anahtar/model durumunu yükle (panel ilk açıldığında)
  useEffect(() => {
    invoke<{ has_key: boolean; source: string; model: string }>('llm_status')
      .then((s) =>
        setStatus({
          hasKey: s.has_key,
          source: s.source as LlmStatusInfo['source'],
          model: s.model,
        }),
      )
      .catch(() => setStatus({ hasKey: false, source: 'none', model }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Yeni mesajda en alta kaydır
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, sending]);

  const applyLua = async (msg: AssistantMsg) => {
    if (!msg.lua) return;
    useProjectStore.getState().setScriptContent(msg.lua);
    await runScript(msg.lua);
    markApplied(msg.id);
    toast.success('Tasarıma uygulandı — Script sekmesinde düzenlenebilir');
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setInput('');
    const userMsg: AssistantMsg = { id: nextMsgId(), role: 'user', text: trimmed };
    addMessage(userMsg);
    setSending(true);
    try {
      // Geçmişi LM formatına çevir (asistan yanıtlarına lua bloklarını geri koy)
      const history = [...useAssistantStore.getState().messages].map((m) => ({
        role: m.role,
        content: m.lua ? `${m.text}\n\`\`\`lua\n${m.lua}\n\`\`\`` : m.text,
      }));
      const res = await completeWithFallback({
        model,
        system: SYSTEM_PROMPT_TR,
        messages: history,
      });
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
          await runScript(lua);
          markApplied(aMsg.id);
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
      const s = await invoke<{ has_key: boolean; source: string; model: string }>(
        'save_llm_settings',
        { key: keyInput.length > 0 ? keyInput : null, model },
      );
      setStatus({
        hasKey: s.has_key,
        source: s.source as LlmStatusInfo['source'],
        model: s.model,
      });
      setKeyInput('');
      toast.success('Asistan ayarları kaydedildi');
    } catch (err) {
      toast.error(`Ayar kaydedilemedi: ${err}`);
    }
  };

  const keyBadge =
    status === null
      ? { text: '...', cls: 'text-mf-text-dark' }
      : status.hasKey
        ? {
            text: status.source === 'env' ? 'Anahtar: ortam değişkeni' : 'Anahtar: yapılandırma',
            cls: 'text-mf-green',
          }
        : { text: 'Anahtar yok — yerel kural modu', cls: 'text-mf-orange' };

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
            <div className="flex gap-1">
              <input
                type="password"
                className="mf-input text-xs flex-1"
                placeholder="sk-ant-..."
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                autoComplete="off"
              />
              <button
                onClick={saveSettings}
                className="px-2 py-1 text-xs rounded border border-mf-blue/40 text-mf-blue hover:bg-mf-blue/10"
              >
                Kaydet
              </button>
            </div>
            <div className="text-2xs text-mf-text-dark mt-1 leading-snug">
              Anahtar yalnız backend'de saklanır; ANTHROPIC_API_KEY ortam değişkeni önceliklidir.
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-mf-text-dim cursor-pointer">
            <input
              type="checkbox"
              checked={confirmBeforeRun}
              onChange={(e) => setConfirmBeforeRun(e.target.checked)}
            />
            Çalıştırmadan önce onayla
          </label>
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

        {messages.map((m) => (
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
        ))}

        {sending && (
          <div className="flex items-center gap-2 text-xs text-mf-text-dim px-1">
            <FiLoader size={12} className="animate-spin" /> yanıt bekleniyor… (≤14 sn, sonra yerel
            motor)
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
