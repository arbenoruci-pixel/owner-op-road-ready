'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BUSINESS_STORE_EVENT } from '../business/businessStore.js';
import { AREAS, RULESET, STATUS, addDays, auditIndex, auditTimeZone, buildAudit, day, emptyProfile, normalizeAudit, packetRowsFor, sourceRevision, todayInZone, weekRange } from './auditReadinessCoreV1.js';
import { readAuditBusiness, saveAuditProfile, saveAuditReview, verifyAuditSources } from './auditReadinessStorageV1.js';
import { preparePacket } from './evidenceWorkspacePacketV110453.js';
import './auditReadinessV1.css';

const cadenceLabel = { weekly: 'Weekly check', quarterly: 'Quarterly filing', annual: 'License year', rolling: 'Every 12 months', expiry: 'Validity / expiration', registration: 'Registration reporting period', ongoing: 'Ongoing / when changed' };
const downloadName = (area, week) => `Road-Ready-${AREAS[area]}-${week}.json`;
const defaultView = (today, state) => ({ area: 'ifta', week: weekRange(today).from, scope: { unit: '', driverId: state.activeDriverId || '', loadNo: '' } });
function savedView(today, state, storageKey) {
  try { const value = JSON.parse(sessionStorage.getItem(storageKey) || '{}'); return { area: AREAS[value.area] ? value.area : 'ifta', week: day(value.week) ? weekRange(value.week).from : weekRange(today).from, scope: { unit: String(value.scope?.unit || '').slice(0, 60), driverId: String(value.scope?.driverId || state.activeDriverId || ''), loadNo: String(value.scope?.loadNo || '').slice(0, 100) } }; }
  catch { return defaultView(today, state); }
}
function reviewDraft(item, profile) {
  const old = item.review;
  return { status: old?.status || 'needs_review', reviewer: old?.reviewer || profile.confirmedBy || '', note: old?.note || '', sourceIds: (old?.sourceRefs || []).map(r => r.rowId), coverageFrom: old?.coverageFrom || (['weekly', 'quarterly'].includes(item.requirement.cadence) ? item.period.from : ''), coverageThrough: old?.coverageThrough || (['weekly', 'quarterly'].includes(item.requirement.cadence) ? item.period.to : ''), confirmations: old?.confirmations || [] };
}

export default function AuditReadiness({ rows = [], state = {}, onOpen, onAdd, readStore, writeStore, readOriginal, viewStorageKey = 'road-ready-audit-view-v1' }) {
  const today = todayInZone(auditTimeZone(state));
  // The first render is identical on server and client. Restore browser-only
  // preferences after hydration, before the persistence effect may write them.
  const [initialView] = useState(() => defaultView(today, state)), [viewLoaded, setViewLoaded] = useState(false);
  const [area, setArea] = useState(initialView.area), [week, setWeek] = useState(initialView.week), [scope, setScope] = useState(initialView.scope);
  const [business, setBusiness] = useState({}), [loaded, setLoaded] = useState(false), [proofs, setProofs] = useState({});
  const [profileDraft, setProfileDraft] = useState(null), [profileExpected, setProfileExpected] = useState(null), [editing, setEditing] = useState(null), [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [ready, setReady] = useState(null);
  const controller = useRef();
  useEffect(() => {
    const customStore = Boolean(readStore || writeStore);
    const refresh = () => { try { if (customStore && (typeof readStore !== 'function' || typeof writeStore !== 'function')) throw Error('Audit store adapters require both readStore and writeStore.'); setBusiness(customStore ? readStore() : readAuditBusiness()); setLoaded(true); } catch (e) { setError(e.message); setLoaded(false); } };
    refresh(); if (!customStore) { window.addEventListener(BUSINESS_STORE_EVENT, refresh); window.addEventListener('storage', refresh); }
    return () => { if (!customStore) { window.removeEventListener(BUSINESS_STORE_EVENT, refresh); window.removeEventListener('storage', refresh); } controller.current?.abort(); };
  }, [readStore, writeStore]);
  useEffect(() => { const restored = savedView(today, state, viewStorageKey); setArea(restored.area); setWeek(restored.week); setScope(restored.scope); setViewLoaded(true); }, [viewStorageKey]);
  useEffect(() => { setReady(null); }, [area, week, scope, business, rows, proofs]);
  useEffect(() => { if (!viewLoaded) return; try { sessionStorage.setItem(viewStorageKey, JSON.stringify({ area, week, scope })); } catch {} }, [area, week, scope, viewStorageKey, viewLoaded]);
  useEffect(() => { if (ready) return () => URL.revokeObjectURL(ready.url); }, [ready]);
  const model = useMemo(() => buildAudit({ rows, business, area, week, scope, today, proofs }), [rows, business, area, week, scope, today, proofs]);
  const profile = model.profile;
  const units = [...new Set([...(profile.units || '').split(/[,;\n]/), ...rows.map(row => row.unit)].map(v => String(v || '').trim()).filter(Boolean))];
  const drivers = state.teamDrivers?.length ? state.teamDrivers : [{ id: state.activeDriverId || 'driver_primary', name: state.driverProfile?.name || 'Current driver' }];
  const selectedRows = editing ? editing.eligible.filter(row => draft.sourceIds.includes(row.id)) : [];

  function resetEditor() { setEditing(null); setDraft(null); setError(''); setMessage(''); }
  function openProfile() { resetEditor(); setProfileExpected(profile); setProfileDraft({ ...emptyProfile(), ...profile, effectiveFrom: profile.effectiveFrom || model.week.from }); }
  function edit(item) { setProfileDraft(null); setEditing({ ...item, profileSnapshot: profile }); setDraft(reviewDraft(item, profile)); setError(''); setMessage(''); }
  function changeView(value) { resetEditor(); setProfileDraft(null); setArea(value); }
  async function saveProfile(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const next = await saveAuditProfile(profileDraft, profileExpected, { readStore, writeStore }); setBusiness(next); setProfileDraft(null); setMessage('Applicability profile saved with its confirmation history.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function saveReview(event) {
    event.preventDefault(); setBusy(true); setError(''); controller.current = new AbortController();
    try { const result = await saveAuditReview(editing, draft, editing.profileSnapshot, rows, { readStore, writeStore, readOriginal, signal: controller.current.signal, onProgress: setMessage }); setBusiness(result.business); setProofs(old => ({ ...old, ...result.proofs })); setEditing(null); setDraft(null); setMessage('Evidence review saved with its linked sources and prior review history.'); }
    catch (e) { setError(e.name === 'AbortError' ? 'Original checking cancelled.' : e.message); setMessage(''); }
    finally { setBusy(false); }
  }
  async function verifySaved() {
    const ids = new Set(model.items.flatMap(item => (item.review?.sourceRefs || []).map(ref => ref.rowId))), selected = rows.filter(row => ids.has(row.id));
    setBusy(true); setError(''); controller.current = new AbortController();
    try { if (!ids.size) throw Error('No reviewed originals are linked to this view yet.'); if (ids.size !== selected.length) throw Error('A linked source is missing from this workspace. Open its check to review the missing original.'); const result = await verifyAuditSources(selected, { readOriginal, signal: controller.current.signal, onProgress: setMessage }); setProofs(old => ({ ...old, ...result.proofs })); setMessage('Saved originals checked. Any content changes remain flagged for review.'); }
    catch (e) { if (e.name !== 'AbortError') setProofs(old => ({ ...old, ...Object.fromEntries(selected.map(row => [row.id, { revision: sourceRevision(row), error: e.message }])) })); setError(e.name === 'AbortError' ? 'Original checking cancelled.' : e.message); setMessage(''); }
    finally { setBusy(false); }
  }
  function exportIndex() {
    const file = new Blob([JSON.stringify(auditIndex(model), null, 2)], { type: 'application/json' }), url = URL.createObjectURL(file), link = document.createElement('a');
    link.href = url; link.download = downloadName(area, model.week.from); document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function exportPacket() {
    setBusy(true); setError(''); setReady(null); controller.current = new AbortController();
    try {
      const selected = packetRowsFor(model); if (!selected.length) throw Error('Add or link source evidence before preparing a ZIP. The review index can be exported separately.');
      const result = await preparePacket(selected, { scenario: 'all', from: model.week.from, to: model.week.to, auditArea: area, auditScope: scope, includeUndated: true }, { ...(readOriginal ? { readOriginal } : {}), signal: controller.current.signal, onProgress: setMessage, auditIndex: auditIndex(model) });
      setReady({ ...result, url: URL.createObjectURL(result.file) }); setMessage(result.missing.length ? 'Packet prepared with missing originals identified in the manifest.' : 'Packet prepared with originals and the scoped audit review index.');
    } catch (e) { setError(e.name === 'AbortError' ? 'Preparation cancelled.' : e.message); setMessage(''); }
    finally { setBusy(false); }
  }
  const profileField = (name, label, type = 'text') => <label>{label}<input type={type} value={profileDraft[name] || ''} maxLength={name === 'reference' || name === 'applicabilityNote' ? 2000 : 300} onChange={e => setProfileDraft({ ...profileDraft, [name]: e.target.value })}/></label>;
  const statusClass = status => ['checked', 'not_applicable', 'not_due'].includes(status) ? status : 'attention';
  const groups = [model.items.filter(item => item.requirement.cadence === 'weekly'), model.items.filter(item => item.requirement.cadence !== 'weekly')];

  return <section className="rr-audit" aria-label="Audit preparation">
    <div className="rr-audit-heading"><div><h2>Audit preparation</h2><p>Check the evidence, its scope and its period.</p></div><button type="button" disabled={busy || !loaded} onClick={openProfile}>Company & applicability</button></div>
    <nav className="rr-audit-tabs" aria-label="Audit areas">{Object.entries(AREAS).map(([key, label]) => <button type="button" key={key} aria-pressed={area === key} disabled={busy} onClick={() => changeView(key)}>{label}</button>)}</nav>
    <div className="rr-audit-period">
      <button type="button" aria-label="Previous audit week" disabled={busy} onClick={() => { resetEditor(); setWeek(addDays(week, -7)); }}>‹</button>
      <label>Week of<input type="date" value={week} disabled={busy} onChange={e => { if (day(e.target.value)) { resetEditor(); setWeek(weekRange(e.target.value).from); } }}/></label>
      <button type="button" aria-label="Next audit week" disabled={busy} onClick={() => { resetEditor(); setWeek(addDays(week, 7)); }}>›</button>
      <span>Through {model.week.to}</span>
    </div>
    <div className="rr-audit-scope">
      <label>Vehicle / unit<input value={scope.unit} list="rr-audit-units" maxLength={60} disabled={busy} placeholder="Choose a unit" onChange={e => { resetEditor(); setScope({ ...scope, unit: e.target.value }); }}/><datalist id="rr-audit-units">{units.map(unit => <option key={unit} value={unit}/>)}</datalist></label>
      {area === 'safety' ? <label>Driver<select aria-label="Driver" value={scope.driverId} disabled={busy} onChange={e => { resetEditor(); setScope({ ...scope, driverId: e.target.value }); }}><option value="">Choose a driver</option>{drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name || driver.id}</option>)}</select></label> : null}
      <label>Load filter (optional)<input value={scope.loadNo} disabled={busy} maxLength={100} placeholder="All trips in scope" onChange={e => { resetEditor(); setScope({ ...scope, loadNo: e.target.value }); }}/></label>
    </div>
    {scope.loadNo ? <p className="rr-audit-note">Weekly vehicle/driver checks are limited to load {scope.loadNo}. Company and quarterly checks still cover the whole company; this filtered week does not establish total fleet distance.</p> : null}
    {model.profileBlock ? <p className="rr-audit-note">{model.profileBlock} <button type="button" disabled={busy || !loaded} onClick={openProfile}>Confirm profile</button></p> : <p className="rr-audit-context">{profile.company} · {area === 'ifta' ? `IFTA base: ${profile.iftaBase || 'not confirmed'}` : area === 'irp' ? `IRP base: ${profile.irpBase || 'not confirmed'}` : 'Federal property-carrier preparation'} · Profile confirmed by {profile.confirmedBy}</p>}
    {error ? <p role="alert" className="rr-audit-error">{error}</p> : null}{message ? <p role="status">{message}</p> : null}
    {!loaded && !error ? <p>Opening saved audit reviews…</p> : null}

    {profileDraft ? <form className="rr-audit-editor" onSubmit={saveProfile}>
      <h3>Confirm the applicable profile</h3><p>Use the company’s current records. IFTA base, IRP base and home-terminal time zone can differ. These entries document the audit scope; they do not change registration, permissions or the logbook.</p>
      <div className="rr-audit-grid">{profileField('company', 'Legal company name')}{profileField('effectiveFrom', 'Profile applies from', 'date')}</div>
      <label>Operations<select aria-label="Operations" value={profileDraft.operations} onChange={e => setProfileDraft({ ...profileDraft, operations: e.target.value })}><option value="unknown">Unconfirmed</option><option value="interstate_property">US interstate property carrier</option><option value="other">Other — requirements need review</option></select></label>
      <div className="rr-audit-grid">{profileField('jurisdictions', 'Operating jurisdictions')}{profileField('units', 'Vehicles / fleet in this company scope')}</div>
      {['ifta', 'irp'].map(key => <div className="rr-audit-grid" key={key}><label>{AREAS[key]} applicability<select aria-label={AREAS[key] + ' applicability'} value={profileDraft[key + 'Applies']} onChange={e => setProfileDraft({ ...profileDraft, [key + 'Applies']: e.target.value })}><option value="unknown">Unconfirmed</option><option value="required">Applies</option><option value="not_applicable">Not applicable — explain below</option></select></label>{profileField(key + 'Base', AREAS[key] + ' base jurisdiction (code)')}</div>)}
      <label>CDL / Part 382 applies in this company scope<select aria-label="CDL / Part 382 applies in this company scope" value={profileDraft.cdl} onChange={e => setProfileDraft({ ...profileDraft, cdl: e.target.value })}><option value="unknown">Unconfirmed</option><option value="yes">Yes</option><option value="no">No — explain below</option></select></label>
      {profileField('applicabilityNote', 'Applicability notes and any exceptions')}{profileField('reference', 'Source or reference used to confirm this profile')}{profileField('confirmedBy', 'Confirmed by')}
      <p className="rr-audit-note">A changed company, jurisdiction or scope makes earlier evidence reviews require another check. Their history remains saved.</p>
      <div className="rr-audit-actions"><button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save confirmed profile'}</button><button type="button" disabled={busy} onClick={() => setProfileDraft(null)}>Cancel</button></div>
      <details><summary>Profile history</summary>{(profile.history || []).slice().reverse().map((entry, i) => <p key={i}>{entry.at} · {entry.after?.confirmedBy} · {entry.after?.company} · IFTA {entry.after?.iftaBase || '?'} / IRP {entry.after?.irpBase || '?'}</p>)}</details>
    </form> : null}

    {editing && draft ? <form className="rr-audit-editor" onSubmit={saveReview}>
      <button type="button" disabled={busy} onClick={resetEditor}>‹ All checks</button><h3>{editing.requirement.title}</h3><p>{editing.scopeLabel}</p><p>{editing.period.id} · {editing.requirement.detail}</p>
      <label>Review result<select aria-label="Review result" value={draft.status} disabled={busy} onChange={e => setDraft({ ...draft, status: e.target.value })}><option value="needs_review">Needs review / unresolved</option><option value="checked">Evidence checked</option><option value="not_applicable">Not applicable to this scope — explain</option></select></label>
      <fieldset><legend>Link original evidence</legend><p>Choose the records that prove this check. Undated and older documents remain available for statements and credentials; confirm their actual coverage below.</p>
        <div className="rr-audit-source-list">{editing.eligible.map(row => <div key={row.id} className="rr-audit-source"><label><input type="checkbox" checked={draft.sourceIds.includes(row.id)} disabled={busy} onChange={e => setDraft({ ...draft, sourceIds: e.target.checked ? [...new Set([...draft.sourceIds, row.id])] : draft.sourceIds.filter(id => id !== row.id) })}/><span>{row.name}<small>{[row.date || 'Undated', row.unit ? 'Unit ' + row.unit : '', row.loadNo ? 'Load ' + row.loadNo : ''].filter(Boolean).join(' · ')}</small></span></label><button type="button" disabled={busy || !onOpen} onClick={() => onOpen(row)}>{row.kind === 'log' ? 'Open log' : 'Original'}</button></div>)}</div>
        {!editing.eligible.length ? <p>No matching original is available. Add the source, then reopen this review.</p> : null}
        {(draft.sourceIds || []).filter(id => !editing.eligible.some(row => row.id === id)).map(id => <p className="rr-audit-error" key={id}>Previously linked source missing or outside scope: {id}</p>)}
      </fieldset>
      <div className="rr-audit-grid"><label>Evidence covers from<input type="date" value={draft.coverageFrom} disabled={busy} onChange={e => setDraft({ ...draft, coverageFrom: e.target.value })}/></label><label>Evidence covers through / expires<input type="date" value={draft.coverageThrough} disabled={busy} onChange={e => setDraft({ ...draft, coverageThrough: e.target.value })}/></label></div>
      <fieldset><legend>Confirm content against the selected originals</legend>{editing.requirement.questions.map((question, i) => <label className="rr-audit-check" key={question}><input type="checkbox" checked={draft.confirmations[i] === true} disabled={busy} onChange={e => { const confirmations = [...draft.confirmations]; confirmations[i] = e.target.checked; setDraft({ ...draft, confirmations }); }}/><span>{question}</span></label>)}</fieldset>
      <label>Notes / reason / unresolved items<textarea value={draft.note} disabled={busy} maxLength={3000} onChange={e => setDraft({ ...draft, note: e.target.value })}/></label><label>Reviewed by<input value={draft.reviewer} disabled={busy} maxLength={180} onChange={e => setDraft({ ...draft, reviewer: e.target.value })}/></label>
      <p>{selectedRows.length} linked source{selectedRows.length === 1 ? '' : 's'} · Saving verifies original bytes and retains the prior review.</p>
      <div className="rr-audit-actions"><button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Save evidence review'}</button><button type="button" disabled={busy} onClick={resetEditor}>Cancel</button></div>
      {editing.review?.history?.length ? <details><summary>Review history</summary>{editing.review.history.slice().reverse().map((entry, i) => <p key={i}>{entry.at} · {entry.after?.reviewer} · {STATUS[entry.after?.status] || entry.after?.status} · {entry.after?.note}</p>)}</details> : null}
    </form> : null}

    {!editing && !profileDraft ? <>
      <div className="rr-audit-summary" aria-label="Audit review counts"><strong>{model.counts.checked}<span>Evidence checked</span></strong><strong>{model.counts.attention}<span>Need attention</span></strong><strong>{model.counts.notApplicable}<span>Not applicable</span></strong><strong>{model.counts.notDue}<span>Not due yet</span></strong></div>
      {groups.map((items, index) => items.length ? <section key={index} className="rr-audit-group"><h3>{index === 0 ? 'This week' : 'Filings, credentials and expiration dates'}</h3><p>{index === 0 ? 'Review operational evidence for the selected period.' : 'These checks use their own quarter, year or validity period. Older issue dates stay available while the evidence remains valid.'}</p>
        {items.map(item => <article className="rr-audit-item" key={item.id}><div className="rr-audit-item-top"><h4>{item.requirement.title}</h4><span className={'rr-audit-status rr-audit-status-' + statusClass(item.status)}>{STATUS[item.status]}</span></div><small>{cadenceLabel[item.requirement.cadence]} · {item.period.id.startsWith('validity') ? 'Assessing ' + model.week.from + ' – ' + model.week.to : item.period.id.replace(/^(week|year)\//, '')}</small><p className="rr-audit-context">{item.scopeLabel}</p><p>{item.reason}</p>
          <div className="rr-audit-actions"><button type="button" disabled={busy || !loaded} onClick={() => edit(item)}>{item.review ? 'Review / history' : 'Review evidence'}</button>{item.status !== 'not_applicable' ? <button type="button" disabled={busy || !onAdd} onClick={() => onAdd({ category: item.requirement.add, unit: item.scope.unit, loadNo: item.scope.loadNo, auditRequirement: item.requirement.id })}>Add {item.requirement.add === 'fuel' ? 'fuel evidence' : 'evidence'}</button> : null}</div>
          <details><summary>What this check covers</summary><p>{item.requirement.detail}</p><p><strong>Retention:</strong> {item.requirement.retention}</p><p>{item.candidates.length} suggested source{item.candidates.length === 1 ? '' : 's'} · Rule set {RULESET}</p>{item.sources.length ? item.sources.map(source => <p key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a>{source.related ? <> · <a href={source.related} target="_blank" rel="noreferrer">Related requirement</a></> : null}</p>) : <p>The confirmed base jurisdiction needs a specific source review.</p>}</details>
        </article>)}
      </section> : null)}
      <div className="rr-audit-export"><h3>Review and export</h3><p>{model.scopeNotice}</p><p>The ZIP includes sources explicitly linked to these reviews, including credentials issued outside this week. Missing or changed originals are identified in the audit index.</p><div className="rr-audit-actions"><button type="button" disabled={busy || !loaded} onClick={verifySaved}>Check linked originals</button><button type="button" disabled={busy || !loaded} onClick={exportIndex}>Export review index</button><button type="button" disabled={busy || !loaded} onClick={exportPacket}>Prepare evidence ZIP</button>{busy ? <button type="button" onClick={() => controller.current?.abort()}>Cancel checking</button> : null}</div>
        {ready ? <div className="rr-audit-ready"><p>{ready.originals} original files · {ready.records} source records · {ready.missing.length} unavailable originals listed</p><a href={ready.url} download={ready.file.name}>Save ZIP with audit review index</a></div> : null}
      </div>
    </> : null}
  </section>;
}
