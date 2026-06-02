/**
 * ScriptEditor — Monaco Editor ile Lua script editörü
 * Faz 3'te tam Lua desteği eklenecek
 */
import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { useProjectStore } from '../../stores/useProjectStore';
import { FiPlay, FiRefreshCw, FiAlertCircle, FiCheckCircle, FiTerminal, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import type { ScriptRunStatus } from '../../hooks/useScriptDispatcher';

interface ScriptEditorProps {
  height: number;
  onRunScript: () => void;
  runStatus?: ScriptRunStatus;
  outputLog?: string;
}

const OUTPUT_PANEL_HEIGHT = 160;

const ScriptEditor: React.FC<ScriptEditorProps> = ({ height, onRunScript, runStatus, outputLog }) => {
  const { scriptContent, setScriptContent } = useProjectStore();
  const [outputOpen, setOutputOpen] = useState(true);

  const hasOutput = !!(outputLog && outputLog.length > 0);
  const hasError = !!runStatus?.lastError;
  const hasRun =
    !!runStatus && (runStatus.lastActionCount > 0 || runStatus.lastElapsedMs > 0 || hasError || hasOutput);

  const panelH = outputOpen ? OUTPUT_PANEL_HEIGHT : 28;
  const editorH = Math.max(100, height - 30 - panelH); // 30 = toolbar

  const editorOptions = {
    theme: 'mf-dark',
    minimap: { enabled: false },
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
    lineNumbers: 'on' as const,
    scrollBeyondLastLine: false,
    wordWrap: 'on' as const,
    automaticLayout: true,
    tabSize: 4,
    renderLineHighlight: 'line' as const,
    cursorBlinking: 'smooth' as const,
    smoothScrolling: true,
    contextmenu: true,
    folding: true,
    bracketPairColorization: { enabled: true },
  };

  const handleEditorMount = (editor: any, monaco: any) => {
    // Özel koyu tema tanımla
    monaco.editor.defineTheme('mf-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6a737d', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'f97583' },
        { token: 'string', foreground: '9ecbff' },
        { token: 'number', foreground: '79b8ff' },
        { token: 'identifier', foreground: 'e1e4e8' },
      ],
      colors: {
        'editor.background': '#0d1117',
        'editor.foreground': '#e1e4e8',
        'editor.lineHighlightBackground': '#161b22',
        'editor.selectionBackground': '#264f78',
        'editorLineNumber.foreground': '#3c4047',
        'editorLineNumber.activeForeground': '#6e7681',
        'editor.inactiveSelectionBackground': '#1f2937',
      },
    });
    monaco.editor.setTheme('mf-dark');

    // Lua keyword + Chip API tamamlama
    const snippet = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
    const Method = monaco.languages.CompletionItemKind.Method;
    const Func = monaco.languages.CompletionItemKind.Function;
    const Kw = monaco.languages.CompletionItemKind.Keyword;

    monaco.languages.registerCompletionItemProvider('lua', {
      triggerCharacters: ['.', ':', '('],
      provideCompletionItems: () => {
        const suggestions = [
          // ── Chip yaratma ─────────────────────────────────────────────
          { label: 'Chip.new', kind: Func,
            insertText: 'Chip.new("${1:name}", {width = ${2:30000}, height = ${3:20000}})',
            insertTextRules: snippet,
            documentation: 'Yeni çip oluştur (µm cinsinden genişlik/yükseklik).' },

          // ── chip: metodları ──────────────────────────────────────────
          { label: 'chip:add_channel', kind: Method,
            insertText: 'add_channel({x1 = ${1:0}, y1 = ${2:10000}, x2 = ${3:10000}, y2 = ${4:10000}, width = ${5:200}, depth = ${6:50}})',
            insertTextRules: snippet,
            documentation: 'Düz kanal ekle.' },
          { label: 'chip:add_curved_channel', kind: Method,
            insertText: 'add_curved_channel({cx = ${1:5000}, cy = ${2:5000}, radius = ${3:2000}, start_angle = ${4:0}, end_angle = ${5:180}, width = ${6:200}, depth = ${7:50}})',
            insertTextRules: snippet,
            documentation: 'Eğri kanal ekle (yay).' },
          { label: 'chip:add_port', kind: Method,
            insertText: 'add_port({x = ${1:0}, y = ${2:10000}, type = "${3|inlet,outlet|}", diameter = ${4:500}})',
            insertTextRules: snippet,
            documentation: 'Giriş/çıkış portu ekle.' },
          { label: 'chip:add_t_junction', kind: Method,
            insertText: 'add_t_junction({x = ${1:5000}, y = ${2:10000}, main_width = ${3:300}, branch_width = ${4:150}, angle = ${5:90}})',
            insertTextRules: snippet,
            documentation: 'T-bağlantı ekle.' },
          { label: 'chip:add_y_junction', kind: Method,
            insertText: 'add_y_junction({x = ${1:5000}, y = ${2:10000}, main_width = ${3:300}, branch_width = ${4:150}, angle = ${5:60}})',
            insertTextRules: snippet,
            documentation: 'Y-bağlantı ekle.' },
          { label: 'chip:add_mixer', kind: Method,
            insertText: 'add_mixer({x = ${1:5000}, y = ${2:5000}, channel_width = ${3:200}, turns = ${4:8}, pitch = ${5:600}})',
            insertTextRules: snippet,
            documentation: 'Serpantin mikser ekle.' },
          { label: 'chip:add_droplet_generator', kind: Method,
            insertText: 'add_droplet_generator({x = ${1:5000}, y = ${2:5000}, dispersed_width = ${3:100}, continuous_width = ${4:200}, orifice_width = ${5:80}})',
            insertTextRules: snippet,
            documentation: 'Damla üreteci (flow-focus / T-jonksiyon) ekle.' },
          { label: 'chip:add_filter_array', kind: Method,
            insertText: 'add_filter_array({x = ${1:5000}, y = ${2:5000}, width = ${3:2000}, height = ${4:1000}, pillar_diameter = ${5:50}, spacing = ${6:100}})',
            insertTextRules: snippet,
            documentation: 'Pillar array / filtre ekle.' },
          { label: 'chip:add_expansion', kind: Method,
            insertText: 'add_expansion({x = ${1:5000}, y = ${2:5000}, width_in = ${3:200}, width_out = ${4:600}, length = ${5:1000}})',
            insertTextRules: snippet,
            documentation: 'Kanal genişlemesi/daralması ekle.' },
          { label: 'chip:add_reservoir', kind: Method,
            insertText: 'add_reservoir({x = ${1:5000}, y = ${2:5000}, radius = ${3:1000}, depth = ${4:200}})',
            insertTextRules: snippet,
            documentation: 'Rezervuar ekle.' },
          { label: 'chip:connect', kind: Method,
            insertText: 'connect(${1:from_port}, ${2:to_port})',
            insertTextRules: snippet,
            documentation: 'İki portu/bileşeni L-bend ile bağla.' },
          { label: 'chip:clear', kind: Method,
            insertText: 'clear()',
            insertTextRules: snippet,
            documentation: 'Mevcut tasarımı temizle.' },

          // ── Sweep ────────────────────────────────────────────────────
          { label: 'Sweep.run', kind: Func,
            insertText: 'Sweep.run({\n    param = "${1:channel_width}",\n    values = {${2:100, 150, 200}},\n    callback = function(value, i)\n        ${3:-- her iterasyonda çalışacak tasarım kodu}\n    end\n})',
            insertTextRules: snippet,
            documentation: 'Parametre taraması — callback her değer için çağrılır.' },

          // ── Lua temel anahtar kelimeler ──────────────────────────────
          { label: 'for', kind: Kw,
            insertText: 'for ${1:i} = ${2:1}, ${3:10} do\n    ${4}\nend',
            insertTextRules: snippet, documentation: 'Sayısal for döngüsü.' },
          { label: 'while', kind: Kw,
            insertText: 'while ${1:koşul} do\n    ${2}\nend',
            insertTextRules: snippet, documentation: 'While döngüsü.' },
          { label: 'if', kind: Kw,
            insertText: 'if ${1:koşul} then\n    ${2}\nend',
            insertTextRules: snippet, documentation: 'If bloğu.' },
          { label: 'function', kind: Kw,
            insertText: 'function ${1:name}(${2:args})\n    ${3}\nend',
            insertTextRules: snippet, documentation: 'Fonksiyon tanımı.' },
          { label: 'local', kind: Kw,
            insertText: 'local ${1:name} = ${2:value}',
            insertTextRules: snippet, documentation: 'Yerel değişken.' },
        ];
        return { suggestions };
      },
    });

    // Basit satır-bazlı Lua diagnostics (linter yerine uyarı/ipucu seviyesinde)
    const luaModel = editor.getModel();
    const runDiagnostics = () => {
      const model = editor.getModel();
      if (!model) return;
      const markers: any[] = [];
      const lines = model.getLinesContent();
      const keywordsOpeningBlock = /\b(function|then|do)\b/;
      const keywordClosingBlock = /\bend\b/;
      let openCount = 0, closeCount = 0;
      lines.forEach((line: string, idx: number) => {
        // Çok basit syntax check: unclosed string
        const stripped = line.replace(/--.*$/, '');
        const dquotes = (stripped.match(/(^|[^\\])"/g) || []).length;
        const squotes = (stripped.match(/(^|[^\\])'/g) || []).length;
        if (dquotes % 2 !== 0 || squotes % 2 !== 0) {
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            message: 'Muhtemelen kapanmamış dize (string).',
            startLineNumber: idx + 1, endLineNumber: idx + 1,
            startColumn: 1, endColumn: line.length + 1,
          });
        }
        if (keywordsOpeningBlock.test(stripped)) openCount++;
        if (keywordClosingBlock.test(stripped)) closeCount++;
      });
      if (openCount > closeCount) {
        markers.push({
          severity: monaco.MarkerSeverity.Info,
          message: `Blok kapanışı eksik olabilir — ${openCount - closeCount} adet 'end' gerekiyor olabilir.`,
          startLineNumber: lines.length, endLineNumber: lines.length,
          startColumn: 1, endColumn: 1,
        });
      }
      monaco.editor.setModelMarkers(model, 'mf-lua', markers);
    };
    if (luaModel) {
      runDiagnostics();
      luaModel.onDidChangeContent(() => runDiagnostics());
    }
  };

  const isRunning = !!runStatus?.running;

  return (
    <div className="flex flex-col w-full h-full" style={{ height }}>
      {/* Script araç çubuğu */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-mf-panel border-b border-mf-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-mf-text-dim font-mono">chip_design.lua</span>
          {hasRun && !isRunning && (
            <>
              <span className="text-mf-border">|</span>
              {hasError ? (
                <span className="flex items-center gap-1 text-xs text-mf-orange">
                  <FiAlertCircle size={11} /> Hata
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-green-400">
                  <FiCheckCircle size={11} /> {runStatus!.lastActionCount} aksiyon
                  <span className="text-mf-text-dark ml-1">({runStatus!.lastElapsedMs} ms)</span>
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-mf-text-dark">Lua 5.4</span>
          <button
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium
                       bg-mf-orange text-white hover:bg-orange-500 active:scale-95 transition-all
                       disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onRunScript}
            disabled={isRunning}
            title="Script'i çalıştır ve canvas'ı güncelle"
          >
            {isRunning ? <FiRefreshCw size={11} className="animate-spin" /> : <FiPlay size={11} />}
            <span>{isRunning ? 'Çalışıyor…' : 'Çalıştır'}</span>
          </button>
        </div>
      </div>

      {/* Monaco Editor */}
      <div className="flex-shrink-0" style={{ height: editorH }}>
        <Editor
          height="100%"
          language="lua"
          value={scriptContent}
          onChange={(value) => setScriptContent(value ?? '')}
          onMount={handleEditorMount}
          options={editorOptions}
          loading={
            <div className="flex items-center justify-center h-full text-mf-text-dim text-sm">
              Editör yükleniyor...
            </div>
          }
        />
      </div>

      {/* Output / Error panel */}
      <div
        className="flex flex-col border-t border-mf-border bg-mf-panel flex-shrink-0"
        style={{ height: panelH }}
      >
        <button
          className="flex items-center justify-between px-3 py-1 text-xs text-mf-text-dim
                     hover:text-mf-text hover:bg-mf-bg transition-colors flex-shrink-0"
          onClick={() => setOutputOpen((v) => !v)}
        >
          <span className="flex items-center gap-1.5">
            <FiTerminal size={11} />
            <span className="font-semibold">Çıktı</span>
            {hasError && (
              <span className="text-mf-orange">● hata</span>
            )}
            {!hasError && hasRun && (
              <span className="text-mf-text-dark">
                · {runStatus!.lastActionCount} aksiyon · {runStatus!.lastElapsedMs} ms
              </span>
            )}
          </span>
          {outputOpen ? <FiChevronDown size={11} /> : <FiChevronUp size={11} />}
        </button>

        {outputOpen && (
          <div className="flex-1 min-h-0 overflow-auto px-3 py-2 font-mono text-xs">
            {hasError && (
              <pre className="text-mf-orange whitespace-pre-wrap break-words mb-2">
                {runStatus!.lastError}
              </pre>
            )}
            {hasOutput && (
              <pre className="text-mf-text whitespace-pre-wrap break-words">
                {outputLog}
              </pre>
            )}
            {!hasError && !hasOutput && !isRunning && (
              <div className="text-mf-text-dark italic">
                Henüz çıktı yok. Script'i çalıştırmak için yukarıdaki "Çalıştır" düğmesine tıklayın.
              </div>
            )}
            {isRunning && !hasOutput && (
              <div className="text-mf-text-dim italic">Script çalışıyor…</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ScriptEditor;
