'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { MODULE_CATALOG, moduleEnabled } from '../setup/operatorProfile.js';
import { businessLoadRows, operationalCandidateContext } from '../loads/currentLoadV110473.js';
import { resolveDriverGuideV103 } from '../loads/loadGuideV103.js';
import { missionSnapshotV1038 } from './adaptiveHomeLogicV1038.js';
import { getHomeTerminalTimeZone } from '../../core/time/homeTerminalTime.js';
import { isSyntheticEvent } from '../../core/compliance/rawRodsChecks.js';
import HosCompactClocks from '../drive/HosCompactClocks.jsx';
import GrossBoard from '../owneros/GrossBoard.jsx';
import ManualLoadForm from '../owneros/ManualLoadForm.jsx';
import { closedLoad } from '../owneros/manualLoadCore.js';
import { requestLoadFolder } from '../owneros/folderRequest.js';
import { attachmentContext } from '../scan/attachmentContextV110426.js';
import { AppIcon } from './PhoneHomeToolsV110435.jsx';
import { LoadHistory, MissionScreen } from './DriverDashboard.jsx';
import { todayStop } from './todayStop.js';
import TodayNav from './TodayNav.jsx';

function StopCard({ current, stop, openLoads, openTrip, onScan, onCreate, hasChoices, snapshot }) {
  const [copyMessage, setCopyMessage] = useState('');
  useEffect(() => setCopyMessage(''), [current?.loadNo, stop?.address.display]);
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(stop.address.display);
      setCopyMessage('Address copied');
    } catch {
      setCopyMessage('Press and hold the address to copy it.');
    }
  }
  if (!current) return <section className="rr-today-card rr-today-empty" aria-label="Active load folder">
    <span className="rr-today-kicker">Load</span>
    <h2>{hasChoices ? 'Choose your active load' : 'No active load'}</h2>
    <div className="rr-today-actions">
      {hasChoices ? <button className="primary" onClick={() => openLoads()}>Choose saved load</button> : <button className="primary" onClick={() => onScan('rate_confirmation')}>Scan Rate Confirmation</button>}
      <button onClick={onCreate}>+ New load manually</button>
    </div>
  </section>;
  const reference = current.identity === 'reference';
  const number = current.canonicalLoadNo || current.loadNo || current.shipmentReference;
  const openFolder = () => openLoads(reference ? 'shipment:' + (current.shipmentReference || number) : number);
  const actions = snapshot?.currentStep;
  const attachment = actions?.kind === 'document' && attachmentContext(current.guide, actions);
  const place = stop?.address;
  const mapUrl = place?.routable ? 'https://www.google.com/maps/dir/?' + new URLSearchParams({api:'1', destination:place.display, travelmode:'driving'}) : '';
  return <section className="rr-today-card rr-current-stop" aria-label="Active load folder">
    <div className="rr-today-stop">
      <div className="rr-today-row"><span className="rr-today-kicker">{stop ? 'Next stop' : 'Trip details'}</span>{stop && <strong className="rr-today-kind">{stop.label}</strong>}</div>
      <h2>{stop?.company || place?.display || (attachment ? 'Delivery paperwork' : stop ? 'Stop details needed' : 'Review trip details')}</h2>
      {place?.display && stop.company && <p className="rr-today-address">{place.display}</p>}
      {stop && !place.routable && <p className="rr-today-note">Confirm the street address in the load paperwork.</p>}
      {stop?.appointment && <div className="rr-today-appt"><span>{stop.scheduledDayOnly ? 'Scheduled date · time unconfirmed' : 'Appointment'}</span><b>{stop.appointment}{stop.zone && !stop.appointment.includes(stop.zone) ? ' · ' + stop.zone : ''}</b></div>}
      {stop && !stop.appointment && <p className="rr-today-note">Appointment not recorded</p>}
      {stop?.reference && <p className="rr-today-ref">{stop.reference}</p>}
      {mapUrl && <div className="rr-today-actions"><a className="primary" href={mapUrl} target="_blank" rel="noreferrer">Directions</a><button onClick={copyAddress}>Copy address</button></div>}
      {copyMessage && <span role="status" className="rr-today-note">{copyMessage}</span>}
      {attachment && <button className="rr-today-add-paper" onClick={() => onScan(attachment.type, attachment)}>{attachment.type === 'pod' ? 'Add signed POD' : 'Add pickup BOL'}</button>}
    </div>
    <div className="rr-today-load">
      <div><span className="rr-today-kicker">{reference ? 'Shipment reference' : 'Active load'}</span><h3>#{number}</h3>
      {(current.origin || current.destination) && <p>{[current.origin,current.destination].filter(Boolean).join(' → ')}</p>}</div>
      <div className="rr-today-links"><button onClick={openFolder} aria-label="Open active load · Documents">{reference ? 'Review folder' : 'Load folder'}</button>
      {current.guide && <button onClick={openTrip} aria-label="Active Load">Open trip</button>}</div>
    </div>
  </section>;
}

export default function TodayDashboard(props) {
  const { state, summary, businessStore, business, operatorProfile, tab, onTab, onSection, onScan, onOpenLogbook, onLog } = props;
  const [mission, setMission] = useState(false);
  const [creating, setCreating] = useState(false);
  const context = useMemo(() => operationalCandidateContext(state, businessStore), [state, businessStore]);
  const current = context.current;
  const rows = useMemo(() => businessLoadRows(businessStore, context), [businessStore, context]);
  const record = rows.find(r => current?.identity === 'load' && (r.id && r.id === current.recordId || (r.canonicalLoadNo || r.loadNo) === current.canonicalLoadNo));
  const guide = current?.guide;
  const snapshot = useMemo(() => guide ? missionSnapshotV1038(resolveDriverGuideV103(state, guide, businessStore), current) : null, [state, guide, businessStore, current]);
  const stop = todayStop(current, record, snapshot);
  const enabled = id => moduleEnabled(operatorProfile, id);
  const showLoads = enabled('loads');
  const showLog = props.logbookEnabled && enabled('logbook');
  const hasRecordedDuty = useMemo(() => Object.values(state.eventsByDay || {}).some(rows => Array.isArray(rows) &&
    rows.some(event => event && !event.voided && !isSyntheticEvent(event) && ['D','SB','ON','OFF'].includes(event.status))), [state.eventsByDay]);
  function openLoads(number) {
    if (number) requestLoadFolder(number);
    onSection('load_documents');
  }
  useEffect(() => { window.scrollTo(0, 0); }, [tab, mission, creating]);
  const changeTab = next => { setMission(false); setCreating(false); onTab(next); };
  const date = new Intl.DateTimeFormat('en-US', { weekday:'long', month:'long', day:'numeric', timeZone:getHomeTerminalTimeZone(state) }).format(new Date());
  if (creating) return <ManualLoadForm onClose={() => setCreating(false)} onSaved={load => { setCreating(false); openLoads(load.loadNo); }}/>;
  if (mission) return <MissionScreen {...props} onBack={() => setMission(false)} onOpenLog={onLog} onOpenStatus={props.onStatus} onOpenTrailer={props.onTrailer}/>;
  const activeAlerts = [
    showLog && props.unsigned > 0 && [props.unsigned + ' log day(s) to sign', props.onOpenUnsigned],
    showLoads && business?.readyToInvoice > 0 && [business.readyToInvoice + ' load(s) ready for invoice', () => onSection('billing')],
    enabled('fuel') && business?.missingFuelReceipts > 0 && [business.missingFuelReceipts + ' fuel receipt(s) to review', () => onSection('fuel')],
  ].filter(Boolean);
  const tools = [
    ['Business dashboard', () => onSection('overview')],
    ...(showLoads ? [['Billing', () => onSection('billing')], ['Manage load details', () => onSection('loads')], ['Trip details', () => setMission(true), 'Active Load']] : []),
    ...(enabled('documents') ? [['Documents', () => onSection('documents')]] : []),
    ...(enabled('wallet') ? [['Wallet', props.onWallet]] : []),
    ...(enabled('drive') ? [['Drive', props.onDrive]] : []),
    ...MODULE_CATALOG.filter(m => ['settlements','money','fuel','expenses','performance','maintenance'].includes(m.id) && enabled(m.id)).map(m => [m.label, () => onSection(m.id)]),
    ['My month', () => onSection('my_month')], ['Import', () => onSection('import_documents')], ['Export & Backup', props.onOpenBackup], ['Settings', props.onSettings],
  ];
  return <section className="screen rr-driver-home rr-today">
    <header className="rr-today-brand"><span><AppIcon name="loads"/>Road Ready</span><button onClick={props.onTrailer} aria-label={'Equipment ' + summary.vehicle}>{summary.vehicle}</button></header>
    <main className="rr-today-main">
      <div className="rr-today-title"><div>{tab !== 'more' && <span className="rr-today-kicker">{date}</span>}<h1>{tab === 'more' ? 'More' : 'Today'}</h1></div>
        {tab !== 'more' && showLog && <button className="rr-today-status" onClick={props.onStatus}>{hasRecordedDuty ? summary.label : 'Duty status'}</button>}
      </div>
      {tab === 'more' ? <>
        <GrossBoard store={businessStore} state={state}/>
        <section className="rr-today-more-tools" aria-label="Additional tools">{tools.map(([label, action, name]) =>
          <button key={label} type="button" onClick={action} aria-label={name}>{label}<span aria-hidden="true">›</span></button>)}</section>
        {showLoads && <LoadHistory store={businessStore} state={state} activeNo={current?.loadNo} onOpenLoads={openLoads}/>}
      </> : <>
        {showLoads && <StopCard current={current} stop={stop} openLoads={openLoads} openTrip={() => setMission(true)} onScan={onScan} onCreate={() => setCreating(true)} snapshot={snapshot} hasChoices={rows.some(r => !r.deleted && !r.deletedAt && !closedLoad(r))}/>}
        {props.savedScan && <section className="rr-today-card rr-today-task"><strong>Your original document is saved.</strong><button onClick={() => props.onContinueSavedScan?.(props.savedScan)} disabled={props.savedScanBusy}>{props.savedScanBusy ? 'Opening…' : 'Continue saved scan'}</button>{props.savedScanMessage && <p role="alert">{props.savedScanMessage}</p>}</section>}
        {showLog && <section className="rr-today-card rr-today-hos" aria-label="Hours of service">
          {hasRecordedDuty ? <HosCompactClocks state={state}/> : <><h2>Hours of service</h2><p>No recorded duty history available on this device.</p></>}
        </section>}
        <div className="rr-today-utilities"><button onClick={() => onScan('auto')}><AppIcon name="scan"/>Smart Scan</button>{enabled('dot') && <button onClick={props.onDot}><AppIcon name="dot"/>DOT Mode</button>}</div>
        {activeAlerts.length > 0 && <details className="rr-today-attention"><summary>Needs attention <strong>{activeAlerts.length}</strong></summary>{activeAlerts.map(([label, action]) => <button key={label} onClick={action}>{label}</button>)}</details>}
      </>}
    </main>
    <TodayNav active={tab} onToday={() => changeTab('today')} onLoads={showLoads ? () => openLoads() : undefined} onLog={showLog ? onOpenLogbook || onLog : undefined} onMore={() => changeTab('more')}/>
  </section>;
}
