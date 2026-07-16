import React, { useMemo } from 'react';
import HosCompactClocks from '../drive/HosCompactClocks.jsx';
import { dispatchLoadGuideActionV103, getActiveLoadGuideV103, resolveDriverGuideV103 } from '../loads/loadGuideV103.js';
import { homeModeV1038, missionSnapshotV1038 } from './adaptiveHomeLogicV1038.js';

const shortStatus = value => value === 'D' ? 'D' : (value || 'OFF');
const money = value => Number(value || 0).toLocaleString(undefined, { style:'currency', currency:'USD', maximumFractionDigits:0 });

function routeUrl(step = {}) {
  const destination = step.location || [step.city, step.state].filter(Boolean).join(', ');
  return destination ? `https://www.google.com/maps/dir/?${new URLSearchParams({ api:'1', destination, travelmode:'driving' })}` : '';
}

function runStep(guide, step, onScan) {
  if (!guide || !step || step.complete) return;
  if (step.kind === 'route') {
    const url = routeUrl(step);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  if (step.kind === 'status') {
    dispatchLoadGuideActionV103({ action:'open_status', guideId:guide.id, stepId:step.id, step });
    return;
  }
  if (step.kind === 'document') {
    onScan?.(step.documentType || 'auto');
    return;
  }
  dispatchLoadGuideActionV103({ action:step.kind === 'complete_stop' ? 'complete_stop' : 'toggle_done', guideId:guide.id, stepId:step.id, step });
}

function actionLabel(step = {}) {
  if (step.kind === 'route') return 'Open route';
  if (step.kind === 'status') return step.status === 'D' ? 'Start driving' : 'Log status';
  if (step.kind === 'document') return step.documentType === 'pod' ? 'Scan POD' : 'Scan document';
  if (step.kind === 'complete_stop') return 'Complete stop';
  return 'Mark done';
}

function Status({ summary, onStatus, onTrailer }) {
  return (
    <section className="adaptive-status-v1038">
      <button type="button" onClick={onStatus}><strong className={`adaptive-duty-v1038 ${summary.status}`}>{shortStatus(summary.status)}</strong><span><b>{summary.label}</b><em>{summary.location}</em></span><i>›</i></button>
      <button type="button" onClick={onTrailer}>{summary.vehicle}</button>
    </section>
  );
}

function Hos({ state, onLog }) {
  return <section className="adaptive-hos-v1038"><header><b>Hours of service</b><button type="button" onClick={onLog}>Open logbook</button></header><HosCompactClocks state={state}/></section>;
}

function Quick({ title, detail, onClick, primary = false }) {
  return <button type="button" className={`adaptive-quick-v1038 ${primary ? 'primary' : ''}`} onClick={onClick}><b>{title}</b><em>{detail}</em></button>;
}

function NoLoad({ state, summary, business, walletCard, logbookEnabled, onStatus, onTrailer, onLog, onDot, onWallet, onScan, onSection }) {
  return (
    <main className="adaptive-home-v1038 no-load">
      <Status summary={summary} onStatus={onStatus} onTrailer={onTrailer}/>
      {logbookEnabled ? <Hos state={state} onLog={onLog}/> : null}
      <section className="adaptive-no-load-v1038">
        <span>NO ACTIVE LOAD</span><h1>Ready for the next Rate Con</h1>
        <p>Scan it once. Road Ready will build the route, stop sequence, appointments, instructions and document checklist.</p>
        <button type="button" onClick={onScan}>Scan Rate Con</button>
      </section>
      <section className="adaptive-quick-grid-v1038">
        {logbookEnabled ? <Quick title="Logbook" detail={summary.label} onClick={onLog}/> : null}
        <Quick title="Scan" detail="Documents" onClick={onScan}/>
        <Quick title="Wallet" detail={walletCard?.status === 'ok' ? 'Ready' : 'Review'} onClick={onWallet}/>
        <Quick title="Loads" detail="Open" onClick={() => onSection('loads')}/>
      </section>
      <section className="adaptive-mini-tools-v1038">
        <button type="button" onClick={onDot}><b>DOT Mode</b><em>Roadside</em></button>
        <button type="button" onClick={() => onSection('documents')}><b>Documents</b><em>Vault</em></button>
        <button type="button" onClick={() => onSection('billing')}><b>Billing</b><em>{business?.readyToInvoice || 0} ready</em></button>
        <button type="button" onClick={() => onSection('overview')}><b>More tools</b><em>Business</em></button>
      </section>
    </main>
  );
}

function ActiveLoad({ state, summary, activeLoad, snapshot, logbookEnabled, onStatus, onTrailer, onLog, onScan, onGuide, onSection }) {
  const guide = snapshot.guide;
  const step = snapshot.currentStep;
  const stop = snapshot.currentStop;
  const loadNo = guide?.loadNo || guide?.orderNo || activeLoad?.loadNo || 'Active load';
  const location = stop?.cityState || step?.location || activeLoad?.nextDestination || activeLoad?.destination || '';
  const company = stop?.company || step?.detail || location || 'Next stop';
  const appointment = stop?.appointment || [step?.day, step?.time].filter(Boolean).join(' · ') || activeLoad?.appointment || '';
  const stopCount = Number(guide?.deliveryCount || activeLoad?.stopCount || 0);
  const completedStops = Number(activeLoad?.completedStops || 0);
  const navigateStep = step?.kind === 'route' ? step : { kind:'route', location };
  return (
    <main className="adaptive-home-v1038 active-load">
      <Status summary={summary} onStatus={onStatus} onTrailer={onTrailer}/>
      <section className="adaptive-mission-v1038">
        <header><div><span>ACTIVE LOAD COMMAND</span><h1>{loadNo}</h1><p>{guide?.origin || activeLoad?.origin || 'Pickup'} → {guide?.destination || activeLoad?.destination || 'Final delivery'}</p></div><strong>{snapshot.percent}%</strong></header>
        <div className="adaptive-progress-v1038"><i><span style={{ width:`${snapshot.percent}%` }}/></i><em>{snapshot.completed}/{snapshot.total} steps · {completedStops}/{stopCount || '—'} deliveries</em></div>
        <article className="adaptive-current-step-v1038">
          <span>DO THIS NOW</span><h2>{step?.title || `Continue to ${company}`}</h2><p>{[company, location, appointment].filter(Boolean).join(' · ')}</p>
          {stop?.poNumber ? <b>PO {stop.poNumber}</b> : guide?.pickupNumber && !completedStops ? <b>Pickup # {guide.pickupNumber}</b> : null}
        </article>
        {snapshot.instructions.length ? <section className="adaptive-instructions-v1038"><header><b>Do not miss from Rate Con</b><em>{snapshot.instructions.length} items</em></header>{snapshot.instructions.map(item => <div key={item.id || item.label} className={item.tone === 'required' ? 'required' : ''}><span>✓</span><p><b>{item.label}</b><em>{item.detail}</em></p></div>)}</section> : null}
        <div className="adaptive-mission-actions-v1038"><button type="button" className="primary" disabled={!step} onClick={() => runStep(guide, step, onScan)}>{step ? actionLabel(step) : 'Load complete'}</button><button type="button" onClick={onGuide}>Full mission</button></div>
        {snapshot.nextSteps.length ? <section className="adaptive-upcoming-v1038"><b>Coming next</b>{snapshot.nextSteps.map((item, index) => <div key={item.id}><span>{index + 1}</span><p><b>{item.title}</b><em>{[item.location, item.day, item.time].filter(Boolean).join(' · ')}</em></p></div>)}</section> : null}
      </section>
      {activeLoad?.docs?.length === 0 ? <button type="button" className="adaptive-alert-v1038" onClick={onScan}><strong>!</strong><span><b>Pickup BOL missing</b><em>Scan it before billing or roadside review.</em></span><i>›</i></button> : null}
      {logbookEnabled ? <Hos state={state} onLog={onLog}/> : null}
      <section className="adaptive-quick-grid-v1038 active">
        <Quick title="Navigate" detail={location || 'Next stop'} primary onClick={() => runStep(guide, navigateStep, onScan)}/>
        <Quick title="Arrived / Status" detail={summary.label} onClick={onStatus}/>
        <Quick title="Scan paperwork" detail="BOL · POD · receipt" onClick={onScan}/>
        <Quick title="Billing" detail={activeLoad?.gross ? money(activeLoad.gross) : 'Load folder'} onClick={() => onSection('billing')}/>
      </section>
      <button type="button" className="adaptive-more-v1038" onClick={() => onSection('overview')}><b>Business, IFTA, tolls, maintenance and audit tools</b><i>›</i></button>
    </main>
  );
}

export default function AdaptiveHomeV1038(props) {
  const guide = useMemo(() => getActiveLoadGuideV103(props.state), [props.state]);
  const progress = useMemo(() => resolveDriverGuideV103(props.state, guide), [props.state, guide]);
  const snapshot = useMemo(() => missionSnapshotV1038(progress, props.activeLoad), [progress, props.activeLoad]);
  const mode = homeModeV1038(guide, props.activeLoad);
  const shared = {
    state:props.state, summary:props.summary, activeLoad:props.activeLoad, business:props.business, walletCard:props.walletCard,
    logbookEnabled:props.logbookEnabled, onStatus:props.onOpenStatus, onTrailer:props.onOpenTrailer, onLog:props.onOpenDay,
    onDot:props.onOpenDot, onWallet:props.onOpenWallet, onScan:props.onOpenScan, onGuide:props.onOpenGuide, onSection:props.onOpenSection,
  };
  return mode === 'active_load' ? <ActiveLoad {...shared} snapshot={snapshot}/> : <NoLoad {...shared}/>;
}
