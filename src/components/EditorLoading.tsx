import React from 'react';

/** ScriptEditor (Monaco) lazy-load sırasında gösterilen yükleme durumu. */
const EditorLoading: React.FC<{ height: number }> = ({ height }) => (
  <div className="flex items-center justify-center bg-mf-bg" style={{ height }}>
    <div className="flex items-center gap-2 text-mf-text-dim text-sm">
      <span className="inline-block w-4 h-4 border-2 border-mf-border border-t-mf-dye rounded-full animate-spin" />
      Editör yükleniyor…
    </div>
  </div>
);

export default EditorLoading;
