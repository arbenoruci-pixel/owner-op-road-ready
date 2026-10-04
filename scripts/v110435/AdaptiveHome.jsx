import {attachmentContext} from '../scan/attachmentContextV110426.js';
import React, { useMemo } from 'react';
import {PhoneHomeTools,DeviceHistoryNote} from './PhoneHomeToolsV110435.jsx';
import {loadDocumentSummaryV105} from '../documents/documentFoundationV105.js';
import {currentHomeLoad,cleanRoutePlace} from './currentHomeLoadV110369.js';
import {localDayKey} from '../../shared/utils/date.js';
import {nowMin} from '../../shared/utils/time.js';
import {useChecklistStoreV110321} from '../loads/useChecklistStoreV110321.js';
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
  if (!step || step.complete) return;
  if (step.kind === 'route') {
    const url = routeUrl(step);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  if (!guide) return;
  if (step.kind === 'document') {
    onScan?.(step.documentType || 'auto', attachmentContext(guide, step));
    return;
  }
  dispatchLoadGuideActionV103({ action:step.kind === 'complete_stop' ? 'complete_stop' : 'toggle_done', guideId:guide.id, stepId:step.id, step });
}

function actionLabel(step = {}) {
  if (step.kind === 'route') return 'Open route';
  if (step.kind === 'document') return 'Add';
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

function NoLoad(props) {
  const {savedScan,onContinueSavedScan,savedScanBusy,savedScanMessage,state,summary,onStatus,onTrailer}=props;
  return <main className="adaptive-home-v1038 no-load phone-home-main">
    <Status summary={summary} onStatus={onStatus} onTrailer={onTrailer}/>
    <PhoneHomeTools {...props}/>
    {savedScan?<section className="phone-saved-scan"><div><strong>Continue saved scan</strong><p>Your original is saved. Finish filing it to its load.</p></div><button type="button" disabled={savedScanBusy} onClick={()=>onContinueSavedScan?.(savedScan)}>{savedScanBusy?'Opening…':'Continue saved scan'}</button>{savedScanMessage?<p role="alert">{savedScanMessage}</p>:null}</section>:null}
    <DeviceHistoryNote state={state}/>
  </main>;
}

function ActiveLoad({ state, summary, activeLoad, currentLoad, snapshot, logbookEnabled, onStatus, onTrailer, onLog, onScan, onGuide, onSection, onDot, onWallet, onBackup, onDrive, operatorProfile }) {
  const guide = snapshot.guide;
  const step = snapshot.currentStep;
  const stop = snapshot.currentStop;
  const loadNo = currentLoad?.loadNo || guide?.loadNo || guide?.orderNo || activeLoad?.loadNo || 'Active load';
  const location = stop?.cityState || step?.location || activeLoad?.nextDestination || activeLoad?.destination || '';
  const company = stop?.company || step?.detail || location || 'Next stop';
  const appointment = stop?.appointment || [step?.day, step?.time].filter(Boolean).join(' · ') || activeLoad?.appointment || '';
  const stopCount = Number(guide?.deliveryCount || activeLoad?.stopCount || 0);
  const completedStops = Number(activeLoad?.completedStops || 0);
  const navigateStep = step?.kind === 'route' ? step : { kind:'route', location };
  return (
    <main className="adaptive-home-v1038 active-load phone-home-main">
      <Status summary={summary} onStatus={onStatus} onTrailer={onTrailer}/>
      <section className="adaptive-mission-v1038">
        <header><div><span>ACTIVE LOAD COMMAND</span><h1>{loadNo}</h1><p>{currentLoad?.origin || cleanRoutePlace(activeLoad?.origin) || 'Pickup location needed'} → {currentLoad?.destination || cleanRoutePlace(activeLoad?.destination) || 'Delivery location needed'}</p></div>{guide?<strong>{snapshot.percent}%</strong>:null}</header>
        {guide?<>
        <div className="adaptive-progress-v1038"><i><span style={{ width:`${snapshot.percent}%` }}/></i><em>{snapshot.completed}/{snapshot.total} steps · {completedStops}/{stopCount || '—'} deliveries</em></div>
        <article className="adaptive-current-step-v1038">
          <span>DO THIS NOW</span><h2>{step?.title || `Continue to ${company}`}</h2><p>{[company, location, appointment].filter(Boolean).join(' · ')}</p>
          {stop?.poNumber ? <b>PO {stop.poNumber}</b> : guide?.pickupNumber && !completedStops ? <b>Pickup # {guide.pickupNumber}</b> : null}
        </article>
        {snapshot.instructions.length ? <section className="adaptive-instructions-v1038"><header><b>Do not miss from Rate Con</b><em>{snapshot.instructions.length} items</em></header>{snapshot.instructions.map(item => <div key={item.id || item.label} className={item.tone === 'required' ? 'required' : ''}><span>✓</span><p><b>{item.label}</b><em>{item.detail}</em></p></div>)}</section> : null}
        <div className="adaptive-mission-actions-v1038"><button type="button" className="primary" disabled={!step && !(snapshot.total > 0 && snapshot.completed === snapshot.total)} onClick={() => step ? runStep(guide, step, onScan) : dispatchLoadGuideActionV103({action:'complete_guide',guideId:guide.id})}>{step ? actionLabel(step) : 'Complete load'}</button><button type="button" onClick={()=>onGuide?.(guide.id)}>Full mission</button></div>
        {snapshot.nextSteps.length ? <section className="adaptive-upcoming-v1038"><b>Coming next</b>{snapshot.nextSteps.map((item, index) => <div key={item.id}><span>{index + 1}</span><p><b>{item.title}</b><em>{[item.location, item.day, item.time].filter(Boolean).join(' · ')}</em></p></div>)}</section> : null}
        </>:<div className="adaptive-mission-actions-v1038"><button type="button" className="primary" onClick={()=>onSection('loads')}>Open load</button></div>}
      </section>
      {!(snapshot.bolPresent || activeLoad?.documentSummary?.bolPresent) ? <button type="button" className="adaptive-alert-v1038" onClick={() => onScan?.('bol')}><strong>!</strong><span><b>Pickup BOL missing</b><em>Scan it before billing or roadside review.</em></span><i>›</i></button> : null}
      {logbookEnabled ? <Hos state={state} onLog={onLog}/> : null}
      <PhoneHomeTools operatorProfile={operatorProfile} onScan={onScan} onSection={onSection} onLog={onLog} onDot={onDot} onWallet={onWallet} onBackup={onBackup} onDrive={onDrive}/>

    </main>
  );
}

export default function AdaptiveHomeV1038(props) {
  const checklistStore = useChecklistStoreV110321();
  const selectedGuide = useMemo(() => getActiveLoadGuideV103(props.state), [props.state, checklistStore]);
  const currentLoad = currentHomeLoad(props.state,selectedGuide,{day:localDayKey(),minute:nowMin()});
  const guide=currentLoad?.guide||null;
  const scopedLoad=currentLoad?{...(props.activeLoad?.guideId===guide?.id?props.activeLoad:{}),...currentLoad,documentSummary:loadDocumentSummaryV105(checklistStore,currentLoad.loadNo),docs:props.activeLoad?.guideId===guide?.id?props.activeLoad?.docs||[]:[]}:null;
  const progress = useMemo(() => guide?resolveDriverGuideV103(props.state, guide, checklistStore):{guide:null,steps:[]}, [props.state, guide, checklistStore]);
  const snapshot = useMemo(() => missionSnapshotV1038(progress, scopedLoad), [progress, scopedLoad]);
  const mode = homeModeV1038(guide, scopedLoad);
  const shared = {
    savedScan:props.savedScan,onContinueSavedScan:props.onContinueSavedScan,savedScanBusy:props.savedScanBusy,savedScanMessage:props.savedScanMessage,
    state:props.state, summary:props.summary, activeLoad:scopedLoad, currentLoad, business:props.business, walletCard:props.walletCard, operatorProfile:props.operatorProfile, onDrive:props.onOpenDrive,
    logbookEnabled:props.logbookEnabled, onStatus:props.onOpenStatus, onTrailer:props.onOpenTrailer, onLog:props.onOpenDay,
    onDot:props.onOpenDot, onWallet:props.onOpenWallet, onBackup:props.onOpenBackup, onScan:props.onOpenScan, onGuide:props.onOpenGuide, onSection:props.onOpenSection,
  };
  return mode === 'active_load' ? <ActiveLoad {...shared} snapshot={snapshot}/> : <NoLoad {...shared}/>;
}
