import React from 'react';
import { api } from '../shared/api';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export const ScratchpadWidget: React.FC<Props> = ({ value, onChange }) => {
  async function openFile() {
    const content = await api.openMarkdown();
    if (content !== null) onChange(content);
  }
  async function saveFile() {
    await api.saveMarkdown(value);
  }

  return (
    <div className="widget scratchpad-widget" onClick={e => e.stopPropagation()}>
      <div className="widget-header">
        <span className="title">Scratchpad</span>
        <div className="actions">
          <button className="ghost icon" onClick={openFile} title="Open .md">📂</button>
          <button className="ghost icon" onClick={saveFile} title="Save .md">💾</button>
        </div>
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Markdown notes…"
        spellCheck={false}
      />
    </div>
  );
};
