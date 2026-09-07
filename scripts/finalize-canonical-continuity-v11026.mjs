import fs from 'node:fs';
import assert from 'node:assert/strict';

function replaceExact(source, before, after, label) {
  if (source.includes(after)) return source;
  assert.ok(source.includes(before), `110.2.6 anchor missing: ${label}`);
  return source.replace(before, after);
}

// ---------------------------------------------------------------------------
// Effective timeline: search every earlier stored date, rather than stopping
// after 14 empty dates. This allows an unchanged OFF/SB/ON status to remain one
// continuous body through long stretches without a new status transition.
// ---------------------------------------------------------------------------
{
  const path='source/src/core/timeline/displayTimeline.js';
  let source=fs.readFileSync(path,'utf8');
  source=replaceExact(source,
`function previousLastEvent(eventsByDay = {}, dayKey = '') {
  let cursor = dayKey;
  for (let i = 0; i < 14; i += 1) {
    cursor = addDays(cursor, -1);
    const events = realDisplayBase(eventsByDay?.[cursor] || []).filter(e => Number(e.endMin || 0) > Number(e.startMin || 0));
    if (events.length) return events[events.length - 1];
  }
  return null;
}`,
`function previousLastEvent(eventsByDay = {}, dayKey = '') {
  const previousDays = Object.keys(eventsByDay || {}).filter(day => day < dayKey).sort().reverse();
  for (const previousDay of previousDays) {
    const events = realDisplayBase(eventsByDay?.[previousDay] || []).filter(e => Number(e.endMin || 0) > Number(e.startMin || 0));
    if (events.length) return events[events.length - 1];
  }
  return null;
}`,'all-prior display continuity');
  fs.writeFileSync(path,source);
}

// ---------------------------------------------------------------------------
// RODS coverage uses the same carry rule. Historical empty days become a
// complete derived day for review/signing, without silently writing raw rows.
// ---------------------------------------------------------------------------
{
  const path='source/src/core/compliance/rawRodsChecks.js';
  let source=fs.readFileSync(path,'utf8');
  source=replaceExact(source,
`function previousRawEvent(eventsByDay = {}, day = '') {
  let cursor = day;
  for (let i = 0; i < 14; i += 1) {
    cursor = addDays(cursor, -1);
    const events = rawStoredEventsForDay(eventsByDay, cursor);
    if (events.length) return events[events.length - 1];
  }
  return null;
}`,
`function previousRawEvent(eventsByDay = {}, day = '') {
  const previousDays = Object.keys(eventsByDay || {}).filter(key => key < day).sort().reverse();
  for (const previousDay of previousDays) {
    const events = rawStoredEventsForDay(eventsByDay, previousDay);
    if (events.length) return events[events.length - 1];
  }
  return null;
}`,'all-prior RODS continuity');

  source=replaceExact(source,
`function currentRestCoverageStatus(current, rawCompleted = [], previousDayEvent = null, options = {}) {
  if (!current || rawCompleted.length) return '';
  const explicit = String(options.currentStatus || '').trim().toUpperCase();
  if (explicit === 'OFF' || explicit === 'SB') return explicit;
  const previousStatus = String(previousDayEvent?.status || '').toUpperCase();
  const previousReachedMidnight = Number(previousDayEvent?.endMin || 0) >= 1438;
  if (previousReachedMidnight && (previousStatus === 'OFF' || previousStatus === 'SB')) return previousStatus;
  return '';
}`,
`function currentRestCoverageStatus(current, rawCompleted = [], previousDayEvent = null, options = {}) {
  if (!current || rawCompleted.length) return '';
  const explicit = String(options.currentStatus || '').trim().toUpperCase();
  if (statusCanCarryAcrossMidnight(explicit)) return explicit;
  const previousStatus = String(previousDayEvent?.status || '').toUpperCase();
  if (statusCanCarryAcrossMidnight(previousStatus)) return previousStatus;
  return '';
}`,'current OFF/SB/ON continuity');

  source=replaceExact(source,
`export function rawCoverageIssues(eventsByDay = {}, day = '', options = {}) {
  const today = localDayKey();`,
`export function rawCoverageIssues(eventsByDay = {}, day = '', options = {}) {
  const today = options.today || localDayKey();`,'coverage day override');

  source=replaceExact(source,
`  if (currentRestStatus && targetEnd > 0) {
    const loc = usableLocation(rawCompleted[0], previousDayEvent, options.currentLocation);
    return {
      events,
      issues,
      total: targetEnd,
      targetEnd,
      current,
      future,
      currentRestDerivedCoverage: true,
      derivedCoverageEvent: {
        id:\`current_rest_coverage_\${day}_\${currentRestStatus}\`,
        status:currentRestStatus,
        startMin:0,
        endMin:targetEnd,
        city:loc.city || '',
        state:loc.state || '',
        note:statusNote(currentRestStatus),
        description:'Current rest/off-duty coverage derived for checks only',
        source:'current_rest_coverage_derived',
        displayOnly:true,
        syntheticCoverage:true,
      },
    };
  }

  if (isRestOnlyCoverageDay(coverageBaseV1036) && targetEnd > 0) {`,
`  if (currentRestStatus && targetEnd > 0) {
    const loc = usableLocation(rawCompleted[0], previousDayEvent, options.currentLocation);
    return {
      events,
      issues,
      total: targetEnd,
      targetEnd,
      current,
      future,
      currentRestDerivedCoverage: true,
      derivedCoverageEvent: {
        id:\`current_rest_coverage_\${day}_\${currentRestStatus}\`,
        status:currentRestStatus,
        startMin:0,
        endMin:targetEnd,
        city:loc.city || '',
        state:loc.state || '',
        note:statusNote(currentRestStatus),
        description:'Current duty coverage derived for checks only',
        source:'current_rest_coverage_derived',
        displayOnly:true,
        syntheticCoverage:true,
      },
    };
  }

  if (!current && !rawCompleted.length && previousDayEvent && targetEnd > 0) {
    const status = String(previousDayEvent.status || '').trim().toUpperCase();
    if (statusCanCarryAcrossMidnight(status)) {
      const loc = usableLocation(previousDayEvent, options.currentLocation);
      const derived = {
        id:\`carried_full_day_\${day}_\${status}\`,
        status, startMin:0, endMin:targetEnd,
        city:loc.city || '', state:loc.state || '', note:statusNote(status), description:'',
        source:'carried_status_derived', displayOnly:true, syntheticCoverage:true, carriedFromPreviousDay:true,
      };
      return { events:[derived], issues, total:targetEnd, targetEnd, current, future, carriedFullDayCoverage:true, derivedCoverageEvent:derived };
    }
  }

  if (isRestOnlyCoverageDay(coverageBaseV1036) && targetEnd > 0) {`,'historical carried full-day coverage');
  fs.writeFileSync(path,source);
}

// ---------------------------------------------------------------------------
// Signing: include carried completed dates in Unsigned Logs. A derived carried
// day is made concrete only after the driver explicitly taps Sign.
// ---------------------------------------------------------------------------
{
  const path='source/src/modules/logbook/signing.js';
  let source=fs.readFileSync(path,'utf8');
  source=replaceExact(source,
`import { displayEventsForDay } from '../../core/timeline/displayTimeline.js';`,
`import { displayEventsForDay, displayEventsForDayFromState } from '../../core/timeline/displayTimeline.js';`,'signing display import');
  source=replaceExact(source,
`import { certificationStatusV1032 } from './certificationV110.js';`,
`import { certificationStatusV1032 } from './certificationV110.js';
import { historicalContinuityDaysV11026 } from './continuityV11026.js';`,'continuity signing import');
  source=replaceExact(source,
`export function completedLogDays(state) {
  const today = localDayKey();
  return Object.keys(state.eventsByDay || {})
    .filter(day => day < today && hasRealEvents(state.eventsByDay?.[day] || []))
    .sort()
    .reverse();
}`,
`export function completedLogDays(state) {
  return historicalContinuityDaysV11026(state, localDayKey());
}`,'continuous completed days');
  source=replaceExact(source,
`  const rawEvents = rawStoredEventsForDay(state.eventsByDay || {}, day);
  const events = canonicalSigningMinuteBoundaries(rawEvents);
  const rawCoverageResult = rawCoverageIssues(state.eventsByDay || {}, day, liveCoverageOptionsV1036(state));`,
`  const rawEvents = rawStoredEventsForDay(state.eventsByDay || {}, day);
  const coverageOptions = { ...liveCoverageOptionsV1036(state), today };
  const rawCoverageResult = rawCoverageIssues(state.eventsByDay || {}, day, coverageOptions);
  const certificationEvents = rawEvents.length ? rawEvents : (rawCoverageResult.derivedCoverageEvent ? [rawCoverageResult.derivedCoverageEvent] : []);
  const events = canonicalSigningMinuteBoundaries(certificationEvents);`,'derived events available to signing review');
  fs.writeFileSync(path,source);
}

// ---------------------------------------------------------------------------
// Day screen: normal viewing uses canonical effective rows. Selection/move mode
// continues to expose exact raw rows. Carry-only rows are shown but not editable.
// ---------------------------------------------------------------------------
{
  const path='source/src/modules/logbook/DayLogScreen.jsx';
  let source=fs.readFileSync(path,'utf8');
  source=replaceExact(source,
`  const eventListEvents = useMemo(
    () => (bulkPreviewEvents || []).filter(event => !event.displayOnly && !event.carriedFromPreviousDay).map(event => enrichLoadEventFromLinkedRoute(state, state.activeDay, event)),
    [bulkPreviewEvents, state.routeLegsByDay, state.activeDay]
  );`,
`  const eventListEvents = useMemo(
    () => ((state.selectMode || isMoving || bulkMoveDelta)
      ? (bulkPreviewEvents || []).filter(event => !event.displayOnly && !event.carriedFromPreviousDay)
      : (displayEvents || []))
      .map(event => enrichLoadEventFromLinkedRoute(state, state.activeDay, event)),
    [state.selectMode, isMoving, bulkMoveDelta, bulkPreviewEvents, displayEvents, state.routeLegsByDay, state.activeDay]
  );`,'canonical event list');
  fs.writeFileSync(path,source);
}

{
  const path='source/src/modules/logbook/EventList.jsx';
  let source=fs.readFileSync(path,'utf8');
  source=replaceExact(source,
`        const selected = selectedId === event.id;
        const checked = selectedIds.includes(event.id);`,
`        const selected = selectedId === event.id;
        const checked = selectedIds.includes(event.id);
        const continuityOnly = !!event.displayOnly || !!event.carriedFromPreviousDay || !!event.syntheticCoverage;`,'carry row marker');
  source=replaceExact(source,
`            className={\`event-row clean-event-row \${selected ? 'selected' : ''} \${selectMode && checked ? 'bulk-selected checked' : ''} \${selectMode ? 'selectable' : ''}\`}
            onClick={() => selectMode ? onToggleSelected(event.id) : onOpenEdit(event.id)}`,
`            className={\`event-row clean-event-row \${selected ? 'selected' : ''} \${selectMode && checked ? 'bulk-selected checked' : ''} \${selectMode ? 'selectable' : ''} \${continuityOnly ? 'continuity-only-v11026' : ''}\`}
            onClick={() => continuityOnly ? undefined : (selectMode ? onToggleSelected(event.id) : onOpenEdit(event.id))}`,'carry row click guard');
  source=replaceExact(source,
`            {selectMode ? (
              <input className="event-check" type="checkbox" readOnly checked={checked} />`,
`            {selectMode && !continuityOnly ? (
              <input className="event-check" type="checkbox" readOnly checked={checked} />`,'carry row selection guard');
  source=replaceExact(source,
`            {selectMode ? (
              <button className="blue-edit select-tick-v9589" onClick={(e)=>{ e.stopPropagation(); onToggleSelected(event.id); }}>
                {checked ? 'Selected' : 'Select'}
              </button>
            ) : (
              <button className="blue-edit" onClick={(e)=>{ e.stopPropagation(); onOpenEdit(event.id); }}>Edit</button>
            )}`,
`            {continuityOnly ? (
              <span className="event-continuity-tag-v11026">{event.isLive ? 'Now' : 'Sign'}</span>
            ) : selectMode ? (
              <button className="blue-edit select-tick-v9589" onClick={(e)=>{ e.stopPropagation(); onToggleSelected(event.id); }}>
                {checked ? 'Selected' : 'Select'}
              </button>
            ) : (
              <button className="blue-edit" onClick={(e)=>{ e.stopPropagation(); onOpenEdit(event.id); }}>Edit</button>
            )}`,'carry row sign tag');
  fs.writeFileSync(path,source);
}

{
  const path='source/src/styles.css';
  let source=fs.readFileSync(path,'utf8');
  if(!source.includes('CANONICAL_CONTINUITY_V11026')) source += `
/* CANONICAL_CONTINUITY_V11026 */
.clean-event-row.continuity-only-v11026{cursor:default!important;background:#fbfcff!important}
.event-continuity-tag-v11026{display:inline-flex;align-items:center;justify-content:center;min-width:50px;min-height:36px;border-radius:12px;background:#eef4ff;color:#245bc5;font-size:12px;font-weight:800;letter-spacing:.02em;padding:0 8px}
`;
  fs.writeFileSync(path,source);
}

// Home list and Unsigned Logs show the effective continuous status/duration.
{
  const path='source/src/modules/home/HomeScreen.jsx';
  let source=fs.readFileSync(path,'utf8');
  source=replaceExact(source,
`  const status = last?.status || (day === today ? safeLiveStatus(state.currentStatus || 'OFF', raw.length > 0) : 'OFF');`,
`  const status = events.at(-1)?.status || last?.status || (day === today ? safeLiveStatus(state.currentStatus || 'OFF', raw.length > 0) : 'OFF');`,'home effective status');
  source=replaceExact(source,
`  const issues = day < today && !certified ? validateLogForSigning(state, day).length : 0;`,
`  const needsSignature = day < today && signableLogDays(state).includes(day);
  const issues = day < today && !certified && !needsSignature ? validateLogForSigning(state, day).length : 0;`,'home signature priority');
  source=replaceExact(source,
`{certified ? 'Signed' : issues ? \`\${issues} review\` : day === today ? 'Active' : 'Open'}`, 
`{certified ? 'Signed' : needsSignature ? 'Needs signature' : issues ? \`\${issues} review\` : day === today ? 'Active' : 'Open'}`,'home needs-signature label');
  fs.writeFileSync(path,source);
}

{
  const path='source/src/modules/logbook/UnsignedLogsScreen.jsx';
  let source=fs.readFileSync(path,'utf8');
  source=replaceExact(source,
`import { dayDisplayTitle, dayDurationMinutes, logSignState, signingWarnings } from './signing.js';`,
`import { dayDisplayTitle, dayDurationMinutes, logSignState, signingWarnings } from './signing.js';
import { displayEventsForDayFromState } from '../../core/timeline/displayTimeline.js';`,'unsigned continuity import');
  source=replaceExact(source,
`          const events = state.eventsByDay?.[day] || [];`,
`          const events = displayEventsForDayFromState(state.eventsByDay || {}, day, { nowMinute:1440 });`,'unsigned effective duration');
  fs.writeFileSync(path,source);
}

// Editor selection prefers the canonical effective row. Saving that row uses
// the existing override contract, so adjacent equal-status raw fragments are
// consumed by the explicit edit while their before/after history is retained.
// Signing a carried day materializes it only inside that explicit action.
{
  const path='source/src/app/App.jsx';
  let source=fs.readFileSync(path,'utf8');
  source=replaceExact(source,
`import { signableLogDays, signConfirmMessage, signBlockMessage } from '../modules/logbook/signing.js';`,
`import { signableLogDays, signConfirmMessage, signBlockMessage } from '../modules/logbook/signing.js';
import { materializeCarriedDayForCertificationV11026 } from '../modules/logbook/continuityV11026.js';`,'App continuity import');
  source=replaceExact(source,
`    const raw = rawEvents.find(event => event.id === state.selectedEventId)
      || events.find(event => event.id === state.selectedEventId)`,
`    const raw = events.find(event => event.id === state.selectedEventId)
      || rawEvents.find(event => event.id === state.selectedEventId)`,'canonical selected event');
  source=replaceExact(source,
`      const blockMessage = signBlockMessage(state, day);`,
`      const preparedForSignV11026 = materializeCarriedDayForCertificationV11026(state, day);
      const blockMessage = signBlockMessage(preparedForSignV11026, day);`,'single sign prepared state');
  source=replaceExact(source,
`      const confirmMessage = signConfirmMessage(state, day);`,
`      const confirmMessage = signConfirmMessage(preparedForSignV11026, day);`,'single sign confirm');
  source=replaceExact(source,
`      setState(s => {
        const latestSignature = payload.signatureDataUrl`,
`      setState(s => {
        s = materializeCarriedDayForCertificationV11026(s, day);
        const latestSignature = payload.signatureDataUrl`,'single sign materialization');
  source=replaceExact(source,
`    const blocked = uniqueDays.map(day => ({ day, message:signBlockMessage(state, day) })).filter(item => item.message);`,
`    const preparedBatchV11026 = uniqueDays.reduce((draft, day) => materializeCarriedDayForCertificationV11026(draft, day), state);
    const blocked = uniqueDays.map(day => ({ day, message:signBlockMessage(preparedBatchV11026, day) })).filter(item => item.message);`,'batch sign prepared state');
  source=replaceExact(source,
`      const message = signConfirmMessage(state, day);`,
`      const message = signConfirmMessage(preparedBatchV11026, day);`,'batch sign confirm');
  source=replaceExact(source,
`    setState(s => {
      let signatureByDay = { ...(s.signatureByDay || {}) };`,
`    setState(s => {
      for (const day of uniqueDays) s = materializeCarriedDayForCertificationV11026(s, day);
      let signatureByDay = { ...(s.signatureByDay || {}) };`,'batch sign materialization');
  fs.writeFileSync(path,source);
}

// Release identity.
const VERSION='110.2.6',BUILD='v110206-canonical-day-continuity';
for(const p of ['release-version.json','public/app-version.json']){
  const meta=JSON.parse(fs.readFileSync(p,'utf8'));
  Object.assign(meta,{version:VERSION,build:BUILD,force:false,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,label:'Canonical duty continuity + carried-day signing',notes:['Adjacent equal duty status renders as one continuous event body.','Unchanged OFF/SB/ON status carries through empty completed days and those days appear in Needs signature.','Carried full days become concrete log rows only when the driver explicitly signs them; edit/sign history and protected Driving remain intact.']});
  fs.writeFileSync(p,JSON.stringify(meta,null,2)+'\n');
}
for(const [p,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let source=fs.readFileSync(p,'utf8');
  source=source.replace(new RegExp(`(const ${name}_VERSION = )['\"][^'\"]+['\"]`),`$1'${VERSION}'`).replace(new RegExp(`(const ${name}_BUILD = )['\"][^'\"]+['\"]`),`$1'${BUILD}'`);
  fs.writeFileSync(p,source);
}
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx']){
  let source=fs.readFileSync(p,'utf8');
  source=source.replace(/App v110\.2\.5/g,`App v${VERSION}`).replace(/APP V110\.2\.5/g,`APP V${VERSION}`);
  fs.writeFileSync(p,source);
}

// Review only the three stable modules intentionally changed by this release.
const lockPath='module-locks.v1.json';
const locks=JSON.parse(fs.readFileSync(lockPath,'utf8'));
locks.release=VERSION;
locks.files['source/src/modules/logbook/signing.js']='33bf81f24abc1cb93f5538df9f23cdc38e3f9fbec0a4a420c82db738004dd0b5';
locks.files['source/src/core/compliance/rawRodsChecks.js']='5233ab010916fbb82b10a24f2cb1c9b5b6a766c4e68092f6c729cd7f4a4708a2';
locks.files['source/src/modules/logbook/DayLogScreen.jsx']='b016b8245989b8682785faaa03e0f62f41de37b016238405ad7dd56f7b5c7fa4';
fs.writeFileSync(lockPath,JSON.stringify(locks,null,2)+'\n');

console.log('PASS — 110.2.6 canonical duty continuity and carried-day signing finalized');
