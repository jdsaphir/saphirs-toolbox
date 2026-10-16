import React, { useEffect, useMemo, useState } from 'react';
import type { ClockFormat, Settings } from '../../../shared/types';
import {
  DAY, MIN, abbreviation, dayIndex, deviceZone, formatDate, formatHours, formatOffset, formatShortDate,
  formatTime, formatWall, isDst, isValidZone, longZoneName, nextTransition, observesDst, offsetMin,
  transitionWall, wallParts, wallToUtc, zoneInfo, genericZoneName, type WallResolution,
} from '../shared/timezones';

interface Props {
  settings: Settings;
  onOpenSettings: () => void;
  onClose: () => void;
}

// The converter: a date and time typed into one zone's column (the source),
// which every other column shows in its own zone. `second` picks the later of
// the two instants when the time happens twice (clocks falling back).
interface Conversion { src: string; date: string; time: string; second: boolean }

const pad = (n: number) => String(n).padStart(2, '0');

function wallInputs(tz: string, ms: number): { date: string; time: string } {
  const p = wallParts(tz, ms);
  return { date: `${p.y}-${pad(p.mo)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` };
}

function conversionAt(tz: string, ms: number): Conversion {
  return { src: tz, ...wallInputs(tz, ms), second: false };
}

// The typed date and time as numbers, or null while either field is incomplete.
function parseWall(c: Conversion): [number, number, number, number, number] | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(c.date), tm = /^(\d{2}):(\d{2})/.exec(c.time);
  return dm && tm ? [+dm[1], +dm[2], +dm[3], +tm[1], +tm[2]] : null;
}

function resolveConversion(c: Conversion): { resolution: WallResolution; utc: number } | null {
  const w = parseWall(c);
  if (!w) return null;
  const resolution = wallToUtc(c.src, ...w);
  const utc = resolution.kind === 'ambiguous' ? resolution.options[c.second ? 1 : 0] : resolution.utc;
  return { resolution, utc };
}

export function prefersHour12(format: ClockFormat): boolean {
  if (format !== 'auto') return format === '12h';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 ?? false;
}

// The zones to show: the device's own first, then the chosen ones, with
// duplicates and ids this engine doesn't know dropped.
export function worldClockZones(settings: Settings, local: string): string[] {
  const out = [local];
  for (const z of settings.worldClockZones ?? []) if (!out.includes(z) && isValidZone(z)) out.push(z);
  return out;
}

// A typed time as "HH:MM" (24-hour), or null. Takes "14:30", "2:30 pm",
// "2pm", "1430" and "9" — whatever the clock format, so either way of typing
// works.
export function parseTimeInput(text: string): string | null {
  const m = /^\s*(\d{1,2})(?:[:.h]?(\d{2}))?\s*([ap])?\.?\s*m?\.?\s*$/i.exec(text);
  if (!m) return null;
  let h = +m[1];
  const mi = m[2] ? +m[2] : 0;
  const ap = m[3]?.toLowerCase();
  if (mi > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ap === 'p' ? 12 : 0);
  } else if (h > 23) return null;
  return `${pad(h)}:${pad(mi)}`;
}

// "Same day", "Next day", "+2 days" for a calendar-day difference.
function dayShift(days: number): string {
  if (days === 0) return 'Same day';
  if (days === 1) return 'Next day';
  if (days === -1) return 'Previous day';
  return `${days > 0 ? '+' : '−'}${Math.abs(days)} days`;
}

export const WorldClock: React.FC<Props> = ({ settings, onOpenSettings, onClose }) => {
  const [now, setNow] = useState(() => Date.now());
  const [local, setLocal] = useState(deviceZone);
  const [conv, setConv] = useState<Conversion>(() => conversionAt(deviceZone(), Date.now()));

  // Tick on the second, and pick up a device time zone change as it happens.
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      setNow(Date.now());
      setLocal(deviceZone());
      timer = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    };
    timer = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    return () => window.clearTimeout(timer);
  }, []);

  const hour12 = prefersHour12(settings.worldClockFormat);

  // West to east: the zone whose clock is earliest goes on the left. Ordered by
  // the offset in force right now, so a pair that is level for part of the
  // year (Phoenix and Los Angeles in summer) is ordered for the current date.
  const nowMinute = Math.floor(now / MIN);
  const zones = useMemo(() => {
    const at = nowMinute * MIN;
    return worldClockZones(settings, local)
      .map(id => ({ id, info: zoneInfo(id), offset: offsetMin(id, at) }))
      .sort((a, b) => a.offset - b.offset || a.info.city.localeCompare(b.info.city));
  }, [settings.worldClockZones, local, nowMinute]);

  // A source zone removed in settings hands over to the device zone, keeping
  // the same moment.
  useEffect(() => {
    if (zones.some(z => z.id === conv.src)) return;
    const r = resolveConversion(conv);
    setConv(conversionAt(local, r ? r.utc : Date.now()));
  }, [zones, conv, local]);

  const resolved = resolveConversion(conv);
  const instant = resolved?.utc ?? null;
  const srcInfo = zoneInfo(conv.src);

  // Typing into a column makes it the source; the field not being edited keeps
  // what that column showed, so the moment only moves by what was typed.
  function edit(tz: string, field: 'date' | 'time', value: string) {
    setConv(prev => {
      const base = tz === prev.src ? prev : instant !== null ? conversionAt(tz, instant) : { ...prev, src: tz };
      return { ...base, src: tz, [field]: value, second: tz === prev.src ? prev.second : false };
    });
  }

  const localOffset = offsetMin(local, now);
  const localDay = dayIndex(local, now);

  return (
    <div className="widget wc-widget" onClick={e => e.stopPropagation()}>
      <div className="widget-header" data-drag-handle>
        <span className="title">World Clock</span>
        <div className="actions">
          <button className="ghost icon" onClick={() => setConv(conversionAt(conv.src, Date.now()))} title="Set the converter back to the current time">Now</button>
          <button className="ghost icon" onClick={onOpenSettings} title="Choose time zones">⚙</button>
          <button className="ghost icon" onClick={onClose} title="Close">×</button>
        </div>
      </div>

      <div className="wc-columns">
        {zones.map(({ id, info, offset }) => {
          const isLocal = id === local;
          const isSrc = id === conv.src;
          const t = formatTime(id, now, hour12);
          const secs = pad(wallParts(id, now).s);
          const hour = wallParts(id, now).h;
          const night = hour < 7 || hour >= 22;
          const abbr = abbreviation(id, now);
          const days = dayIndex(id, now) - localDay;
          const rel = offset - localOffset;
          return (
            <div key={id} className={`wc-col ${isLocal ? 'local' : ''} ${isSrc ? 'source' : ''}`}>
              <div className="wc-head">
                <div className="wc-city" title={id}>{info.city}{night ? <span className="wc-night" title="Night there"> ☾</span> : null}</div>
                <div className="wc-sub" title={genericZoneName(id, now)}>{isLocal ? 'Your time zone' : info.country || genericZoneName(id, now)}</div>
              </div>

              <div className="wc-time">
                {t.time}<span className="wc-secs">:{secs}</span>{t.ampm && <span className="wc-ampm">{t.ampm}</span>}
              </div>
              <div className="wc-date">
                {formatDate(id, now)}
                {!isLocal && days !== 0 && <span className="wc-chip shift">{days > 0 ? 'Tomorrow' : 'Yesterday'}</span>}
              </div>
              <div className="wc-meta">
                {abbr && <span className="wc-chip abbr">{abbr}</span>}
                <span>{formatOffset(offset)}</span>
                {!isLocal && <span className="wc-rel">{rel === 0 ? 'same as you' : `${rel > 0 ? '+' : '−'}${formatHours(rel)}`}</span>}
              </div>
              <DstLine tz={id} at={now} hour12={hour12} />

              <div className="wc-convert">
                <div className="wc-convert-label">{isSrc ? 'Convert from here' : 'Converted'}</div>
                <ConvertFields
                  tz={id}
                  city={info.city}
                  isSrc={isSrc}
                  hour12={hour12}
                  conv={conv}
                  instant={instant}
                  onEdit={edit}
                />
                {instant !== null && (
                  <ConvertMeta tz={id} isSrc={isSrc} instant={instant} srcTz={conv.src} srcCity={srcInfo.city} />
                )}
                {isSrc && resolved && (
                  <ResolutionNote
                    tz={id}
                    city={info.city}
                    conv={conv}
                    resolution={resolved.resolution}
                    hour12={hour12}
                    onPick={second => setConv(c => ({ ...c, second }))}
                  />
                )}
              </div>
            </div>
          );
        })}

        {zones.length === 1 && (
          <button className="wc-add" onClick={onOpenSettings}>
            <span className="wc-add-plus">+</span>
            Add time zones in Settings
          </button>
        )}
      </div>
    </div>
  );
};

// Whether the zone is on summer time now, and when its clocks change next.
// A change less than two weeks away is highlighted.
const DstLine: React.FC<{ tz: string; at: number; hour12: boolean }> = ({ tz, at, hour12 }) => {
  if (!observesDst(tz, at)) {
    return <div className="wc-dst"><span className="wc-pill none">No daylight saving</span></div>;
  }
  const on = isDst(tz, at);
  const next = nextTransition(tz, at);
  const soon = next !== null && next.at - at < 14 * DAY;
  const [from, to] = next ? transitionWall(next, hour12) : ['', ''];
  return (
    <div className="wc-dst">
      <span className={`wc-pill ${on ? 'on' : 'off'}`} title={longZoneName(tz, at)}>{on ? 'Summer time' : 'Standard time'}</span>
      {next && (
        <span className={`wc-next ${soon ? 'soon' : ''}`} title={`Clocks go from ${from} to ${to}`}>
          {next.to > next.from ? 'Starts' : 'Ends'} {formatShortDate(tz, next.at)}
          {soon && ` (in ${Math.max(1, Math.ceil((next.at - at) / DAY))} d)`}
        </span>
      )}
    </div>
  );
};

// Date and time fields. The source column holds what was typed; every other
// column shows the same moment on its own clock and can be typed into too.
const ConvertFields: React.FC<{
  tz: string; city: string; isSrc: boolean; conv: Conversion; instant: number | null; hour12: boolean;
  onEdit: (tz: string, field: 'date' | 'time', value: string) => void;
}> = ({ tz, city, isSrc, conv, instant, hour12, onEdit }) => {
  const shown = isSrc ? conv : instant !== null ? wallInputs(tz, instant) : { date: '', time: '' };
  return (
    <div className="wc-fields">
      <input type="date" value={shown.date} onChange={e => onEdit(tz, 'date', e.target.value)} aria-label={`Date in ${city}`} />
      <TimeField value={shown.time} hour12={hour12} label={`Time in ${city}`} onCommit={v => onEdit(tz, 'time', v)} />
    </div>
  );
};

// A time typed as text rather than the native time field, which only follows
// the system's 12/24-hour setting. Shows the World Clock format; while it has
// focus it keeps what is being typed and applies it whenever it reads as a
// time, so the other columns follow keystroke by keystroke.
const TimeField: React.FC<{ value: string; hour12: boolean; label: string; onCommit: (v: string) => void }> = ({ value, hour12, label, onCommit }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  const display = m ? formatWall(+m[1], +m[2], hour12) : '';
  const text = draft ?? display;
  const invalid = draft !== null && draft.trim() !== '' && parseTimeInput(draft) === null;
  return (
    <input
      type="text"
      className={invalid ? 'invalid' : ''}
      value={text}
      placeholder={hour12 ? '2:30 PM' : '14:30'}
      aria-label={label}
      spellCheck={false}
      onFocus={e => { setDraft(display); e.currentTarget.select(); }}
      onChange={e => {
        setDraft(e.target.value);
        const parsed = parseTimeInput(e.target.value);
        if (parsed) onCommit(parsed);
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
};

// What the converted moment means in this zone: the day relative to the
// source, and the offset and summer/standard time in force on that date.
const ConvertMeta: React.FC<{ tz: string; isSrc: boolean; instant: number; srcTz: string; srcCity: string }> = ({ tz, isSrc, instant, srcTz, srcCity }) => {
  const off = offsetMin(tz, instant);
  const abbr = abbreviation(tz, instant);
  const days = dayIndex(tz, instant) - dayIndex(srcTz, instant);
  const rel = off - offsetMin(srcTz, instant);
  const dst = observesDst(tz, instant) ? (isDst(tz, instant) ? 'Summer time' : 'Standard time') : null;
  return (
    <div className="wc-convert-meta">
      {!isSrc && <span className={`wc-chip ${days ? 'shift' : ''}`}>{dayShift(days)}</span>}
      <span>{abbr ? `${abbr} · ` : ''}{formatOffset(off)}{dst ? ` · ${dst}` : ''}</span>
      {!isSrc && <span className="wc-rel">{rel === 0 ? `same as ${srcCity}` : `${rel > 0 ? '+' : '−'}${formatHours(rel)} vs ${srcCity}`}</span>}
    </div>
  );
};

// A typed time that falls in a clock change: either it never happens (clocks
// spring forward over it) or it happens twice (they fall back), in which case
// the user picks which one they meant.
const ResolutionNote: React.FC<{
  tz: string; city: string; conv: Conversion; resolution: WallResolution; hour12: boolean;
  onPick: (second: boolean) => void;
}> = ({ tz, city, conv, resolution, hour12, onPick }) => {
  if (resolution.kind === 'ok') return null;
  const w = parseWall(conv)!;
  const typed = formatWall(w[3], w[4], hour12);
  const day = formatShortDate('UTC', Date.UTC(w[0], w[1] - 1, w[2]));
  if (resolution.kind === 'gap') {
    const t = formatTime(tz, resolution.utc, hour12);
    return (
      <div className="wc-note">
        <b>{typed} doesn't exist in {city} on {day}.</b> Clocks jump forward that night, so it's read as {t.time}{t.ampm && ` ${t.ampm}`}.
      </div>
    );
  }
  return (
    <div className="wc-note">
      <b>{typed} happens twice in {city} on {day}.</b> Clocks fall back that night. Which one?
      <div className="wc-note-choices">
        {resolution.options.map((utc, i) => (
          <button key={i} className={(i === 1) === conv.second ? 'primary' : ''} onClick={() => onPick(i === 1)}>
            {i ? 'Second' : 'First'} · {abbreviation(tz, utc) ?? formatOffset(offsetMin(tz, utc))}
          </button>
        ))}
      </div>
    </div>
  );
};
