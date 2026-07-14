import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '98.8.0';
const RELEASED_AT = '2026-07-14T15:30:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');

function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}

function replaceOnce(content, search, replacement, label) {
  if (content.includes(replacement)) return content;
  if (!content.includes(search)) throw new Error(`v98.8 missing ${label}`);
  return content.replace(search, replacement);
}

function replaceAllText(content, search, replacement, label) {
  if (content.includes(replacement) && !content.includes(search)) return content;
  if (!content.includes(search)) throw new Error(`v98.8 missing ${label}`);
  return content.split(search).join(replacement);
}

function appendOnce(content, marker, addition) {
  return content.includes(marker) ? content : `${content.trimEnd()}\n\n${addition.trim()}\n`;
}

// ---------------------------------------------------------------------------
// Today/current-status display: an empty raw day still paints the current
// OFF/SB status to "now" without writing a synthetic event into the driver's
// stored record.
// ---------------------------------------------------------------------------
const displayPath = 'source/src/core/timeline/displayTimeline.js';
let display = read(displayPath);
display = replaceOnce(
  display,
  `function safeCarryForwardStatus(status = '') {
  // Smart paper-log mode must never paint a new day as DRIVING just because
  // the previous day ended in D. Driving across midnight requires a real
  // stored event/rollover, not display carry-forward.
  return status === 'D' ? 'OFF' : (status || 'OFF');
}`,
  `function safeCarryForwardStatus(status = '') {
  // Smart paper-log mode must never paint a new day as DRIVING just because
  // the previous day ended in D. Driving across midnight requires a real
  // stored event/rollover, not display carry-forward.
  return status === 'D' ? 'OFF' : (status || 'OFF');
}

function statusNote(status = 'OFF') {
  if (status === 'SB') return 'Sleeper';
  if (status === 'ON') return 'On Duty';
  if (status === 'D') return 'Driving';
  return 'Off Duty';
}

function emptyCurrentDayEvent(day, previous = null, options = {}) {
  const requested = String(options.currentStatus || previous?.status || 'OFF').toUpperCase();
  const status = safeCarryForwardStatus(['OFF','SB','D','ON'].includes(requested) ? requested : 'OFF');
  const minute = Math.max(1, Math.min(1440, Math.round(Number(options.nowMinute ?? nowMin()))));
  const location = options.currentLocation || {};
  return {
    id:\`display_current_\${day}_\${status}\`,
    status,
    startMin:0,
    endMin:minute,
    city:location.city || previous?.city || '',
    state:location.state || previous?.state || '',
    note:options.currentReason || statusNote(status),
    description:'Current duty status shown to now',
    source:'display_timeline',
    displayOnly:true,
    syntheticCoverage:true,
  };
}`,
  'current-day display helper'
);
display = replaceOnce(
  display,
  `  const previous = previousLastEvent(eventsByDay, day);
  const fillStartWith = first && Number(first.startMin || 0) > 0`,
  `  const previous = previousLastEvent(eventsByDay, day);
  if (!raw.length && day === today) {
    return [emptyCurrentDayEvent(day, previous, options)];
  }
  const fillStartWith = first && Number(first.startMin || 0) > 0`,
  'empty current-day display coverage'
);
write(displayPath, display);

// ---------------------------------------------------------------------------
// DOT/RODS coverage: current OFF or SB with no raw row is valid coverage from
// midnight to now. It is derived for checks only and never persisted.
// ---------------------------------------------------------------------------
const coveragePath = 'source/src/core/compliance/rawRodsChecks.js';
let coverage = read(coveragePath);
coverage = replaceOnce(
  coverage,
  `function restOnlyCoverageStatus(events = []) {
  const real = (events || []).filter(event => Number(event.endMin || 0) > Number(event.startMin || 0));
  const sleeper = real.find(event => event.status === 'SB');
  return sleeper?.status || real[0]?.status || 'OFF';
}`,
  `function restOnlyCoverageStatus(events = []) {
  const real = (events || []).filter(event => Number(event.endMin || 0) > Number(event.startMin || 0));
  const sleeper = real.find(event => event.status === 'SB');
  return sleeper?.status || real[0]?.status || 'OFF';
}

function currentRestCoverageStatus(current, rawCompleted = [], previousDayEvent = null, options = {}) {
  if (!current || rawCompleted.length) return '';
  const explicit = String(options.currentStatus || '').trim().toUpperCase();
  if (explicit === 'OFF' || explicit === 'SB') return explicit;
  const previousStatus = String(previousDayEvent?.status || '').toUpperCase();
  const previousReachedMidnight = Number(previousDayEvent?.endMin || 0) >= 1438;
  if (previousReachedMidnight && (previousStatus === 'OFF' || previousStatus === 'SB')) return previousStatus;
  return '';
}`,
  'current rest coverage helper'
);
coverage = replaceOnce(
  coverage,
  `  if (isRestOnlyCoverageDay(rawCompleted) && targetEnd > 0) {`,
  `  const currentRestStatus = currentRestCoverageStatus(current, rawCompleted, previousDayEvent, options);
  if (currentRestStatus && targetEnd > 0) {
    const loc = usableLocation(previousDayEvent, options.currentLocation);
    return {
      events,
      issues,
      total:targetEnd,
      targetEnd,
      current,
      future,
      currentRestDerivedCoverage:true,
      derivedCoverageEvent:{
        id:\`current_rest_coverage_\${day}\`,
        status:currentRestStatus,
        startMin:0,
        endMin:targetEnd,
        city:loc.city || '',
        state:loc.state || '',
        note:options.currentReason || statusNote(currentRestStatus),
        description:'Current OFF/SB status covers today for checks only',
        source:'current_rest_coverage_derived',
        displayOnly:true,
        syntheticCoverage:true,
      },
    };
  }

  if (isRestOnlyCoverageDay(rawCompleted) && targetEnd > 0) {`,
  'current OFF/SB DOT coverage'
);
write(coveragePath, coverage);

// Pass current status/reason into coverage checks.
const dotPath = 'source/src/core/dot/dotOfficerCheckEngine.js';
let dot = read(dotPath);
dot = replaceAllText(
  dot,
  `{ currentLocation: state.currentLocation || {} }`,
  `{ currentLocation: state.currentLocation || {}, currentStatus:state.currentStatus || 'OFF', currentReason:state.currentReason || 'Off Duty' }`,
  'DOT current-status coverage options'
);
write(dotPath, dot);

const signingPath = 'source/src/modules/logbook/signing.js';
let signing = read(signingPath);
signing = replaceAllText(
  signing,
  `{ currentLocation: state.currentLocation || {} }`,
  `{ currentLocation: state.currentLocation || {}, currentStatus:state.currentStatus || 'OFF', currentReason:state.currentReason || 'Off Duty' }`,
  'signing current-status coverage options'
);
signing = replaceOnce(
  signing,
  `  if (!completedEvents.length) {`,
  `  if (!completedEvents.length && !rawCoverageResult.currentRestDerivedCoverage) {`,
  'derived current rest no-events guard'
);
write(signingPath, signing);

// ---------------------------------------------------------------------------
// Advisory HOS clocks: create a derived current-day rest segment when the app
// is OFF/SB and no raw row exists today. This makes 10h/34h progress continuous
// across midnight while preserving raw driver events.
// ---------------------------------------------------------------------------
const hosPath = 'source/src/core/hos/hosEngine.js';
let hos = read(hosPath);
hos = replaceOnce(
  hos,
  `  const ordered = changes.sort((a, b) => a.startAbs - b.startAbs || a.rawEndAbs - b.rawEndAbs || String(a.id).localeCompare(String(b.id)));
  const currentStatus = currentStatusFromState(stateLike, ordered);
  const out = [];`,
  `  let ordered = changes.sort((a, b) => a.startAbs - b.startAbs || a.rawEndAbs - b.rawEndAbs || String(a.id).localeCompare(String(b.id)));
  const currentStatus = currentStatusFromState(stateLike, ordered);
  const hasCurrentDayChange = ordered.some(event => event.dayKey === nowDay);
  if (!hasCurrentDayChange && isRestStatus(currentStatus) && nowMinute > 0) {
    const location = stateLike?.currentLocation || {};
    ordered = [...ordered, {
      id:\`hos_current_rest_\${nowDay}_\${currentStatus}\`,
      dayKey:nowDay,
      status:currentStatus,
      startMin:0,
      endMin:Math.max(1, nowMinute),
      startAbs:dayStartAbs(nowDay),
      rawEndAbs:nowAbs,
      endAbs:nowAbs,
      city:location.city || '',
      state:location.state || '',
      note:stateLike?.currentReason || (currentStatus === 'SB' ? 'Sleeper' : 'Off Duty'),
      description:'Current rest status derived for HOS clocks',
      source:'hos_current_status_derived',
      syntheticCoverage:true,
      displayOnly:true,
    }].sort((a, b) => a.startAbs - b.startAbs || a.rawEndAbs - b.rawEndAbs || String(a.id).localeCompare(String(b.id)));
  }
  const out = [];`,
  'derived current HOS rest segment'
);
hos = replaceOnce(
  hos,
  `    } else if (isRestStatus(event.status)) {
      endAbs = nowAbs;`,
  `    } else if (isRestStatus(event.status)) {
      endAbs = isRestStatus(currentStatus) ? nowAbs : rawEnd;`,
  'rest extension current-status guard'
);
hos = replaceOnce(
  hos,
  `      currentRest: restProgress ? {
        startAbs: restProgress.startAbs,
        endAbs: restProgress.endAbs,
        durationMinutes: clampDuration(restProgress.duration),
        minutesTo10HourReset: clampDuration(Math.max(0, 10 * HOUR - restProgress.duration)),
        minutesTo34HourRestart: clampDuration(Math.max(0, 34 * HOUR - restProgress.duration)),
      } : null,`,
  `      currentRest: restProgress ? {
        startAbs: restProgress.startAbs,
        endAbs: restProgress.endAbs,
        durationMinutes: clampDuration(restProgress.duration),
        minutesTo10HourReset: clampDuration(Math.max(0, 10 * HOUR - restProgress.duration)),
        minutesTo34HourRestart: clampDuration(Math.max(0, 34 * HOUR - restProgress.duration)),
        restartAtAbs:restProgress.startAbs + (34 * HOUR),
        restartComplete:restProgress.duration >= 34 * HOUR,
        status:restProgress.allSleeper ? 'SB' : (restProgress.statusSet?.has?.('OFF') ? 'OFF' : currentStatus),
      } : null,`,
  '34-hour restart metadata'
);
write(hosPath, hos);

// Stronger compact HOS panel with visible 34h restart progress.
write('source/src/modules/drive/HosCompactClocks.jsx', `import React from 'react';
import { calculateHosClocks, formatHosClockMinutes } from '../../core/hos/hosEngine.js';

function tone(clock = {}) {
  if (clock.expired || clock.tone === 'red') return 'bad';
  if (clock.warning || clock.tone === 'yellow') return 'warn';
  return 'ok';
}

function restartCopy(hos = {}) {
  const rest = hos.reset?.currentRest || null;
  const status = String(hos.currentStatus || '').toUpperCase();
  if (!rest || !['OFF','SB'].includes(status)) {
    return {
      tone:'idle',
      title:'34h restart',
      value:'Starts in OFF / SB',
      detail:'The countdown begins when a continuous rest block starts.',
    };
  }
  const left = Math.max(0, Number(rest.minutesTo34HourRestart || 0));
  if (left <= 0 || rest.restartComplete) {
    return {
      tone:'complete',
      title:'34h restart',
      value:'Complete',
      detail:\`Continuous rest \${formatHosClockMinutes(rest.durationMinutes)}\`,
    };
  }
  return {
    tone:left <= 240 ? 'soon' : 'active',
    title:'34h restart',
    value:\`In \${formatHosClockMinutes(left)}\`,
    detail:\`Rest so far \${formatHosClockMinutes(rest.durationMinutes)}\`,
  };
}

export default function HosCompactClocks({ state }) {
  const hos = React.useMemo(() => calculateHosClocks(state, new Date()), [state]);
  const items = [hos.break, hos.effectiveDrive || hos.drive, hos.shift, hos.cycle].filter(Boolean);
  const restart = restartCopy(hos);
  if (!items.length) return null;

  return (
    <div className="hos-compact-card" aria-label="Advisory HOS clocks">
      <div className="hos-compact-head">
        <b>HOS clocks</b>
        <span>Advisory · manual RODS</span>
      </div>
      <div className="hos-compact-grid">
        {items.map(clock => (
          <div key={clock.label} className={\`hos-compact-item \${tone(clock)}\`}>
            <span>{clock.label}</span>
            <b>{formatHosClockMinutes(clock.remainingMinutes)}</b>
          </div>
        ))}
      </div>
      <div className={\`hos-restart-strip-v988 \${restart.tone}\`}>
        <span><b>{restart.title}</b><em>{restart.detail}</em></span>
        <strong>{restart.value}</strong>
      </div>
    </div>
  );
}
`);

// ---------------------------------------------------------------------------
// Dedicated Logbook root. Days stay inside Logbook; Home is an explicit exit.
// ---------------------------------------------------------------------------
write('source/src/modules/logbook/LogbookHomeScreen.jsx', `import React, { useMemo, useState } from 'react';
import { addDays, localDayKey } from '../../shared/utils/date.js';
import { label } from '../../shared/utils/status.js';
import { displayEventsForDayFromState } from '../../core/timeline/displayTimeline.js';
import { rawStoredEventsForDay } from '../../core/compliance/rawRodsChecks.js';
import { calculateHosClocks, formatHosClockMinutes } from '../../core/hos/hosEngine.js';
import { validateLogForSigning } from './signing.js';

const SHORT = { OFF:'OFF', SB:'SB', D:'DRV', ON:'ON' };

function dayParts(day, today) {
  if (day === today) return { title:'Today', date:day };
  if (day === addDays(today, -1)) return { title:'Yesterday', date:day };
  const value = new Date(\`\${day}T12:00:00\`);
  if (Number.isNaN(value.getTime())) return { title:day, date:day };
  return {
    title:value.toLocaleDateString(undefined, { weekday:'long' }),
    date:value.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' }),
  };
}

function durationLabel(events = []) {
  const mins = events.reduce((sum, event) => sum + Math.max(0, Number(event.endMin || 0) - Number(event.startMin || 0)), 0);
  return formatHosClockMinutes(mins);
}

function statusForDay(state, day, today) {
  const raw = rawStoredEventsForDay(state.eventsByDay || {}, day);
  const last = raw.at(-1);
  if (last?.status) return last.status;
  if (day === today) {
    const live = String(state.currentStatus || 'OFF').toUpperCase();
    return ['OFF','SB','D','ON'].includes(live) ? (live === 'D' ? 'OFF' : live) : 'OFF';
  }
  return 'OFF';
}

function DayRow({ state, day, today, onOpen }) {
  const status = statusForDay(state, day, today);
  const raw = rawStoredEventsForDay(state.eventsByDay || {}, day);
  const events = displayEventsForDayFromState(state.eventsByDay || {}, day, {
    currentStatus:day === today ? state.currentStatus : undefined,
    currentReason:day === today ? state.currentReason : undefined,
    currentLocation:day === today ? state.currentLocation : undefined,
  });
  const issues = day < today ? validateLogForSigning(state, day).filter(issue => !/active_day/i.test(String(issue.code || ''))).length : 0;
  const certified = state.certifyStatus?.[day] === 'Certified' && !!state.signatureByDay?.[day]?.signed;
  const parts = dayParts(day, today);
  const stateCopy = day === today
    ? \`\${label(status)} · Active\`
    : certified
      ? 'Signed'
      : raw.length
        ? (issues ? \`\${issues} review\` : 'Open')
        : 'No stored events';

  return (
    <button type="button" className="logbook-day-row-v988" onClick={() => onOpen?.(day)}>
      <span className={\`logbook-day-status-v988 \${status}\`}>{SHORT[status] || status}</span>
      <span className="logbook-day-copy-v988">
        <b>{parts.title}</b>
        <em>{parts.date} · {durationLabel(events)}</em>
      </span>
      <span className={\`logbook-day-state-v988 \${issues ? 'warn' : certified ? 'done' : ''}\`}>{stateCopy}</span>
      <i>›</i>
    </button>
  );
}

export default function LogbookHomeScreen({
  state,
  onHome,
  onOpenDay,
  onOpenUnsigned,
  onOpenDot,
  onOpenStatus,
}) {
  const today = localDayKey();
  const [targetDay, setTargetDay] = useState(today);
  const days = useMemo(() => Array.from({ length:14 }, (_, index) => addDays(today, -index)), [today]);
  const hos = useMemo(() => calculateHosClocks(state, new Date()), [state]);
  const rest = hos.reset?.currentRest || null;
  const restartLeft = Math.max(0, Number(rest?.minutesTo34HourRestart || 0));
  const restActive = ['OFF','SB'].includes(String(hos.currentStatus || '').toUpperCase());
  const restartTitle = restActive && rest
    ? (restartLeft <= 0 ? '34h restart complete' : \`34h restart in \${formatHosClockMinutes(restartLeft)}\`)
    : '34h restart waiting for OFF / SB';
  const restartDetail = restActive && rest
    ? \`Continuous rest: \${formatHosClockMinutes(rest.durationMinutes)}\`
    : 'Change to OFF DUTY or SLEEPER to start continuous rest tracking.';

  return (
    <section className="screen logbook-home-screen-v988">
      <header className="logbook-home-head-v988">
        <button type="button" onClick={onHome} aria-label="Home">⌂</button>
        <div><span>Road Ready</span><b>Logbook</b></div>
        <button type="button" onClick={onOpenStatus}>Status</button>
      </header>

      <main className="logbook-home-body-v988">
        <section className={\`logbook-reset-card-v988 \${restartLeft <= 0 && restActive ? 'complete' : restActive ? 'active' : 'idle'}\`}>
          <div><span>Current duty</span><b>{label(statusForDay(state, today, today))}</b></div>
          <div><span>Cycle reset</span><b>{restartTitle}</b><em>{restartDetail}</em></div>
        </section>

        <div className="logbook-quick-actions-v988">
          <button type="button" className="primary" onClick={() => onOpenDay?.(today)}>Open today</button>
          <button type="button" onClick={onOpenUnsigned}>Unsigned</button>
          <button type="button" onClick={onOpenDot}>DOT</button>
        </div>

        <section className="logbook-date-jump-v988">
          <div><b>Open any log date</b><span>Navigate without leaving Logbook.</span></div>
          <input type="date" value={targetDay} max={today} onChange={event => setTargetDay(event.target.value || today)} />
          <button type="button" onClick={() => onOpenDay?.(targetDay || today)}>Open</button>
        </section>

        <section className="logbook-days-card-v988">
          <div className="logbook-days-title-v988"><b>Recent log days</b><span>14 days</span></div>
          <div className="logbook-days-list-v988">
            {days.map(day => <DayRow key={day} state={state} day={day} today={today} onOpen={onOpenDay} />)}
          </div>
        </section>
      </main>
    </section>
  );
}
`);

// App navigation: Home -> Logbook root -> day; day Back -> Logbook root.
// A dedicated Home action exits the Logbook.
const appPath = 'source/src/app/App.jsx';
let app = read(appPath);
app = replaceOnce(
  app,
  `import HomeScreen from '../modules/home/HomeScreen.jsx';`,
  `import HomeScreen from '../modules/home/HomeScreen.jsx';
import LogbookHomeScreen from '../modules/logbook/LogbookHomeScreen.jsx';`,
  'Logbook root import'
);
app = replaceOnce(
  app,
  `  const events = useMemo(() => displayEventsForDayFromState(state.eventsByDay || {}, state.activeDay), [state.eventsByDay, state.activeDay]);`,
  `  const events = useMemo(() => displayEventsForDayFromState(state.eventsByDay || {}, state.activeDay, {
    currentStatus:state.currentStatus,
    currentReason:state.currentReason,
    currentLocation:state.currentLocation,
  }), [state.eventsByDay, state.activeDay, state.currentStatus, state.currentReason, state.currentLocation]);`,
  'App current-day display options'
);
app = replaceOnce(
  app,
  `  function backToLogs() {
    setState(s => ({ ...s, view:'logs', sheet:null, selectMode:false, selectedIds:[] }));
  }`,
  `  function openLogbook() {
    setState(s => ({ ...s, view:'logbook', sheet:null, selectMode:false, selectedIds:[] }));
  }

  function backToLogs() {
    setState(s => ({ ...s, view:'logbook', sheet:null, selectMode:false, selectedIds:[] }));
  }

  function goHome() {
    setState(s => ({ ...s, view:'logs', sheet:null, selectMode:false, selectedIds:[] }));
  }`,
  'Logbook navigation functions'
);
app = replaceOnce(
  app,
  `  if (state.view === 'logs') return (`,
  `  if (state.view === 'logbook') return (
    <>
      {updateBanner}
      <LogbookHomeScreen
        state={state}
        onHome={goHome}
        onOpenDay={openDay}
        onOpenUnsigned={()=>setState(s=>({ ...s, view:'unsigned', sheet:null }))}
        onOpenDot={()=>setState(s=>({ ...s, view:'dot', sheet:null }))}
        onOpenStatus={()=>setState(s=>({ ...s, sheet:{ type:'status' } }))}
      />
      {state.sheet?.type === 'status' && <StatusWorkflowSheet state={{...state, currentStatus: state.currentStatus || 'OFF', currentReason: state.currentReason || 'Off Duty', currentLocation: state.currentLocation}} onClose={()=>setState(s=>({ ...s, sheet:null }))} onApplyStatus={closeLastAndAddStatus} onStartDriving={startDrivingFromStatus} />}
    </>
  );

  if (state.view === 'logs') return (`,
  'Logbook root render'
);
app = replaceOnce(
  app,
  `        onOpenDay={openDay}
        onReset={reset}`,
  `        onOpenDay={openDay}
        onOpenLogbook={openLogbook}
        onReset={reset}`,
  'Home opens Logbook root'
);
app = replaceOnce(
  app,
  `      <UnsignedLogsScreen
      state={state}
      days={signableLogDays(state)}
      onBack={()=>setState(s=>({ ...s, view:'logs', sheet:null }))}`,
  `      <UnsignedLogsScreen
      state={state}
      days={signableLogDays(state)}
      onBack={()=>setState(s=>({ ...s, view:'logbook', sheet:null }))}`,
  'Unsigned returns to Logbook'
);
app = replaceOnce(
  app,
  `        onBack={backToLogs}
        onSelect={(id)=>setState(s=>({ ...s, selectedEventId:id }))}`,
  `        onBack={backToLogs}
        onHome={goHome}
        onOpenDay={openDay}
        onSelect={(id)=>setState(s=>({ ...s, selectedEventId:id }))}`,
  'Day Log navigation props'
);
write(appPath, app);

// Home command center opens the dedicated Logbook root.
const homePath = 'source/src/modules/home/HomeScreen.jsx';
let home = read(homePath);
home = replaceOnce(
  home,
  `import { displayEventsForDay } from '../../core/timeline/displayTimeline.js';`,
  `import { displayEventsForDayFromState } from '../../core/timeline/displayTimeline.js';`,
  'Home display timeline import'
);
home = replaceOnce(
  home,
  `  const events = displayEventsForDay(raw, day === today);`,
  `  const events = displayEventsForDayFromState(state.eventsByDay || {}, day, {
    currentStatus:day === today ? state.currentStatus : undefined,
    currentReason:day === today ? state.currentReason : undefined,
    currentLocation:day === today ? state.currentLocation : undefined,
  });`,
  'Home current-day OFF line'
);
home = replaceOnce(
  home,
  `  onOpenDay,
  onOpenStatus,`,
  `  onOpenDay,
  onOpenLogbook,
  onOpenStatus,`,
  'Home Logbook prop'
);
home = replaceOnce(
  home,
  `{ icon:'log', title:'Logbook', detail:\`\${summary.label} · \${unsigned ? \`\${unsigned} unsigned\` : 'up to date'}\`, metric:'Open', tone:'blue', onClick:() => onOpenDay?.(today) },`,
  `{ icon:'log', title:'Logbook', detail:\`\${summary.label} · \${unsigned ? \`\${unsigned} unsigned\` : 'up to date'}\`, metric:'Open', tone:'blue', onClick:() => (onOpenLogbook ? onOpenLogbook() : onOpenDay?.(today)) },`,
  'Home Logbook module route'
);
home = replaceOnce(
  home,
  `<div className="command-section-title"><span>Hours of service</span><button type="button" onClick={() => onOpenDay?.(today)}>Open log</button></div>`,
  `<div className="command-section-title"><span>Hours of service</span><button type="button" onClick={() => (onOpenLogbook ? onOpenLogbook() : onOpenDay?.(today))}>Open logbook</button></div>`,
  'Home HOS Logbook route'
);
write(homePath, home);

// Day navigation: Back returns to Logbook, tab Back first returns to Log,
// previous/next stay inside Logbook, and Home is an explicit button.
const dayPath = 'source/src/modules/logbook/DayLogScreen.jsx';
let day = read(dayPath);
day = replaceOnce(
  day,
  `import { isToday, localDayKey } from '../../shared/utils/date.js';`,
  `import { addDays, isToday, localDayKey } from '../../shared/utils/date.js';`,
  'Day navigation date import'
);
day = replaceOnce(
  day,
  `  state, liveCurrent, events, selectedEvent, onBack, onSelect, onOpenAdd, onOpenEdit, onDelete,`,
  `  state, liveCurrent, events, selectedEvent, onBack, onHome, onOpenDay, onSelect, onOpenAdd, onOpenEdit, onDelete,`,
  'Day navigation props'
);
day = replaceOnce(
  day,
  `    () => displayEventsForDayFromState(state.eventsByDay || {}, state.activeDay),
    [state.eventsByDay, state.activeDay]`,
  `    () => displayEventsForDayFromState(state.eventsByDay || {}, state.activeDay, {
      currentStatus:state.currentStatus,
      currentReason:state.currentReason,
      currentLocation:state.currentLocation,
    }),
    [state.eventsByDay, state.activeDay, state.currentStatus, state.currentReason, state.currentLocation]`,
  'Day current OFF display'
);
day = replaceOnce(
  day,
  `  const tz = homeTerminalConfigFromState(state);

  return (`,
  `  function handleLogbookBack() {
    if (activeTab !== 'log') {
      setActiveTab('log');
      return;
    }
    onBack?.();
  }

  const tz = homeTerminalConfigFromState(state);
  const todayKey = localDayKey();
  const canOpenNextDay = String(state.activeDay || '') < todayKey;

  return (`,
  'Day Back behavior'
);
day = replaceOnce(
  day,
  `      <Header title={title(state.activeDay)} onBack={onBack} onRight={onTools} />
      <div className="log-timezone-note">Home terminal time: {tz.label} ({tz.timeZone} · {tz.shortLabel})</div>`,
  `      <Header title={title(state.activeDay)} onBack={handleLogbookBack} onRight={onTools} />
      <div className="logbook-day-nav-v988">
        <button type="button" onClick={() => onOpenDay?.(addDays(state.activeDay, -1))}>‹ Day</button>
        <button type="button" className="home" onClick={onHome}>⌂ Home</button>
        <button type="button" disabled={!canOpenNextDay} onClick={() => canOpenNextDay && onOpenDay?.(addDays(state.activeDay, 1))}>Day ›</button>
      </div>
      <div className="log-timezone-note">Home terminal time: {tz.label} ({tz.timeZone} · {tz.shortLabel})</div>`,
  'Day previous next and Home navigation'
);
write(dayPath, day);

// Styles.
const stylesPath = 'source/src/styles.css';
let styles = read(stylesPath);
styles = appendOnce(styles, '/* v98.8 logbook integrity + navigation */', `
/* v98.8 logbook integrity + navigation */
.logbook-home-screen-v988{
  min-height:100dvh;
  max-width:760px;
  margin:0 auto;
  color:#101828;
  background:linear-gradient(180deg,#f7f9fc 0%,#eef3f8 100%);
}
.logbook-home-head-v988{
  position:sticky;
  top:0;
  z-index:40;
  min-height:78px;
  padding:calc(env(safe-area-inset-top) + 8px) 14px 10px;
  box-sizing:border-box;
  display:grid;
  grid-template-columns:52px minmax(0,1fr) 72px;
  align-items:center;
  gap:10px;
  border-bottom:1px solid #dbe4ef;
  background:rgba(248,250,252,.94);
  backdrop-filter:blur(18px);
  -webkit-backdrop-filter:blur(18px);
}
.logbook-home-head-v988>button{
  min-height:44px;
  border:1px solid #d6e0ec;
  border-radius:15px;
  background:#fff;
  color:#1d2939;
  font-size:14px;
  font-weight:950;
  box-shadow:0 4px 12px rgba(15,23,42,.05);
}
.logbook-home-head-v988>button:first-child{font-size:23px;}
.logbook-home-head-v988>div{text-align:center;min-width:0;}
.logbook-home-head-v988 span,
.logbook-home-head-v988 b{display:block;}
.logbook-home-head-v988 span{color:#667085;font-size:10px;font-weight:950;letter-spacing:.13em;text-transform:uppercase;}
.logbook-home-head-v988 b{margin-top:2px;font-size:24px;line-height:1;font-weight:1000;letter-spacing:-.035em;}
.logbook-home-body-v988{padding:14px 12px calc(32px + env(safe-area-inset-bottom));}
.logbook-reset-card-v988{
  border:1px solid #d8e3ef;
  border-radius:22px;
  padding:15px;
  display:grid;
  grid-template-columns:minmax(110px,.72fr) minmax(0,1.45fr);
  gap:12px;
  background:#fff;
  box-shadow:0 9px 25px rgba(15,23,42,.07);
}
.logbook-reset-card-v988>div{min-width:0;}
.logbook-reset-card-v988 span,
.logbook-reset-card-v988 b,
.logbook-reset-card-v988 em{display:block;}
.logbook-reset-card-v988 span{color:#667085;font-size:10px;font-weight:950;letter-spacing:.1em;text-transform:uppercase;}
.logbook-reset-card-v988 b{margin-top:5px;color:#101828;font-size:16px;font-weight:1000;line-height:1.15;}
.logbook-reset-card-v988 em{margin-top:4px;color:#667085;font-size:11px;font-style:normal;font-weight:750;line-height:1.35;}
.logbook-reset-card-v988.active{border-color:#93c5fd;background:linear-gradient(145deg,#eff6ff,#fff);}
.logbook-reset-card-v988.complete{border-color:#86efac;background:linear-gradient(145deg,#ecfdf3,#fff);}
.logbook-quick-actions-v988{display:grid;grid-template-columns:1.35fr 1fr 1fr;gap:8px;margin-top:11px;}
.logbook-quick-actions-v988 button,
.logbook-date-jump-v988 button{
  min-height:46px;
  border:1px solid #d5dfeb;
  border-radius:15px;
  background:#fff;
  color:#1d2939;
  font-size:13px;
  font-weight:950;
}
.logbook-quick-actions-v988 button.primary{
  border-color:#2f5bd8;
  background:#2f5bd8;
  color:#fff;
}
.logbook-date-jump-v988{
  margin-top:11px;
  padding:13px;
  border:1px solid #d8e3ef;
  border-radius:19px;
  display:grid;
  grid-template-columns:minmax(0,1fr) 146px 68px;
  align-items:center;
  gap:8px;
  background:#fff;
}
.logbook-date-jump-v988 b,
.logbook-date-jump-v988 span{display:block;}
.logbook-date-jump-v988 b{font-size:13px;font-weight:1000;}
.logbook-date-jump-v988 span{margin-top:2px;color:#667085;font-size:10px;font-weight:750;}
.logbook-date-jump-v988 input{
  min-width:0;
  height:44px;
  box-sizing:border-box;
  border:1px solid #d5dfeb;
  border-radius:13px;
  padding:0 8px;
  background:#f8fafc;
  color:#101828;
  font-size:13px;
  font-weight:850;
}
.logbook-days-card-v988{
  margin-top:12px;
  border:1px solid #d8e3ef;
  border-radius:22px;
  overflow:hidden;
  background:#fff;
  box-shadow:0 8px 22px rgba(15,23,42,.05);
}
.logbook-days-title-v988{padding:13px 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e6edf5;}
.logbook-days-title-v988 b{font-size:15px;font-weight:1000;}
.logbook-days-title-v988 span{color:#667085;font-size:11px;font-weight:850;}
.logbook-day-row-v988{
  width:100%;
  min-height:68px;
  border:0;
  border-bottom:1px solid #edf1f6;
  padding:9px 11px;
  display:grid;
  grid-template-columns:46px minmax(0,1fr) auto 14px;
  align-items:center;
  gap:10px;
  text-align:left;
  background:#fff;
  color:#101828;
}
.logbook-day-row-v988:last-child{border-bottom:0;}
.logbook-day-row-v988:active{background:#f8fafc;}
.logbook-day-status-v988{
  width:43px;
  height:43px;
  border-radius:14px;
  display:grid;
  place-items:center;
  font-size:11px;
  font-weight:1000;
  background:#eef2f6;
  color:#344054;
}
.logbook-day-status-v988.OFF{background:#eef2ff;color:#3730a3;}
.logbook-day-status-v988.SB{background:#f3e8ff;color:#7e22ce;}
.logbook-day-status-v988.D{background:#dbeafe;color:#1d4ed8;}
.logbook-day-status-v988.ON{background:#ffedd5;color:#c2410c;}
.logbook-day-copy-v988{min-width:0;}
.logbook-day-copy-v988 b,
.logbook-day-copy-v988 em{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.logbook-day-copy-v988 b{font-size:14px;font-weight:1000;}
.logbook-day-copy-v988 em{margin-top:3px;color:#667085;font-size:11px;font-style:normal;font-weight:750;}
.logbook-day-state-v988{
  max-width:112px;
  color:#475467;
  font-size:10px;
  font-weight:900;
  text-align:right;
}
.logbook-day-state-v988.warn{color:#b54708;}
.logbook-day-state-v988.done{color:#027a48;}
.logbook-day-row-v988>i{color:#98a2b3;font-size:23px;font-style:normal;}
.logbook-day-nav-v988{
  margin:8px 10px 0;
  display:grid;
  grid-template-columns:1fr 1fr 1fr;
  gap:7px;
}
.logbook-day-nav-v988 button{
  min-height:39px;
  border:1px solid #d8e0eb;
  border-radius:13px;
  background:#fff;
  color:#344054;
  font-size:12px;
  font-weight:950;
}
.logbook-day-nav-v988 button.home{
  border-color:#2f5bd8;
  background:#eef4ff;
  color:#2347b5;
}
.logbook-day-nav-v988 button:disabled{opacity:.38;}
.hos-restart-strip-v988{
  margin-top:10px;
  padding:10px 11px;
  border:1px solid #d8e3ef;
  border-radius:15px;
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  align-items:center;
  gap:10px;
  background:#f8fafc;
}
.hos-restart-strip-v988 span,
.hos-restart-strip-v988 b,
.hos-restart-strip-v988 em{display:block;}
.hos-restart-strip-v988 b{font-size:12px;font-weight:1000;}
.hos-restart-strip-v988 em{margin-top:2px;color:#667085;font-size:10px;font-style:normal;font-weight:750;}
.hos-restart-strip-v988 strong{font-size:13px;font-weight:1000;white-space:nowrap;}
.hos-restart-strip-v988.active{border-color:#93c5fd;background:#eff6ff;color:#1d4ed8;}
.hos-restart-strip-v988.soon{border-color:#fbbf24;background:#fffbeb;color:#92400e;}
.hos-restart-strip-v988.complete{border-color:#86efac;background:#ecfdf3;color:#027a48;}
@media(max-width:430px){
  .logbook-date-jump-v988{grid-template-columns:1fr 132px;}
  .logbook-date-jump-v988>button{grid-column:1/3;}
  .logbook-reset-card-v988{grid-template-columns:1fr;}
  .logbook-day-row-v988{grid-template-columns:43px minmax(0,1fr) auto 12px;gap:8px;}
  .logbook-day-state-v988{max-width:88px;}
}
`);
write(stylesPath, styles);

// Version metadata.
const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v98.8-logbook-integrity-navigation',
  releasedAt:RELEASED_AT,
  notes:[
    'Recognizes an empty current day as the driver’s active OFF DUTY or SLEEPER status for display and DOT coverage checks without creating fake stored duty events.',
    'Shows today’s duty line from midnight to now and carries valid OFF/SB rest across midnight for 10-hour and 34-hour reset calculations.',
    'Adds a visible 34-hour restart countdown/completion panel to the HOS clocks and the new Logbook home.',
    'Adds a dedicated Logbook home, previous/next day navigation, date jump, and an explicit Home button; Back from a log day now stays inside Logbook.',
    'Preserves scanner/OCR, route, load, DOT, wallet, business, signature, and historical log data.'
  ],
  label:'v98.8 Logbook Integrity & Navigation',
  updatedAt:RELEASED_AT
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

// Functional and integration verification.
const cacheKey = `v988_${Date.now()}`;
const { localDayKey } = await import(`${pathToFileURL(file('source/src/shared/utils/date.js')).href}?${cacheKey}`);
const { rawCoverageIssues } = await import(`${pathToFileURL(file(coveragePath)).href}?${cacheKey}`);
const { displayEventsForDayFromState } = await import(`${pathToFileURL(file(displayPath)).href}?${cacheKey}`);
const { calculateHosClocks } = await import(`${pathToFileURL(file(hosPath)).href}?${cacheKey}`);

const today = localDayKey();
const offCoverage = rawCoverageIssues({ [today]:[] }, today, {
  currentStatus:'OFF',
  currentReason:'Off Duty',
  currentLocation:{ city:'Chicago', state:'IL' },
});
if (offCoverage.targetEnd > 0 && (!offCoverage.currentRestDerivedCoverage || offCoverage.issues.length)) {
  throw new Error('v98.8 current OFF DUTY coverage verification failed');
}

const displayed = displayEventsForDayFromState({ [today]:[] }, today, {
  currentStatus:'OFF',
  currentReason:'Off Duty',
  currentLocation:{ city:'Chicago', state:'IL' },
  nowMinute:600,
});
if (displayed.length !== 1 || displayed[0].status !== 'OFF' || displayed[0].startMin !== 0 || displayed[0].endMin !== 600) {
  throw new Error('v98.8 current-day OFF line verification failed');
}

const clockState = {
  eventsByDay:{
    '2026-07-13':[{
      id:'off_previous',
      status:'OFF',
      startMin:0,
      endMin:1440,
      city:'Chicago',
      state:'IL',
      note:'Off Duty',
      source:'manual',
    }],
    '2026-07-14':[],
  },
  currentStatus:'OFF',
  currentReason:'Off Duty',
  currentLocation:{ city:'Chicago', state:'IL' },
  settings:{ homeTerminalTimeZone:'UTC' },
  homeTerminalTimeZone:'UTC',
};
const clockResult = calculateHosClocks(clockState, new Date('2026-07-14T12:00:00.000Z'));
if (!clockResult.reset?.currentRest || clockResult.reset.currentRest.durationMinutes < 2160 || clockResult.reset.currentRest.minutesTo34HourRestart !== 0) {
  throw new Error(`v98.8 34h restart verification failed: ${JSON.stringify(clockResult.reset?.currentRest || null)}`);
}

const verifyApp = read(appPath);
const verifyDay = read(dayPath);
const verifyHome = read(homePath);
if (!verifyApp.includes("state.view === 'logbook'") || !verifyApp.includes('onHome={goHome}') || !verifyApp.includes('onOpenLogbook={openLogbook}')) {
  throw new Error('v98.8 Logbook App navigation verification failed');
}
if (!verifyDay.includes('handleLogbookBack') || !verifyDay.includes('⌂ Home') || !verifyDay.includes('addDays(state.activeDay, -1)')) {
  throw new Error('v98.8 day navigation verification failed');
}
if (!verifyHome.includes('Open logbook') || !fs.existsSync(file('source/src/modules/logbook/LogbookHomeScreen.jsx'))) {
  throw new Error('v98.8 Logbook home verification failed');
}

console.log('v98.8 logbook integrity and navigation materialized');
