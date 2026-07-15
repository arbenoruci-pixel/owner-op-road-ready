import React, { useMemo, useState } from 'react';
import { dispatchLoadGuideActionV103, getActiveLoadGuideV103, resolveDriverGuideV103 } from './loadGuideV103.js';

function Icon({ name, size = 18 }) {
  const p = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:'1.9', strokeLinecap:'round', strokeLinejoin:'round', 'aria-hidden':'true' };
  if (name === 'check') return <svg {...p}><path d="m5 12 4 4L19 6"/></svg>;
  if (name === 'route') return <svg {...p}><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h3a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3"/></svg>;
  if (name === 'scan') return <svg {...p}><path d="M4 8V5h4M16 4h4v4M20 16v4h-4M8 20H4v-4M7 12h10"/></svg>;
  if (name === 'log') return <svg {...p}><path d="M6 3h9l3 3v15H6zM15 3v4h4M9 11h6M9 15h6"/></svg>;
  if (name === 'back') return <svg {...p}><path d="m15 18-6-6 6-6"/></svg>;
  if (name === 'truck') return <svg {...p}><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>;
  return <svg {...p}><path d="m9 18 6-6-6-6"/></svg>;
}

function money(value = 0) {
  return Number(value || 0).toLocaleString(undefined, { style:'currency', currency:'USD', maximumFractionDigits:0 });
}

function when(step = {}) {
  const parts = [];
  if (step.day) {
    const d = new Date(`${step.day}T12:00:00`);
    parts.push(Number.isNaN(d.getTime()) ? step.day : d.toLocaleDateString(undefined, { month:'short', day:'numeric' }));
  }
  if (step.time) parts.push(step.time);
  return parts.join(' · ');
}

function mapsUrl(step = {}) {
  const destination = step.location || [step.city, step.state].filter(Boolean).join(', ');
  return destination ? `https://www.google.com/maps/dir/?${new URLSearchParams({ api:'1', destination, travelmode:'driving' })}` : '';
}

function meta(step = {}) {
  if (step.kind === 'status') return { label:step.status === 'D' ? 'Log Driving' : 'Log now', icon:'log', tone:'log' };
  if (step.kind === 'document') return { label:step.documentType === 'pod' ? 'Scan POD' : 'Scan BOL', icon:'scan', tone:'scan' };
  if (step.kind === 'route') return { label:'Open route', icon:'route', tone:'route' };
  return { label:step.kind === 'complete_stop' ? 'Complete stop' : 'Mark done', icon:'check', tone:'done' };
}

function runStep(guide, step, onOpenScan) {
  if (!guide || !step || step.complete) return;
  if (step.kind === 'route') {
    const url = mapsUrl(step);
    if (url && typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  if (step.kind === 'status') {
    dispatchLoadGuideActionV103({ action:'open_status', guideId:guide.id, stepId:step.id, step });
    return;
  }
  if (step.kind === 'document') {
    onOpenScan?.(step.documentType || 'auto');
    return;
  }
  dispatchLoadGuideActionV103({ action:step.kind === 'complete_stop' ? 'complete_stop' : 'toggle_done', guideId:guide.id, stepId:step.id, step });
}

function Action({ guide, step, onOpenScan }) {
  if (step.complete) return <span className="driver-guide-done-v103"><Icon name="check" size={14}/> Done</span>;
  const m = meta(step);
  return <button type="button" className={`driver-guide-action-v103 ${m.tone}`} onClick={() => runStep(guide, step, onOpenScan)}><Icon name={m.icon} size={15}/>{m.label}</button>;
}

function RouteDone({ guide, step }) {
  if (step.kind !== 'route') return null;
  return <button type="button" className={`driver-guide-route-done-v103 ${step.complete ? 'done' : ''}`} onClick={() => dispatchLoadGuideActionV103({ action:'toggle_done', guideId:guide.id, stepId:step.id, step })}><Icon name="check" size={13}/>{step.complete ? 'Routed' : 'Done'}</button>;
}

function Current({ progress, onOpenScan }) {
  const { guide, currentStep:step } = progress;
  if (!step) return <div className="driver-guide-current-v103 complete"><span><Icon name="check" size={26}/></span><div><em>Load workflow</em><h2>Everything is complete</h2><p>Keep the final POD with billing.</p></div></div>;
  const m = meta(step);
  return (
    <div className={`driver-guide-current-v103 ${m.tone}`}>
      <span><Icon name={m.icon} size={25}/></span>
      <div>
        <em>Next driver step</em><h2>{step.title}</h2>
        {step.detail ? <p>{step.detail}</p> : null}
        <small>{[step.location, when(step)].filter(Boolean).join(' · ')}</small>
        {step.checklist?.length ? <div className="driver-guide-chips-v103">{step.checklist.map(item => <i key={item}>{item}</i>)}</div> : null}
        <div className="driver-guide-current-actions-v103"><Action guide={guide} step={step} onOpenScan={onOpenScan}/><RouteDone guide={guide} step={step}/></div>
      </div>
    </div>
  );
}

function Compact({ progress, onOpen, onOpenScan }) {
  const g = progress.guide;
  return (
    <section className="driver-guide-card-v103">
      <div className="driver-guide-head-v103"><span><Icon name="truck" size={20}/></span><div><em>Driver mission</em><b>Load {g.loadNo || g.orderNo}</b></div><button type="button" onClick={onOpen}>Open <Icon name="next" size={14}/></button></div>
      <div className="driver-guide-progress-v103"><span><i style={{ width:`${progress.percent}%` }}/></span><em>{progress.completed}/{progress.total} steps · {progress.percent}%</em></div>
      <Current progress={progress} onOpenScan={onOpenScan}/>
      <div className="driver-guide-route-line-v103"><b>{g.origin || 'Pickup'}</b><i>→</i><b>{g.destination || 'Final delivery'}</b></div>
    </section>
  );
}

function StopPlan({ progress }) {
  const g = progress.guide;
  return (
    <section className="driver-guide-panel-v103">
      <div className="driver-guide-title-v103"><b>Route plan</b><em>{g.stops.length} stops</em></div>
      <div className="driver-guide-stops-v103">
        {g.stops.map((stop, index) => {
          const deliveryNo = stop.type === 'pickup' ? 0 : g.stops.slice(0, index + 1).filter(item => item.type === 'delivery').length;
          const done = stop.type === 'pickup' ? progress.steps.some(s => s.id === 'depart_pickup' && s.complete) : progress.steps.some(s => s.id === `complete_stop_${deliveryNo}` && s.complete);
          return <div key={`${stop.id}_${index}`} className={done ? 'done' : ''}><span>{done ? <Icon name="check" size={13}/> : stop.type === 'pickup' ? 'PU' : deliveryNo}</span><div><b>{stop.company || stop.cityState}</b><em>{[stop.cityState, stop.appointment].filter(Boolean).join(' · ')}</em></div>{stop.poNumber ? <strong>PO {stop.poNumber}</strong> : null}</div>;
        })}
      </div>
    </section>
  );
}

function Full({ progress, onBack, onOpenScan }) {
  const g = progress.guide;
  const [showDone, setShowDone] = useState(true);
  const steps = showDone ? progress.steps : progress.steps.filter(step => !step.complete);
  return (
    <section className="screen driver-guide-screen-v103">
      <header className="driver-guide-screen-head-v103"><button type="button" onClick={onBack}><Icon name="back"/></button><div><span>Road Ready</span><b>Driver Load Guide</b></div><strong>{progress.percent}%</strong></header>
      <main className="driver-guide-screen-body-v103">
        <section className="driver-guide-hero-v103"><span>ACTIVE LOAD</span><h1>{g.loadNo || g.orderNo}</h1><p>{g.origin} <i>→</i> {g.destination}</p><div><b>{g.rate ? money(g.rate) : '—'}<em>Rate</em></b><b>{g.equipment || '—'}<em>Equipment</em></b><b>{g.weight ? `${Number(g.weight).toLocaleString()} lb` : '—'}<em>Weight</em></b><b>{g.pickupNumber || '—'}<em>Pickup #</em></b></div>{g.trackingProvider ? <small><Icon name="route" size={15}/> {g.trackingProvider} tracking {g.requirements?.trackingRequired ? 'required' : ''}</small> : null}</section>
        <section className="driver-guide-panel-v103 next"><div className="driver-guide-title-v103"><b>Do this next</b><em>{progress.completed}/{progress.total}</em></div><Current progress={progress} onOpenScan={onOpenScan}/></section>
        <StopPlan progress={progress}/>
        <section className="driver-guide-panel-v103"><div className="driver-guide-title-v103"><b>Driver checklist</b><button type="button" onClick={() => setShowDone(v => !v)}>{showDone ? 'Hide completed' : 'Show all'}</button></div><div className="driver-guide-steps-v103">{steps.map(step => <div key={step.id} className={step.complete ? 'done' : ''}><button type="button" disabled={step.kind === 'status' || step.kind === 'document'} onClick={() => dispatchLoadGuideActionV103({ action:step.kind === 'complete_stop' ? 'complete_stop' : 'toggle_done', guideId:g.id, stepId:step.id, step })}>{step.complete ? <Icon name="check" size={14}/> : <i/>}</button><span><b>{step.title}</b><em>{[step.detail, step.location, when(step)].filter(Boolean).join(' · ')}</em>{step.checklist?.length ? <small>{step.checklist.join(' · ')}</small> : null}</span><div><Action guide={g} step={step} onOpenScan={onOpenScan}/><RouteDone guide={g} step={step}/></div></div>)}</div></section>
        <section className="driver-guide-safe-v103"><Icon name="log" size={19}/><span><b>Logbook-safe</b><em>Checklist taps organize the load. Duty status changes only after you open Log now and confirm the real time and location.</em></span></section>
      </main>
    </section>
  );
}

export default function DriverLoadGuideV103({ state, mode = 'compact', onOpen, onBack, onOpenScan }) {
  const guide = useMemo(() => getActiveLoadGuideV103(state), [state]);
  const progress = useMemo(() => resolveDriverGuideV103(state, guide), [state, guide]);
  if (!guide) return null;
  return mode === 'screen' ? <Full progress={progress} onBack={onBack} onOpenScan={onOpenScan}/> : <Compact progress={progress} onOpen={onOpen} onOpenScan={onOpenScan}/>;
}
