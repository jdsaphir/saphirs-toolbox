import React, { useEffect, useState } from 'react';
import { api } from '../shared/api';
import type { Settings } from '../../../shared/types';

interface Props {
  settings: Settings;
  onClose: () => void;
}

const MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Super'] as const;

function parseAccelerator(accel: string): { mods: Set<string>; key: string } {
  const parts = accel.split('+').map(p => p.trim());
  const mods = new Set<string>();
  let key = '';
  for (const p of parts) {
    if (MODIFIERS.includes(p as any) || p === 'CommandOrControl' || p === 'Meta' || p === 'Cmd' || p === 'Command') {
      mods.add(p === 'CommandOrControl' || p === 'Meta' || p === 'Cmd' || p === 'Command' ? 'Super' : p);
    } else {
      key = p;
    }
  }
  return { mods, key };
}

function buildAccelerator(mods: Set<string>, key: string): string {
  const order = ['Ctrl', 'Alt', 'Shift', 'Super'];
  const parts = order.filter(m => mods.has(m));
  if (key) parts.push(key);
  return parts.join('+');
}

export const SettingsTool: React.FC<Props> = ({ settings, onClose }) => {
  const [local, setLocal] = useState<Settings>(settings);
  const [recording, setRecording] = useState(false);

  useEffect(() => setLocal(settings), [settings]);

  function save(patch: Partial<Settings>) {
    setLocal(prev => ({ ...prev, ...patch }));
    api.setSettings(patch);
  }

  // Capture next keystroke when recording shortcut
  useEffect(() => {
    if (!recording) return;
    function onKey(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();
      const mods = new Set<string>();
      if (e.ctrlKey) mods.add('Ctrl');
      if (e.altKey) mods.add('Alt');
      if (e.shiftKey) mods.add('Shift');
      if (e.metaKey) mods.add('Super');
      const key = normalizeKey(e.key, e.code);
      if (!key || ['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return; // wait for non-mod key
      const accel = buildAccelerator(mods, key);
      save({ shortcut: accel });
      setRecording(false);
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording]);

  return (
    <div className="widget settings-widget" onClick={e => e.stopPropagation()}>
      <div className="widget-header" data-drag-handle>
        <span className="title">Settings</span>
        <div className="actions"><button className="ghost icon" onClick={onClose} title="Close">×</button></div>
      </div>

      <div className="field">
        <label>Global shortcut</label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="kbd">{local.shortcut}</span>
          <button onClick={() => setRecording(r => !r)} className={recording ? 'primary' : ''}>
            {recording ? 'Press keys…' : 'Change'}
          </button>
        </div>
      </div>

      <div className="field">
        <label>Checkbox interaction</label>
        <select value={local.checkboxMode} onChange={e => save({ checkboxMode: e.target.value as Settings['checkboxMode'] })}>
          <option value="palette">Popup palette on click</option>
          <option value="cycle">Left-click cycles (empty → / → ✓); right-click for palette</option>
        </select>
      </div>

      <div className="field">
        <label>Dolphin icon style</label>
        <select value={local.dolphinIcon} onChange={e => save({ dolphinIcon: e.target.value as Settings['dolphinIcon'] })}>
          <option value="duotone">Duotone (default)</option>
          <option value="solid">Solid</option>
        </select>
      </div>

      <div className="field">
        <label>Toolbar expansion</label>
        <select value={local.toolboxSide} onChange={e => save({ toolboxSide: e.target.value as Settings['toolboxSide'] })}>
          <option value="auto">Auto (based on dolphin position)</option>
          <option value="left">Always expand left</option>
          <option value="right">Always expand right</option>
        </select>
      </div>

      <div className="field">
        <label>Calendar week starts on</label>
        <select value={local.weekStart} onChange={e => save({ weekStart: e.target.value as Settings['weekStart'] })}>
          <option value="sunday">Sunday</option>
          <option value="monday">Monday</option>
        </select>
      </div>

      <div className="field" style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <button
          onClick={() => { if (confirm("Quit Saphir's Toolbox?")) api.quitApp(); }}
          style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
        >
          Quit Saphir's Toolbox
        </button>
      </div>
    </div>
  );
};

function normalizeKey(key: string, _code: string): string {
  if (key === ' ') return 'Space';
  if (/^[a-z]$/.test(key)) return key.toUpperCase();
  if (/^F\d{1,2}$/.test(key)) return key;
  if (/^Arrow/.test(key)) return key.replace('Arrow', '');
  return key;
}
