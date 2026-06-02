/**
 * csvParser.ts — Bağımlılıksız CSV / JSON tablo parser'ı.
 *
 * Deney verisi import akışı için kullanılır. Başlık satırı tespiti, delimiter
 * auto-detect (virgül / noktalı virgül / tab / boru), tırnaklı alanlar ve
 * escape edilmiş çift-tırnak desteği sağlar. JSON için iki biçim kabul edilir:
 *   - row-array: [{x: 0, value: 1.2}, ...]
 *   - obje-columns: {x: [0,1,2], value: [1.2, 0.9, ...]}
 */

export interface ParsedTable {
  headers: string[];
  rows: Array<Record<string, string>>;
  /** Ham satır sayısı (başlık hariç). */
  rowCount: number;
  /** İlk 5 satırın önizlemesi (tablo UI için). */
  preview: Array<Record<string, string>>;
}

/** CSV/TSV için delimiter tespit eder. İlk satırda en sık görülen ayıracı seçer. */
function detectDelimiter(firstLine: string): string {
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = 0;
  for (const c of candidates) {
    // Tırnaklı alanlar sayımı bozabilir — kaba ama yeterli bir yaklaşımla say
    let count = 0;
    let inQuote = false;
    for (let i = 0; i < firstLine.length; i++) {
      const ch = firstLine[i];
      if (ch === '"') inQuote = !inQuote;
      else if (ch === c && !inQuote) count++;
    }
    if (count > bestCount) { bestCount = count; best = c; }
  }
  return best;
}

/** Tek bir CSV satırını tırnak-escape farkındalığıyla alanlarına ayır. */
function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuote = true;
      else if (ch === delim) { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsv(text: string): ParsedTable {
  // BOM temizle, CRLF → LF
  const cleaned = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = cleaned.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [], rowCount: 0, preview: [] };
  }
  const delim = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delim)
    .map((h, i) => h || `col_${i + 1}`);

  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i], delim);
    if (fields.length === 1 && fields[0] === '') continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = fields[j] ?? '';
    }
    rows.push(row);
  }

  return {
    headers,
    rows,
    rowCount: rows.length,
    preview: rows.slice(0, 5),
  };
}

export function parseJsonTable(text: string): ParsedTable {
  const data = JSON.parse(text);
  // Biçim A: [{k: v, ...}, ...]
  if (Array.isArray(data)) {
    if (data.length === 0) return { headers: [], rows: [], rowCount: 0, preview: [] };
    const first = data[0];
    if (typeof first !== 'object' || first === null) {
      throw new Error('JSON dizisi obje elemanları içermeli.');
    }
    const headers = Array.from(
      new Set(data.flatMap((o: any) => Object.keys(o))),
    );
    const rows = data.map((o: any) => {
      const r: Record<string, string> = {};
      for (const h of headers) r[h] = o[h] !== undefined && o[h] !== null ? String(o[h]) : '';
      return r;
    });
    return { headers, rows, rowCount: rows.length, preview: rows.slice(0, 5) };
  }
  // Biçim B: {k: [...], k2: [...]}
  if (typeof data === 'object' && data !== null) {
    const headers = Object.keys(data);
    const len = headers.reduce((m, k) => Math.max(m, Array.isArray(data[k]) ? data[k].length : 0), 0);
    const rows: Array<Record<string, string>> = [];
    for (let i = 0; i < len; i++) {
      const r: Record<string, string> = {};
      for (const h of headers) {
        const col = data[h];
        r[h] = Array.isArray(col) && col[i] !== undefined && col[i] !== null ? String(col[i]) : '';
      }
      rows.push(r);
    }
    return { headers, rows, rowCount: rows.length, preview: rows.slice(0, 5) };
  }
  throw new Error('Desteklenmeyen JSON biçimi.');
}

/** Dosya uzantısına göre uygun parser'ı seç. */
export function parseTable(text: string, filename: string): ParsedTable {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'json') return parseJsonTable(text);
  return parseCsv(text);
}

/** Bir sütundaki değerlerin sayıya çevrilebilir oranını döner (0..1). */
export function numericScore(rows: Array<Record<string, string>>, col: string): number {
  if (rows.length === 0) return 0;
  let ok = 0;
  for (const r of rows) {
    const v = r[col];
    if (v === undefined || v === '') continue;
    const n = Number(v.replace(',', '.')); // Avrupa ondalık ayırıcısı hoşgörüsü
    if (Number.isFinite(n)) ok++;
  }
  return ok / rows.length;
}

/** Sütunu sayı dizisine çevir (non-numeric satırları NaN olarak bırakır, sonra filtrelenebilir). */
export function columnAsNumbers(rows: Array<Record<string, string>>, col: string): number[] {
  return rows.map((r) => {
    const v = r[col];
    if (v === undefined || v === '') return NaN;
    return Number(String(v).replace(',', '.'));
  });
}
