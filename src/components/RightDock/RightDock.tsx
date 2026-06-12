/**
 * RightDock — sağ panel sekme kapsayıcısı: Özellikler | ✦ Asistan.
 * AssistantPanel lazy yüklenir (LLM katmanı yalnız sekme açılınca gelir).
 */
import React, { Suspense, lazy } from 'react';
import clsx from 'clsx';
import { useProjectStore } from '../../stores/useProjectStore';
import PropertiesPanel from '../PropertiesPanel/PropertiesPanel';
import type { RunScript } from '../../hooks/useScriptRun';

const AssistantPanel = lazy(() => import('../../features/assistant/AssistantPanel'));

interface Props {
  width: number;
  runScript: RunScript;
}

const RightDock: React.FC<Props> = ({ width, runScript }) => {
  const tab = useProjectStore((s) => s.rightPanelTab);
  const setTab = useProjectStore((s) => s.setRightPanelTab);

  return (
    <div
      className="flex flex-col bg-mf-surface border-l border-mf-border overflow-hidden"
      style={{ width }}
    >
      {/* Sekme başlığı */}
      <div className="flex border-b border-mf-border flex-shrink-0">
        {(
          [
            { key: 'properties', label: 'Özellikler' },
            { key: 'assistant', label: '✦ Asistan' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'flex-1 py-1.5 text-2xs uppercase tracking-caps font-semibold transition-colors',
              tab === t.key
                ? 'text-mf-blue border-b-2 border-mf-blue bg-mf-blue/5'
                : 'text-mf-text-dim hover:text-mf-text',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'properties' ? (
          // PropertiesPanel kendi genişlik/çerçevesini çizer — dock içinde tam dolduralım
          <PropertiesPanel width={width} />
        ) : (
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full text-xs text-mf-text-dim">
                Asistan yükleniyor…
              </div>
            }
          >
            <AssistantPanel runScript={runScript} />
          </Suspense>
        )}
      </div>
    </div>
  );
};

export default RightDock;
