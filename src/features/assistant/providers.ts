/**
 * providers — sağlayıcı-bağımsız LM katmanı.
 *
 * `ClaudeProvider` → Tauri `llm_complete` (çağrı Rust'ta, anahtar backend'de).
 * `LocalRuleProvider` → Türkçe komutu regex ile ayrıştırır, AYNI
 * `solve_targets` çekirdeğiyle dal uzunluklarını çözer ve mf.* Lua üretir —
 * API yokken/koparken bile doğru hidrolik (µFG'den farkımız).
 * `completeWithFallback` → Claude hata/timeout'unda yerel motora düşer;
 * UI hiçbir durumda bloke olmaz (backend 14 sn çift timeout).
 */
import { invoke } from '@tauri-apps/api/core';
import { FLUID_PRESETS } from '../../stores/useSimulationStore';
import { solveTargets } from '../autodesign/solveTargets';
import { buildAutoDesignLua } from '../autodesign/autoDesignLua';

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  model: string;
  system: string;
  messages: LlmMessage[];
}

export interface LlmProvider {
  readonly name: string;
  complete(req: LlmRequest): Promise<string>;
}

// ─── Claude (backend üzerinden) ─────────────────────────────────────────────

export class ClaudeProvider implements LlmProvider {
  readonly name = 'claude';
  async complete(req: LlmRequest): Promise<string> {
    return invoke<string>('llm_complete', {
      model: req.model,
      system: req.system,
      messages: req.messages,
    });
  }
}

// ─── Yerel kural motoru (fallback) ──────────────────────────────────────────

/** Türkçe komuttan çıkarılan tasarım niyeti. */
export interface ParsedIntent {
  /** Dal hedef debileri (µL/min) — "2:1:1 bölücü" → [2,1,1]; "4 çıkış eşit" → [1,1,1,1] */
  targets: number[];
  /** Giriş basıncı (Pa) — "10 mbar" → 1000; belirtilmemişse null */
  pressurePa: number | null;
  /** FLUID_PRESETS anahtarı — belirtilmemişse null */
  fluidKey: string | null;
}

const RE_RATIO =
  /(\d+(?:[.,]\d+)?)\s*:\s*(\d+(?:[.,]\d+)?)(?:\s*:\s*(\d+(?:[.,]\d+)?))?(?:\s*:\s*(\d+(?:[.,]\d+)?))?\s*(?:böl|bolucu|bölücü)/iu;
const RE_PRESSURE = /(\d+(?:[.,]\d+)?)\s*(mbar|pa)\b/iu;
const RE_EQUAL_N = /(\d+)\s*(?:çıkış|cikis|yol|dal)/iu;
const FLUID_WORDS: Record<string, string> = {
  su: 'water',
  water: 'water',
  pbs: 'pbs',
  plazma: 'plasma',
  plasma: 'plasma',
  etanol: 'etanol',
  gliserol: 'gliserol50',
};

const num = (s: string) => parseFloat(s.replace(',', '.'));

/** Komutu ayrıştır — tasarım niyeti bulunamazsa null. */
export function parseIntent(text: string): ParsedIntent | null {
  const lower = text.toLowerCase();

  let targets: number[] | null = null;
  const ratio = RE_RATIO.exec(lower);
  if (ratio) {
    targets = ratio.slice(1).filter(Boolean).map(num);
  } else if (/(eşit|esit)/.test(lower)) {
    const n = RE_EQUAL_N.exec(lower);
    if (n) targets = Array.from({ length: parseInt(n[1], 10) }, () => 1.0);
  }
  if (!targets || targets.length < 2) return null;

  let pressurePa: number | null = null;
  const p = RE_PRESSURE.exec(lower);
  if (p) pressurePa = p[2].toLowerCase() === 'mbar' ? num(p[1]) * 100 : num(p[1]);

  let fluidKey: string | null = null;
  for (const [word, key] of Object.entries(FLUID_WORDS)) {
    if (lower.includes(word)) {
      fluidKey = key;
      break;
    }
  }

  return { targets, pressurePa, fluidKey };
}

/** Yerel motorun varsayılan geometrisi (spec referans kesiti). */
const LOCAL_W_UM = 100;
const LOCAL_H_UM = 80;
const LOCAL_FEED = { wUm: 300, lUm: 1000 };

export class LocalRuleProvider implements LlmProvider {
  readonly name = 'local';

  async complete(req: LlmRequest): Promise<string> {
    const lastUser = [...req.messages].reverse().find((m) => m.role === 'user');
    const intent = lastUser ? parseIntent(lastUser.content) : null;
    if (!intent) {
      return (
        'Yerel kural motoru bu komutu ayrıştıramadı. Örnekler: ' +
        '"10 mbar 2:1:1 bölücü su" · "4 çıkış eşit, 20 mbar, pbs" · ' +
        '"2:1 bölücü gliserol". (API anahtarı tanımlarsanız serbest metin de çalışır.)'
      );
    }

    const pInPa = intent.pressurePa ?? 1000;
    const fluidKey = intent.fluidKey ?? 'water';
    const fluid = FLUID_PRESETS[fluidKey];
    const targets = intent.targets.map((q, i) => ({ label: `ÇIKIŞ ${i + 1}`, qUlMin: q }));

    const branches = await solveTargets({
      pInPa,
      fluid: { viscosity: fluid.viscosity, density: fluid.density },
      wUm: LOCAL_W_UM,
      hUm: LOCAL_H_UM,
      feed: LOCAL_FEED,
      targets,
    });

    const lua = buildAutoDesignLua({
      pInPa,
      fluidKey,
      wUm: LOCAL_W_UM,
      hUm: LOCAL_H_UM,
      feed: LOCAL_FEED,
      branches,
    });

    const flags = branches.filter((b) => !b.fits_envelope).map((b) => b.label);
    const note =
      flags.length > 0 ? ` Dikkat: ${flags.join(', ')} üretim zarfı dışında (L > 180 mm).` : '';
    return (
      `Dallara R=P/Q ile direnç atayıp serpantin uzunluğuna çevirdim ` +
      `(${fluid.name}, ${pInPa / 100} mbar).${note}\n` +
      '```lua\n' +
      lua +
      '```'
    );
  }
}

// ─── Fallback zinciri ───────────────────────────────────────────────────────

export interface CompletionResult {
  text: string;
  provider: string;
  /** Claude'dan yerel motora düşüldüyse kullanıcıya gösterilecek not. */
  fallbackNote?: string;
}

export async function completeWithFallback(req: LlmRequest): Promise<CompletionResult> {
  const claude = new ClaudeProvider();
  try {
    const text = await claude.complete(req);
    return { text, provider: claude.name };
  } catch (err) {
    const local = new LocalRuleProvider();
    const text = await local.complete(req);
    return {
      text,
      provider: local.name,
      fallbackNote: `Claude'a ulaşılamadı (${String(err).slice(0, 120)}) — yerel kural motoru kullanıldı.`,
    };
  }
}
