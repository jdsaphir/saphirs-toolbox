import React, { useState } from 'react';
import { marked } from 'marked';
import { api } from '../shared/api';

interface Props {
  title: string;
  value: string;
  onChange: (v: string) => void;
  // localStorage key remembering this pad's edit/preview mode, so each pad
  // keeps its own toggle.
  modeKey: string;
  placeholder?: string;
  className?: string;
}

export const ScratchpadWidget: React.FC<Props> = ({ title, value, onChange, modeKey, placeholder = 'Markdown notes…', className = '' }) => {
  const [preview, setPreview] = useState(() => localStorage.getItem(modeKey) === 'preview');

  function togglePreview() {
    setPreview(p => {
      const next = !p;
      localStorage.setItem(modeKey, next ? 'preview' : 'edit');
      return next;
    });
  }

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
    <div className={`widget scratchpad-widget ${className}`} onClick={e => e.stopPropagation()}>
      <div className="widget-header">
        <span className="title">{title}</span>
        <div className="actions">
          <button
            className="ghost icon"
            onClick={togglePreview}
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
          placeholder={placeholder}
          spellCheck={false}
        />
      )}
    </div>
  );
};
