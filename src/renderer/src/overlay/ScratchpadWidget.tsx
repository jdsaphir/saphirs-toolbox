import React, { useState } from 'react';
import { marked } from 'marked';
import { api } from '../shared/api';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export const ScratchpadWidget: React.FC<Props> = ({ value, onChange }) => {
  const [preview, setPreview] = useState(false);

  async function openFile() {
    const content = await api.openMarkdown();
    if (content !== null) { onChange(content); setPreview(false); }
  }
  async function saveFile() {
    await api.saveMarkdown(value);
  }

  const renderedHtml = preview
    ? (marked.parse(value || '') as string)
    : '';

  return (
    <div className="widget scratchpad-widget" onClick={e => e.stopPropagation()}>
      <div className="widget-header">
        <span className="title">Scratchpad</span>
        <div className="actions">
          <button
            className="ghost icon"
            onClick={() => setPreview(p => !p)}
            title={preview ? 'Edit' : 'Preview'}
          >{preview ? '✏️' : '👁'}</button>
          <button className="ghost icon" onClick={openFile} title="Open .md">📂</button>
          <button className="ghost icon" onClick={saveFile} title="Save .md">💾</button>
        </div>
      </div>
      {preview ? (
        <div
          className="scratchpad-preview"
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      ) : (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Markdown notes…"
          spellCheck={false}
        />
      )}
    </div>
  );
};
