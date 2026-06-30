import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Header, Tabs } from '../../shared/ui/Chrome.jsx';
import LogGraph from '../graph/LogGraph.jsx';
import EventList from './EventList.jsx';
import LogCheckPanel from './LogCheckPanel.jsx';
import SelectedEventBar from './SelectedEventBar.jsx';
import { violationRangesForDay } from '../../core/hos/hosEngine.js';
import { normalizeLogEvents } from '../../core/timeline/timelineEngine.js';
import { displayEventsForDay, displayEventsForDayFromState } from '../../core/timeline/displayTimeline.js';
import { isToday, localDayKey } from '../../shared/utils/date.js';
import { buildChatGptLogReviewPrompt, buildIssueFixPrompt, buildSignGuardSummary, issueSuggestedAction, logSignState, signingWarnings, validateLogForSigning } from './signing.js';

const DEFAULT_DRIVER_NAME = 'Arben Oruci';
const DEFAULT_CARRIER_NAME = 'Narta express llc';
const DEFAULT_MAIN_OFFICE = '92 201 lake drive , willowbrook, IL 60527';

function title(day) {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  const dow = d.toLocaleDateString(undefined, { weekday:'short' }).toUpperCase();
  const mon = d.toLocaleDateString(undefined, { month:'short' }).toUpperCase();
  return `${dow} | ${mon} ${String(d.getDate()).padStart(2,'0')}`;
}

function clampDelta(event, delta) {
  if (!event) return 0;
  const min = -Number(event.startMin || 0);
  const max = 1439 - Number(event.endMin || 0);
  return Math.max(min, Math.min(max, delta));
}

function shiftOneEvent(events, eventId, delta) {
  if (!eventId || !delta) return events;
  return normalizeLogEvents((events || []).map(event => (
    event.id === eventId
      ? { ...event, startMin:event.startMin + delta, endMin:event.endMin + delta }
      : event
  )));
}

function violationSignature(ranges) {
  return (ranges || [])
    .map(r => `${r.type || ''}:${r.severity || ''}:${r.status || ''}:${r.startMin}-${r.endMin}`)
    .join('|');
}

const INSPECTION_ITEMS = [
  ['brakes', 'Brakes'],
  ['lights', 'Lights'],
  ['tires', 'Tires'],
  ['mirrors', 'Mirrors'],
  ['coupling', 'Coupling / 5th wheel'],
  ['documents', 'Documents'],
];

function prettyStamp(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }); }
  catch { return ''; }
}

function minutesLabel(minute) {
  if (!Number.isFinite(Number(minute))) return '';
  const total = Math.max(0, Math.min(1440, Number(minute)));
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

function isPreTripEvent(event = {}) {
  return event.status === 'ON' && /pre[- ]?trip|inspection/i.test(`${event.note || ''} ${event.description || ''}`);
}

function minuteTimestampForDay(day, minute) {
  const [year, month, date] = String(day || '').split('-').map(Number);
  if (!year || !month || !date) return Date.now();
  const d = new Date(year, month - 1, date, 0, 0, 0, 0);
  d.setMinutes(Math.max(0, Math.min(1440, Number(minute || 0))));
  return d.getTime();
}

function inspectionPayloadFromEvent(day, event, saved = {}) {
  const sourceStartMin = Math.max(0, Math.min(1440, Number(event?.startMin ?? 0)));
  const sourceEndMin = Math.max(sourceStartMin, Math.min(1440, Number(event?.endMin ?? sourceStartMin)));
  return {
    ...saved,
    type: 'pretrip',
    checked: INSPECTION_ITEMS.map(([id]) => id),
    complete: true,
    completedAt: minuteTimestampForDay(day, sourceStartMin),
    source: 'auto_on_duty_pretrip_event',
    sourceEventId: event?.id || null,
    sourceEventChainId: event?.event_chain_id || event?.eventChainId || null,
    sourceStartMin,
    sourceEndMin,
    city: event?.city || '',
    state: event?.state || '',
    locationSource: event?.locationSource || event?.source || 'manual',
  };
}


function isAutoInspection(saved = {}) {
  return String(saved.source || '').includes('auto_on_duty_pretrip');
}

function safeValue(value, fallback = 'None') {
  const text = value === 0 ? '0' : String(value || '').trim();
  return text ? text : fallback;
}

function formatDutyMinutes(mins) {
  const total = Math.max(0, Number(mins || 0));
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

function joinCityState(city, state) {
  const parts = [city, state].filter(Boolean);
  return parts.length ? parts.join(', ') : 'None';
}

function driverNameForState(state) {
  return state.signatureByDay?.[state.activeDay]?.driverName || state.driverProfile?.name || DEFAULT_DRIVER_NAME;
}

function formSummary(state, events) {
  const dutyTotals = ['OFF','SB','D','ON'].map(status => {
    const mins = (events || []).filter(e => e.status === status).reduce((sum, e) => sum + Math.max(0, e.endMin - e.startMin), 0);
    return [status, mins];
  });
  const dutyMap = Object.fromEntries(dutyTotals);
  const load = state.loadInfo || {};
  const equipment = state.equipment || {};
  const shippingDocs = [load.loadNo, equipment.container, equipment.chassis].filter(Boolean).join(' ');
  const trailers = state.currentTrailer && state.currentTrailer !== 'No trailer'
    ? state.currentTrailer
    : (equipment.trailer || state.driver?.trailer || 'None');
  const notes = [...new Set((events || []).map(e => e.description || e.note).filter(Boolean))].slice(0, 2).join(' · ');
  return {
    off: formatDutyMinutes(dutyMap.OFF || 0),
    sb: formatDutyMinutes(dutyMap.SB || 0),
    d: formatDutyMinutes(dutyMap.D || 0),
    on: formatDutyMinutes(dutyMap.ON || 0),
    vehicles: safeValue(state.driver?.truck),
    trailers: safeValue(trailers),
    distance: state.gpsTrip?.totalMiles ? `${Number(state.gpsTrip.totalMiles).toFixed(2)} mi` : 'None',
    odometers: 'No Vehicles',
    shippingDocs: safeValue(shippingDocs),
    driverName: driverNameForState(state),
    carrierName: safeValue(state.carrierName || DEFAULT_CARRIER_NAME),
    mainOffice: safeValue(state.mainOfficeAddress || DEFAULT_MAIN_OFFICE),
    homeTerminal: safeValue(state.homeTerminalAddress),
    coDrivers: safeValue(state.coDrivers),
    from: joinCityState(load.pickupCity, load.pickupState),
    to: joinCityState(load.deliveryCity, load.deliveryState),
    notes: safeValue(notes),
  };
}

function FormSectionTitle({ children }) {
  return <div className="road-form-section-title">{children}</div>;
}

function FormRow({ label, value }) {
  return (
    <div className="road-form-row">
      <div className="road-form-label">{label}</div>
      <div className="road-form-value">{value}</div>
    </div>
  );
}

function MiniFormPanel({ state, events }) {
  const form = formSummary(state, events);
  return (
    <div className="road-paper-form">
      <div className="road-form-totals">
        <div><b>OFF</b><span>{form.off}</span></div>
        <div><b>SB</b><span>{form.sb}</span></div>
        <div><b>D</b><span>{form.d}</span></div>
        <div><b>ON</b><span>{form.on}</span></div>
      </div>

      <FormSectionTitle>GENERAL</FormSectionTitle>
      <FormRow label="Vehicles" value={form.vehicles} />
      <FormRow label="Trailers" value={form.trailers} />
      <div className="road-form-split-row">
        <div>
          <div className="road-form-label">Distance</div>
          <div className="road-form-value">{form.distance}</div>
        </div>
        <div>
          <div className="road-form-label">Odometers</div>
          <div className="road-form-value">{form.odometers}</div>
        </div>
      </div>
      <FormRow label="Shipping Documents" value={form.shippingDocs} />
      <FormRow label="Driver" value={form.driverName} />

      <FormSectionTitle>CARRIER</FormSectionTitle>
      <FormRow label="Carrier" value={form.carrierName} />
      <FormRow label="Main Office Address" value={form.mainOffice} />
      <FormRow label="Home Terminal Address" value={form.homeTerminal} />

      <FormSectionTitle>OTHER</FormSectionTitle>
      <FormRow label="Co-Drivers" value={form.coDrivers} />
      <FormRow label="From" value={form.from} />
      <FormRow label="To" value={form.to} />
      <FormRow label="Notes" value={form.notes} />
    </div>
  );
}

function InspectionPanel({ state, events = [], onSaveInspection }) {
  const day = state.activeDay;
  const saved = state.inspectionByDay?.[day] || {};
  const checked = new Set(saved.checked || []);
  const allChecked = INSPECTION_ITEMS.every(([id]) => checked.has(id));
  const autoDone = allChecked && isAutoInspection(saved);
  const preTripEvent = [...(events || [])].sort((a,b)=>a.startMin-b.startMin).find(isPreTripEvent) || null;

  function saveChecked(ids) {
    onSaveInspection?.({
      type: 'pretrip',
      checked: ids,
      complete: INSPECTION_ITEMS.every(([id]) => ids.includes(id)),
      completedAt: INSPECTION_ITEMS.every(([id]) => ids.includes(id)) ? (saved.completedAt || Date.now()) : null,
      source: saved.source || 'manual_inspection_form',
    });
  }

  function toggle(id) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id); else next.add(id);
    saveChecked([...next]);
  }

  function selectAll() {
    saveChecked(INSPECTION_ITEMS.map(([id]) => id));
  }

  function acceptPreTripSheet() {
    if (!preTripEvent) return;
    onSaveInspection?.(inspectionPayloadFromEvent(day, preTripEvent, saved));
  }

  return (
    <div className={`inspection-panel ${allChecked ? 'complete' : ''} ${autoDone ? 'auto-complete' : ''}`}>
      <div className="inspection-headline">
        <div>
          <b>Daily inspection sheet</b>
          <span>
            {autoDone
              ? `Completed from ON DUTY Pre-trip${saved.sourceStartMin != null ? ` · ${minutesLabel(saved.sourceStartMin)}` : ''}${saved.city || saved.state ? ` · ${[saved.city, saved.state].filter(Boolean).join(', ')}` : ''}`
              : allChecked
                ? `Completed${saved.completedAt ? ` · ${prettyStamp(saved.completedAt)}` : ''}`
                : preTripEvent
                  ? `ON DUTY Pre-trip found · ${minutesLabel(preTripEvent.startMin)} · ${[preTripEvent.city, preTripEvent.state].filter(Boolean).join(', ')}`
                  : 'One inspection sheet is required per log day when you go ON DUTY / Driving.'}
          </span>
        </div>
        {!autoDone && <button onClick={selectAll}>{allChecked ? 'All OK' : 'Manual OK'}</button>}
      </div>

      {!allChecked && preTripEvent && (
        <div className="inspection-prompt-card">
          <b>Complete inspection sheet from ON DUTY Pre-trip?</b>
          <span>Use this after the driver has actually inspected the truck. The sheet will link to this event time and will move with it if the event is edited.</span>
          <div className="inspection-prompt-actions">
            <button onClick={acceptPreTripSheet}>Yes, fill sheet</button>
            <button className="secondary" onClick={() => saveChecked([])}>No, I will review manually</button>
          </div>
        </div>
      )}

      {autoDone ? (
        <div className="inspection-done-note">
          Linked to duty status event. If that ON DUTY Pre-trip time is edited, this inspection time updates with it.
        </div>
      ) : (
        <>
          <div className="inspection-check-grid">
            {INSPECTION_ITEMS.map(([id, text]) => (
              <button key={id} className={checked.has(id) ? 'picked' : ''} onClick={() => toggle(id)}>
                <span>{checked.has(id) ? '✓' : ''}</span>
                <b>{text}</b>
              </button>
            ))}
          </div>
          {allChecked && <div className="inspection-done-note">Saved. This is the inspection sheet for this log day.</div>}
        </>
      )}
    </div>
  );
}


function actionLabelForIssue(issue = {}) {
  return issueSuggestedAction(issue).label || 'Open';
}

function parseChatGptFixPlan(text = '') {
  const blocks = String(text || '')
    .split(/(?=FIX_ID\s*:)/i)
    .map(block => block.trim())
    .filter(Boolean);

  return blocks.map((block, index) => {
    const read = (label) => {
      const match = block.match(new RegExp(`${label}\\s*:\\s*([^\\n]+)`, 'i'));
      return match ? match[1].trim() : '';
    };
    return {
      id: read('FIX_ID') || `F${index + 1}`,
      issue: read('ISSUE') || 'Suggested fix',
      appAction: read('APP_ACTION') || 'REVIEW_ONLY',
      value: read('VALUE') || 'Review only',
      applyOnlyIfTrue: read('APPLY_ONLY_IF_TRUE') || 'only if accurate',
      raw: block,
    };
  });
}

function SignGuardIssueCard({ issue, state, day, onCopy, onQuickFix }) {
  const suggested = issueSuggestedAction(issue);
  const code = String(issue.code || '');
  const type = code.includes('hos_') ? 'violation' : (code.includes('active_day') ? 'notice' : (/missing|gap|overlap|invalid|total|inspection|vehicle|shipping|location|carrier|office|driver/i.test(`${issue.code || ''} ${issue.title || ''}`) ? 'fix' : 'review'));
  const label = type === 'violation' ? 'HOS REVIEW' : type === 'fix' ? 'FIX REQUIRED' : type === 'notice' ? 'NOTICE' : 'REVIEW';
  return (
    <div className={`signguard-issue signguard-issue-v92 ${type}`}>
      <div className="signguard-issue-main">
        <span>{label}</span>
        <b>{issue.title}</b>
        <p>{issue.detail}</p>
        <em>{issue.where}</em>
      </div>
      <div className="signguard-issue-actions-v92">
        {suggested.action !== 'NO_ACTION' && (
          <button className="mini-primary" onClick={() => onQuickFix?.(suggested.action, { issue, day: suggested.day || issue.day || day })}>
            {actionLabelForIssue(issue)}
          </button>
        )}
        <button className="mini-secondary" onClick={() => onCopy(buildIssueFixPrompt(state, day, issue), 'Issue copied')}>Copy</button>
      </div>
    </div>
  );
}

function DotPackageTable({ rows = [], onQuickFix, onCopy, state, day }) {
  if (!rows.length) return null;
  return (
    <div className="signguard-dot-table-wrap">
      <div className="signguard-section-title-row">
        <b>DOT Package / Previous 7 days</b>
        <span>Open only the days that are missing or short.</span>
      </div>
      <div className="signguard-dot-table">
        <div className="head"><span>Date</span><span>Total</span><span>Status</span><span></span></div>
        {rows.map(row => (
          <div key={row.day} className={row.issue ? 'bad' : 'ok'}>
            <span>{row.day}</span>
            <span>{row.total}</span>
            <span>{row.status}{row.signed ? ' · signed' : row.status === 'Ready' ? '' : ''}</span>
            <span>
              {row.issue ? (
                <>
                  <button onClick={() => onQuickFix?.('OPEN_DAY', { day: row.day, issue: row.issue })}>Open</button>
                  <button className="ghost" onClick={() => onCopy(buildIssueFixPrompt(state, day, row.issue), 'DOT day copied')}>Copy</button>
                </>
              ) : <em>OK</em>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatGptAssistBox({ state, day, onCopy, onQuickFix }) {
  const [open, setOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [reviewText, setReviewText] = useState('');
  const parsedFixes = useMemo(() => parseChatGptFixPlan(reviewText), [reviewText]);

  return (
    <div className={`signguard-chatgpt-v92 ${open ? 'open' : ''}`}>
      <button className="chatgpt-collapsed-row" onClick={() => setOpen(value => !value)}>
        <div>
          <b>Ask ChatGPT helper</b>
          <span>Copy the log, ask for review, paste fix plan back here.</span>
        </div>
        <em>{open ? 'Hide' : 'Open'}</em>
      </button>

      {open && (
        <div className="chatgpt-actions-v92">
          <button onClick={() => onCopy(buildChatGptLogReviewPrompt(state, day), 'Log review copied')}>Copy Log for ChatGPT</button>
          <button className="secondary" onClick={() => setPasteOpen(true)}>Paste ChatGPT Answer</button>
        </div>
      )}

      {open && parsedFixes.length > 0 && (
        <div className="parsed-fix-plan-v92">
          <div className="signguard-section-title-row">
            <b>Suggested fix plan</b>
            <span>Apply only if the value is accurate.</span>
          </div>
          {parsedFixes.map(fix => (
            <div className="parsed-fix-card" key={fix.id}>
              <span>{fix.appAction}</span>
              <b>{fix.issue}</b>
              <p>{fix.value}</p>
              <em>{fix.applyOnlyIfTrue}</em>
              <div>
                <button onClick={() => onQuickFix?.('APPLY_CHATGPT_FIX', { fix })}>Apply / Open</button>
                <button className="secondary" onClick={() => onCopy(fix.raw, 'Fix block copied')}>Copy block</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pasteOpen && (
        <div className="chatgpt-paste-sheet-v92">
          <div className="chatgpt-paste-card-v92">
            <div className="chatgpt-paste-head-v92">
              <b>Paste ChatGPT fix plan</b>
              <button onClick={() => setPasteOpen(false)}>Done</button>
            </div>
            <textarea
              value={reviewText}
              onChange={e => setReviewText(e.target.value)}
              placeholder="Paste ChatGPT D) COPY/PASTE FIX PLAN here..."
              autoFocus
            />
            <div className="chatgpt-paste-actions-v92">
              <button onClick={() => onCopy(reviewText || 'No pasted fix plan yet.', 'Fix plan copied')}>Copy Fix Plan</button>
              <button className="secondary" onClick={() => setReviewText('')}>Clear</button>
              <button className="secondary" onClick={() => setPasteOpen(false)}>Close</button>
            </div>
            <small>This does not auto-change records. Suggested fixes still require driver confirmation.</small>
          </div>
        </div>
      )}
    </div>
  );
}


function isProfileIssue(issue = {}) {
  return /missing_driver|missing_carrier|missing_main_office/i.test(String(issue.code || ''));
}

function isNoticeOnlyIssue(issue = {}) {
  return /active_day/i.test(String(issue.code || ''));
}

function buildFixWizardSteps(guard, day) {
  const todayIssues = (guard.todayIssues || []).filter(issue => !isNoticeOnlyIssue(issue));
  const steps = [];
  const profileIssues = todayIssues.filter(isProfileIssue);

  if (profileIssues.length) {
    steps.push({
      id: 'saved_profile',
      title: 'Profile info missing',
      detail: 'Apply saved driver, carrier, main office, and unit info.',
      where: 'Form tab → Driver / Carrier',
      action: 'APPLY_SAVED_PROFILE',
      actionLabel: 'Apply saved profile',
      kind: 'safe',
      issue: profileIssues[0],
      applyOnlyIfTrue: 'Uses the saved profile. Review it after applying.',
    });
  }

  todayIssues
    .filter(issue => !isProfileIssue(issue))
    .forEach(issue => {
      const suggested = issueSuggestedAction(issue);
      const code = String(issue.code || '');
      const reviewOnly = /hos_|violation|cycle|break|window|drive11/i.test(`${code} ${issue.title || ''} ${issue.detail || ''}`);
      steps.push({
        id: issue.code || `${issue.title}-${steps.length}`,
        title: issue.title || 'Review item',
        detail: issue.detail || 'Review this item before signing.',
        where: issue.where || 'Log',
        action: suggested.action,
        actionLabel: reviewOnly ? 'Review log' : suggested.label || 'Open',
        kind: reviewOnly ? 'review' : 'fix',
        day: suggested.day || issue.day || day,
        issue,
        applyOnlyIfTrue: reviewOnly
          ? 'Review only. Do not change accurate driving/on-duty time.'
          : 'Apply or edit only if the current record is wrong or incomplete.',
      });
    });

  (guard.dotPackage || []).forEach(issue => {
    const suggested = issueSuggestedAction(issue);
    steps.push({
      id: issue.code || `dot-${issue.day}`,
      title: issue.title || 'Previous day needs review',
      detail: issue.detail || 'Open this day and complete only with accurate records.',
      where: issue.where || 'DOT package',
      action: suggested.action || 'OPEN_DAY',
      actionLabel: 'Open day',
      kind: 'dot',
      day: suggested.day || issue.day || day,
      issue,
      applyOnlyIfTrue: 'Open the day. Fill or change time only if you know the true record.',
    });
  });

  return steps;
}

function RoadGuardFixWizard({ open, guard, day, state, onClose, onQuickFix, onCopy }) {
  const steps = useMemo(() => buildFixWizardSteps(guard, day), [guard, day]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setIndex(current => Math.min(current, steps.length));
  }, [open, steps.length]);

  if (!open) return null;

  const total = steps.length;
  const step = steps[index] || null;
  const done = !step;

  function nextStep() {
    setIndex(current => Math.min(current + 1, total));
  }

  function runStep() {
    if (!step) return;
    if (!step.action || step.action === 'NO_ACTION') {
      nextStep();
      return;
    }

    const silentApply = step.action === 'APPLY_SAVED_PROFILE' || step.action === 'OPEN_SHIPPING_DOCS';
    onQuickFix?.(step.action, {
      issue: step.issue,
      day: step.day || day,
      silent: silentApply,
      wizard: true,
    });

    if (silentApply) {
      window.setTimeout(() => setIndex(current => Math.min(current, Math.max(0, steps.length - 1))), 80);
    } else {
      onClose?.();
    }
  }

  function copyStep() {
    if (!step) return;
    const text = buildIssueFixPrompt(state, day, step.issue || {
      title: step.title,
      detail: step.detail,
      where: step.where,
      code: step.id,
    });
    onCopy?.(text, 'Wizard step copied');
  }

  return (
    <div className="roadguard-wizard-backdrop" role="dialog" aria-modal="true" aria-label="Fix issues wizard">
      <div className="roadguard-wizard-card">
        <div className="roadguard-wizard-head">
          <div>
            <span>Fix wizard</span>
            <b>{done ? 'All fixable items reviewed' : `Step ${Math.min(index + 1, total)} of ${total}`}</b>
          </div>
          <button onClick={onClose}>Close</button>
        </div>

        {done ? (
          <div className="roadguard-wizard-done">
            <b>Run Log Check again.</b>
            <p>If the record is true and complete, the sign button will become available when the day is ready.</p>
            <div className="roadguard-wizard-actions">
              <button onClick={onClose}>Done</button>
              <button className="secondary" onClick={() => onCopy?.(buildChatGptLogReviewPrompt(state, day), 'Log review copied')}>Copy for ChatGPT</button>
            </div>
          </div>
        ) : (
          <>
            <div className={`roadguard-wizard-step ${step.kind}`}>
              <span>{step.kind === 'dot' ? 'DOT package' : step.kind === 'review' ? 'Review only' : 'Fix item'}</span>
              <b>{step.title}</b>
              <p>{step.detail}</p>
              <em>{step.where}</em>
              <small>{step.applyOnlyIfTrue}</small>
            </div>

            <div className="roadguard-wizard-progress">
              <i style={{ width: `${total ? ((index + 1) / total) * 100 : 100}%` }} />
            </div>

            <div className="roadguard-wizard-actions">
              <button onClick={runStep}>{step.actionLabel || 'Fix / Open'}</button>
              <button className="secondary" onClick={nextStep}>Skip</button>
              <button className="secondary" onClick={copyStep}>Copy</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SignGuardPanel({ state, day, onQuickFix, wizardRequestId = 0 }) {
  const [copyStatus, setCopyStatus] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [showToday, setShowToday] = useState(true);
  const [showDot, setShowDot] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const guard = buildSignGuardSummary(state, day);

  useEffect(() => {
    if (!wizardRequestId) return;
    setExpanded(true);
    setWizardOpen(true);
  }, [wizardRequestId]);

  async function copyText(text, message = 'Copied') {
    try {
      await navigator.clipboard?.writeText(text);
      setCopyStatus(message);
    } catch {
      setCopyStatus('Copy failed. Select the text and copy manually.');
    }
    window.setTimeout(() => setCopyStatus(''), 2200);
  }

  const headline = guard.status === 'READY'
    ? 'Ready'
    : guard.status === 'FIX_REQUIRED'
      ? 'Needs fixes'
      : 'Review needed';

  const firstIssue = guard.todayIssues?.[0] || guard.dotPackage?.[0] || null;
  const issueCount = guard.fixRequired.length + guard.hosViolations.length + guard.dotPackage.length;

  return (
    <div className={`signguard-panel signguard-panel-v92 roadguard-lite ${guard.status.toLowerCase()} ${expanded ? 'expanded' : 'collapsed'}`}>
      <div className="roadguard-lite-head">
        <button className="roadguard-lite-main" onClick={() => setExpanded(value => !value)}>
          <span>Log check</span>
          <b>{headline}</b>
          <em>{issueCount ? `${issueCount} item${issueCount === 1 ? '' : 's'}` : 'No open items'}</em>
        </button>
        <div className="roadguard-head-actions">
          <button className="roadguard-copy-mini" onClick={() => copyText(buildChatGptLogReviewPrompt(state, day), 'Log review copied')}>Copy</button>
          {issueCount > 0 && <button className="roadguard-fix-mini" onClick={() => { setExpanded(true); setWizardOpen(true); }}>Fix</button>}
        </div>
      </div>

      {firstIssue && !expanded && (
        <button className="roadguard-first-issue" onClick={() => setExpanded(true)}>
          <span>{firstIssue.title}</span>
          <em>{firstIssue.where || 'Open review'}</em>
        </button>
      )}

      <div className="signguard-score-row signguard-score-row-v92 roadguard-score-compact">
        <button className={guard.fixRequired.length ? 'bad' : 'ok'} onClick={() => { setExpanded(true); setShowToday(true); }}><b>{guard.fixRequired.length}</b><span>Fix</span></button>
        <button className={guard.hosViolations.length ? 'bad' : 'ok'} onClick={() => { setExpanded(true); setShowToday(true); }}><b>{guard.hosViolations.length}</b><span>HOS</span></button>
        <button className={guard.dotPackage.length ? 'warn' : 'ok'} onClick={() => { setExpanded(true); setShowDot(value => !value); }}><b>{guard.dotPackage.length}</b><span>DOT</span></button>
      </div>

      {expanded && (
        <>
          {guard.notices.length > 0 && (
            <div className="signguard-notice-v92 roadguard-notice-compact">
              {guard.notices.map(issue => <span key={issue.code}>{issue.title}: {issue.detail}</span>)}
            </div>
          )}

          <div className="signguard-action-strip-v92 roadguard-action-row">
            <button onClick={() => onQuickFix?.('APPLY_SAVED_PROFILE', { day })}>Profile</button>
            <button onClick={() => onQuickFix?.('OPEN_SHIPPING_DOCS', { day })}>BOL / empty</button>
            <button onClick={() => setShowDot(value => !value)}>{showDot ? 'Hide DOT' : 'DOT days'}</button>
          </div>

          {showToday && (guard.todayIssues.length ? (
            <div className="signguard-issues signguard-issues-v92 roadguard-issues-compact">
              {guard.todayIssues.map(issue => <SignGuardIssueCard key={issue.code} issue={issue} state={state} day={day} onCopy={copyText} onQuickFix={onQuickFix} />)}
            </div>
          ) : (
            <div className="signguard-clean roadguard-clean">Today looks clean.</div>
          ))}

          {showDot && <DotPackageTable rows={guard.dotRows} onQuickFix={onQuickFix} onCopy={copyText} state={state} day={day} />}

          <ChatGptAssistBox state={state} day={day} onCopy={copyText} onQuickFix={onQuickFix} />
        </>
      )}
      <RoadGuardFixWizard open={wizardOpen} guard={guard} day={day} state={state} onClose={() => setWizardOpen(false)} onQuickFix={onQuickFix} onCopy={copyText} />
      {copyStatus ? <span className="signguard-copy-status">{copyStatus}</span> : null}
    </div>
  );
}

function SignaturePanel({ state, onSaveSignature, onQuickFix }) {
  const day = state.activeDay;
  const saved = state.signatureByDay?.[day] || {};
  const savedDriverSignature = state.driverSignature || null;
  const existingDataUrl = savedDriverSignature?.dataUrl || saved.signatureDataUrl || '';
  const [name, setName] = useState(savedDriverSignature?.driverName || saved.driverName || driverNameForState(state));
  const [hasInk, setHasInk] = useState(!!existingDataUrl);
  const [changeSignature, setChangeSignature] = useState(!existingDataUrl);
  const [wizardRequestId, setWizardRequestId] = useState(0);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const signState = logSignState(state, day);
  const blockers = validateLogForSigning(state, day);
  const fixBlockers = blockers.filter(issue => !/active_day/i.test(String(issue.code || '')));
  const todayActive = day >= localDayKey();

  useEffect(() => {
    setName(savedDriverSignature?.driverName || saved.driverName || driverNameForState(state));
    setChangeSignature(!existingDataUrl);
    setHasInk(!!existingDataUrl);
  }, [day, savedDriverSignature?.dataUrl, savedDriverSignature?.driverName, saved.signatureDataUrl, saved.driverName, existingDataUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !changeSignature) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 4;
  }, [changeSignature, day]);

  function pointFromEvent(e) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function startDraw(e) {
    if (!changeSignature) return;
    const point = pointFromEvent(e);
    if (!point) return;
    e.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = point;
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(point.x + 0.01, point.y + 0.01);
    ctx.stroke();
    setHasInk(true);
  }

  function moveDraw(e) {
    if (!drawingRef.current || !changeSignature) return;
    const point = pointFromEvent(e);
    if (!point) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const previous = lastPointRef.current || point;
    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
  }

  function endDraw() {
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  function signLog() {
    if (changeSignature) {
      const canvas = canvasRef.current;
      if (!canvas || !hasInk) return;
      onSaveSignature?.({
        driverName: name || driverNameForState(state),
        signatureDataUrl: canvas.toDataURL('image/png'),
      });
      return;
    }

    if (!existingDataUrl) {
      setChangeSignature(true);
      return;
    }

    onSaveSignature?.({
      driverName: name || savedDriverSignature?.driverName || driverNameForState(state),
      signatureDataUrl: existingDataUrl,
    });
  }

  const signButtonLabel = signState.status === 'Needs Recertification'
    ? 'Recertify Log'
    : saved.signed && signState.status === 'Certified'
      ? 'Sign Again'
      : existingDataUrl && !changeSignature
        ? 'Sign Log'
        : 'Save Signature + Sign';

  return (
    <div className={`signature-panel road-sign-panel ${saved.signed ? 'signed' : ''}`}>
      <div className="sign-legal-copy">
        I certify this log is true and correct.
      </div>

      <div className="sign-driver-row">
        <span>Driver</span>
        <b>{name}</b>
      </div>

      {existingDataUrl && !changeSignature ? (
        <div className="saved-signature-preview">
          <img src={existingDataUrl} alt="Saved driver signature" />
          <span>Saved signature</span>
        </div>
      ) : (
        <>
          <div className="signature-canvas-wrap">
            <canvas
              ref={canvasRef}
              className="signature-canvas"
              width="720"
              height="220"
              onPointerDown={startDraw}
              onPointerMove={moveDraw}
              onPointerUp={endDraw}
              onPointerLeave={endDraw}
              onPointerCancel={endDraw}
            />
          </div>
          <button className="clear-signature-link" onClick={clearSignature}>Clear Signature</button>
        </>
      )}

      <div className="sign-status-card">
        <b>{signState.label}</b>
        <span>{todayActive ? 'Today is active. Sign after the day is complete.' : signState.reason}</span>
      </div>

      <SignGuardPanel state={state} day={day} onQuickFix={onQuickFix} wizardRequestId={wizardRequestId} />


      <div className="signature-actions-row">
        <button
          className="sign-save road-sign-save"
          onClick={fixBlockers.length ? () => setWizardRequestId(Date.now()) : signLog}
          disabled={fixBlockers.length ? false : ((changeSignature && !hasInk) || todayActive)}
        >
          {fixBlockers.length ? 'Fix Issues Before Sign' : todayActive ? 'Sign after day complete' : signButtonLabel}
        </button>
      </div>

      {existingDataUrl && !changeSignature && <button className="clear-signature-link" onClick={() => setChangeSignature(true)}>Change Signature</button>}

      <div className="signature-footnote">
        {saved.signed ? `Signed · ${prettyStamp(saved.signedAt)}` : existingDataUrl ? 'Ready with saved signature.' : 'Draw signature once.'}
      </div>
    </div>
  );
}

export default function DayDetail({
  state, liveCurrent, events, selectedEvent, onBack, onSelect, onOpenAdd, onOpenEdit, onDelete,
  onToggleSelectMode, onToggleSelectedId, onSelectAll, onClearSelection, onOpenShift, onMoveSelected,
  onCertify, onTools, onOpenStatus, onOpenTrailer, onDriverFlow, onSaveLoad, onToggleGps,
  onSaveInspection, onSaveSignature, onRoadGuardFix
}) {
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveDelta, setMoveDelta] = useState(0);
  const [activeTab, setActiveTab] = useState('log');

  useEffect(() => {
    const requested = state.roadGuardTabRequest?.tab;
    if (requested && ['log', 'form', 'sign', 'inspection'].includes(requested)) {
      setActiveTab(requested);
    }
  }, [state.roadGuardTabRequest?.at, state.roadGuardTabRequest?.tab]);

  const rawDayEvents = state.eventsByDay?.[state.activeDay] || [];
  const displayEvents = useMemo(
    () => displayEventsForDayFromState(state.eventsByDay || {}, state.activeDay),
    [state.eventsByDay, state.activeDay]
  );
  const displaySelectedEvent = displayEvents.find(event => event.id === state.selectedEventId) || selectedEvent || null;
  const selectedRawEvent = rawDayEvents.find(event => event.id === state.selectedEventId) || null;
  const boundedMoveDelta = selectedRawEvent ? clampDelta(selectedRawEvent, moveDelta) : 0;
  const moveWasClamped = selectedRawEvent && moveDelta !== boundedMoveDelta;
  const isMoving = !!selectedRawEvent && moveOpen && boundedMoveDelta !== 0;

  useEffect(() => {
    setMoveOpen(false);
    setMoveDelta(0);
  }, [state.selectedEventId, state.activeDay]);

  const baseViolationRanges = useMemo(
    () => violationRangesForDay(state.eventsByDay || {}, state.activeDay),
    [state.eventsByDay, state.activeDay]
  );

  const previewRawEvents = useMemo(
    () => (isMoving ? shiftOneEvent(rawDayEvents, state.selectedEventId, boundedMoveDelta) : rawDayEvents),
    [isMoving, rawDayEvents, state.selectedEventId, boundedMoveDelta]
  );

  const previewGraphEvents = useMemo(
    () => (isMoving ? displayEventsForDay(previewRawEvents, isToday(state.activeDay)) : displayEvents),
    [isMoving, previewRawEvents, state.activeDay, displayEvents]
  );

  const previewViolationRanges = useMemo(
    () => (isMoving
      ? violationRangesForDay({ ...(state.eventsByDay || {}), [state.activeDay]: previewRawEvents }, state.activeDay)
      : baseViolationRanges),
    [isMoving, state.eventsByDay, state.activeDay, previewRawEvents, baseViolationRanges]
  );

  const selectedPreviewEvent = previewGraphEvents.find(event => event.id === state.selectedEventId) || displaySelectedEvent;
  const violationsChanged = isMoving && violationSignature(baseViolationRanges) !== violationSignature(previewViolationRanges);
  const moveHasWarning = violationsChanged && previewViolationRanges.length > 0;

  function adjustMove(delta) {
    if (!selectedRawEvent) return;
    setMoveOpen(true);
    setMoveDelta(current => clampDelta(selectedRawEvent, current + delta));
  }

  function applyMove() {
    if (!selectedRawEvent || !boundedMoveDelta) return;
    onMoveSelected?.(selectedRawEvent.id, boundedMoveDelta);
    setMoveOpen(false);
    setMoveDelta(0);
  }

  return (
    <section className={`screen active graph-first-screen ${selectedEvent ? "editing-graph" : ""} ${moveOpen ? "inline-moving" : ""}`}>
      <Header title={title(state.activeDay)} onBack={onBack} onRight={onTools} />
      <Tabs active={activeTab} onTab={setActiveTab} />

      {activeTab === 'log' && (
        <div className="graph-panel graph-first-panel">
          <LogGraph
            events={previewGraphEvents}
            selectedId={state.selectedEventId}
            violationRanges={previewViolationRanges}
            onSelect={onSelect}
            onEmptyTap={() => onSelect(null)}
          />
        </div>
      )}

      {activeTab === 'log' && (
        <SelectedEventBar
          event={selectedPreviewEvent}
          onEdit={onOpenEdit}
          onVoid={onDelete}
          onClear={() => onSelect(null)}
          moveOpen={moveOpen}
          moveDelta={boundedMoveDelta}
          moveWasClamped={!!moveWasClamped}
          moveHasWarning={moveHasWarning}
          onToggleMove={() => { setMoveOpen(value => !value); setMoveDelta(0); }}
          onAdjustMove={adjustMove}
          onApplyMove={applyMove}
          onResetMove={() => setMoveDelta(0)}
        />
      )}

      {activeTab === 'form' && <MiniFormPanel state={state} events={displayEvents} />}
      {activeTab === 'sign' && <SignaturePanel state={state} onSaveSignature={onSaveSignature} onQuickFix={onRoadGuardFix} />}
      {activeTab === 'inspection' && <InspectionPanel state={state} events={displayEvents} onSaveInspection={onSaveInspection} />}

      {activeTab === 'log' && !selectedEvent && (
        <div className="graph-action-rail">
          <button onClick={() => onOpenAdd({ mode:'choice' })}>Insert</button>
          <button onClick={onToggleSelectMode}>{state.selectMode ? 'Done' : 'Move'}</button>
          <button onClick={onOpenStatus}>Status</button>
          <button onClick={onToggleGps}>Drive</button>
        </div>
      )}

      {activeTab === 'log' && state.selectMode && !selectedEvent && (
        <div className="bulk-strip graph-bulk-strip graph-bulk-compact">
          <button onClick={onSelectAll}>All</button>
          <button onClick={onClearSelection}>Clear</button>
          <button className="primary" onClick={onOpenShift}>Shift</button>
        </div>
      )}

      {activeTab === 'log' && (
        <>
          <EventList events={displayEvents} selectedId={state.selectedEventId} selectMode={state.selectMode} selectedIds={state.selectedIds} onSelect={onSelect} onToggleSelected={onToggleSelectedId} onOpenEdit={onOpenEdit} />

          <LogCheckPanel events={displayEvents} state={state} />

          <div className="cert-line cert-line-status-only">
            <span>Certification</span>
            <b>{state.certifyStatus[state.activeDay]}</b>
          </div>
        </>
      )}
    </section>
  );
}
