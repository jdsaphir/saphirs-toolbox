import React, { useMemo, useState } from 'react';
import type { ClockFormat, Settings } from '../../../shared/types';
import { deviceZone, formatOffset, genericZoneName, offsetMin, searchZones, zoneInfo } from '../shared/timezones';

interface Props {
  local: Settings;
  save: (patch: Partial<Settings>) => void;
}

// The World Clock section of Settings: the zones shown beside the device's
// own, and the time format. Zones are picked by searching rather than from a
// country list, since a country can span several zones (the US has six) and
// people think in cities ("Chicago"), countries ("Japan") or zone names
// ("Pacific", "CET") — the search takes any of them.
export const WorldClockSettings: React.FC<Props> = ({ local, save }) => {
  const [query, setQuery] = useState('');
  const device = deviceZone();
  const chosen = local.worldClockZones ?? [];
  const results = useMemo(() => searchZones(query), [query]);
  const now = Date.now();

  function add(id: string) {
    if (id !== device && !chosen.includes(id)) save({ worldClockZones: [...chosen, id] });
    setQuery('');
  }
  function remove(id: string) {
    save({ worldClockZones: chosen.filter(z => z !== id) });
  }

  const describe = (id: string) => {
    const info = zoneInfo(id);
    return [info.country, genericZoneName(id, now), formatOffset(offsetMin(id, now))].filter(Boolean).join(' · ');
  };

  return (
    <>
      <div className="section-label">World clock</div>
      <div className="field">
        <label>Time zones</label>
        <div className="wcs-list">
          <div className="wcs-zone fixed" title={device}>
            <span className="wcs-city">{zoneInfo(device).city}</span>
            <span className="wcs-desc">Your time zone (from this device)</span>
          </div>
          {chosen.filter(id => id !== device).map(id => (
            <div key={id} className="wcs-zone" title={id}>
              <span className="wcs-city">{zoneInfo(id).city}</span>
              <span className="wcs-desc">{describe(id)}</span>
              <button className="ghost icon wcs-remove" onClick={() => remove(id)} title={`Remove ${zoneInfo(id).city}`}>×</button>
            </div>
          ))}
        </div>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && results[0]) { e.preventDefault(); add(results[0].id); }
            if (e.key === 'Escape' && query) { e.stopPropagation(); setQuery(''); }
          }}
          placeholder="Add a city, country or time zone…"
          spellCheck={false}
        />
        {query.trim() && (
          <div className="wcs-results">
            {results.length === 0 && <div className="sub">No time zone matches “{query.trim()}”.</div>}
            {results.map(z => {
              const added = z.id === device || chosen.includes(z.id);
              return (
                <button key={z.id} className="wcs-result" disabled={added} onClick={() => add(z.id)} title={z.id}>
                  <span className="wcs-city">{z.city}</span>
                  <span className="wcs-desc">{added ? 'Already shown' : describe(z.id)}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="sub">The clock lists zones west to east and follows each one's own daylight saving dates.</div>
      </div>
      <div className="field">
        <label>World clock time format</label>
        <select value={local.worldClockFormat ?? 'auto'} onChange={e => save({ worldClockFormat: e.target.value as ClockFormat })}>
          <option value="auto">Follow system language</option>
          <option value="12h">12-hour (2:30 PM)</option>
          <option value="24h">24-hour (14:30)</option>
        </select>
      </div>
    </>
  );
};
