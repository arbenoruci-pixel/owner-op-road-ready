import React, { useMemo } from 'react';
import { billingReadinessV102 } from '../owneros/ownerOpsStoreV102.js';

function text(value = '') { return String(value ?? '').replace(/\s+/g,' ').trim(); }
function money(value = 0) { return Number(value || 0).toLocaleString(undefined, { style:'currency', currency:'USD', maximumFractionDigits:0 }); }
function cityState(city = '', state = '') { return [text(city), text(state).toUpperCase()].filter(Boolean).join(', '); }

function guideFromState(state = {}, loadNo = '') {
  const direct = state.loadGuidesById?.[state.activeLoadGuideId];
  if (direct) return direct;
  const key = text(loadNo).toUpperCase();
  return Object.values(state.loadGuidesById || {}).filter(Boolean)
    .find(guide => text(guide.loadNo || guide.orderNo).toUpperCase() === key) || null;
}

function routeUrl(load = {}, nextStop = {}) {
  const destination = nextStop.address || [nextStop.company, cityState(nextStop.city, nextStop.state)].filter(Boolean).join(', ') || load.nextDestination || load.destination;
  if (!destination) return '';
  const params = new URLSearchParams({ api:'1', destination, travelmode:'driving' });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function MiniMapV102({ stops = [], completed = 0 }) {
  const points = stops.length ? stops : [{ type:'pickup' }, { type:'delivery' }];
  const count = Math.max(2, points.length);
  const x = index => 28 + (index * (244 / Math.max(1, count - 1)));
  return (
    <div className="active-live-map-v102" aria-label="Load route overview">
      <svg viewBox="0 0 300 96" role="img" aria-label="Current load route">
        <path d="M28 51 C82 21, 117 78, 163 48 S235 24, 272 51" className="route-base-v102" />
        <path d="M28 51 C82 21, 117 78, 163 48 S235 24, 272 51" className="route-progress-v102" style={{ strokeDasharray:`${Math.max(8, Math.min(100, (completed / Math.max(1, count - 1)) * 100))} 100` }} />
        {points.map((stop,index) => {
          const done = index <= completed;
          const current = index === Math.min(completed + 1, count - 1);
          return <g key={stop.id || index}><circle cx={x(index)} cy="51" r={current?8:done?6:5} className={current?'stop-current-v102':done?'stop-done-v102':'stop-pending-v102'} /><text x={x(index)} y="78" textAnchor="middle">{index===0?'PU':`D${index}`}</text></g>;
        })}
      </svg>
      <span className="map-live-pill-v102">● Live load plan</span>
    </div>
  );
}

export default function ActiveLoadLiveV102({ state = {}, activeLoad = null, businessStore = {}, onOpenSection, onArrive, onScan }) {
  const guide = useMemo(() => guideFromState(state, activeLoad?.loadNo), [state, activeLoad?.loadNo]);
  if (!activeLoad) {
    return (
      <section className="active-live-card-v102 empty">
        <div><span>Active load</span><b>No active load</b><p>Import a Rate Confirmation to build the route, paperwork checklist and billing workflow.</p></div>
        <button type="button" onClick={onScan}>Scan Rate Con</button>
      </section>
    );
  }
  const stops = Array.isArray(guide?.stops) && guide.stops.length ? guide.stops : (activeLoad.legs || []).map((leg,index)=>({
    id:leg.id || index,
    type:index===0?'pickup':'delivery',
    company:leg.stopCompany || '', city:leg.toCity, state:leg.toState,
    appointment:leg.appointment || leg.deliveryAppointment || '',
  }));
  const deliveryStops = stops.filter(stop => stop.type !== 'pickup');
  const completed = Number(activeLoad.completedStops || 0);
  const nextStop = deliveryStops[Math.min(completed, Math.max(0, deliveryStops.length - 1))] || stops.find(stop=>stop.type==='delivery') || {};
  const loadRecord = (businessStore.loads || []).find(record => text(record.loadNo).toUpperCase() === text(activeLoad.loadNo).toUpperCase()) || {};
  const docs = businessStore.documents || [];
  const readiness = billingReadinessV102({ ...loadRecord, ...activeLoad }, docs, businessStore);
  const mapUrl = routeUrl(activeLoad, nextStop);
  const appointment = nextStop.appointment || [nextStop.date, nextStop.time].filter(Boolean).join(' ') || activeLoad.appointment || '';
  const equipment = text(guide?.equipment || loadRecord.equipment || state.loadInfo?.equipment);
  const weight = Number(guide?.weight || loadRecord.weight || state.loadInfo?.weight || 0);
  const commodity = text(guide?.commodity || loadRecord.commodity || state.loadInfo?.commodity);
  const tracking = text(guide?.trackingProvider || loadRecord.trackingProvider || state.loadInfo?.trackingProvider);
  const totalStops = deliveryStops.length || activeLoad.stopCount || 1;
  const progress = Math.min(100, Math.round((completed / Math.max(1,totalStops)) * 100));
  const nextPlace = cityState(nextStop.city, nextStop.state) || activeLoad.nextDestination || activeLoad.destination;

  return (
    <section className="active-live-card-v102">
      <div className="active-live-head-v102">
        <div><span>Live load</span><b>{activeLoad.loadNo || 'Active load'}</b><em>{completed} of {totalStops} delivery stops complete</em></div>
        <i>{completed >= totalStops ? 'Delivered' : 'In transit'}</i>
      </div>
      <MiniMapV102 stops={stops} completed={Math.min(completed, Math.max(0,stops.length-1))} />
      <div className="active-next-stop-v102">
        <span>Next stop</span>
        <b>{nextStop.company || nextPlace || 'Destination'}</b>
        <em>{[nextPlace, appointment].filter(Boolean).join(' · ') || 'Appointment not entered'}</em>
      </div>
      <div className="active-load-progress-v102"><span><i style={{ width:`${progress}%` }} /></span><em>{progress}% route complete</em></div>
      <div className="active-load-facts-v102">
        <span><em>Gross</em><b>{activeLoad.gross ? money(activeLoad.gross) : '—'}</b></span>
        <span><em>Billing</em><b>{readiness.ready ? 'Ready' : `${readiness.percent}%`}</b></span>
        <span><em>Documents</em><b>{readiness.docs.length}</b></span>
      </div>
      {(equipment || weight || commodity || tracking) && <div className="active-load-chips-v102">
        {equipment && <span>{equipment}</span>}
        {weight > 0 && <span>{Math.round(weight).toLocaleString()} lb</span>}
        {commodity && <span>{commodity}</span>}
        {tracking && <span>{tracking} tracking</span>}
      </div>}
      {!readiness.ready && readiness.missing.length ? <button type="button" className="active-load-alert-v102" onClick={() => onOpenSection?.('billing')}><span>!</span><div><b>Billing needs {readiness.missing[0].label}</b><em>{readiness.missing.slice(1).map(item=>item.label).join(' · ') || 'Open billing checklist'}</em></div></button> : null}
      <div className="active-load-actions-v102">
        <button type="button" className="primary" disabled={!mapUrl} onClick={() => mapUrl && window.open(mapUrl,'_blank','noopener,noreferrer')}>Navigate</button>
        <button type="button" onClick={onArrive}>Arrived</button>
        <button type="button" onClick={() => onOpenSection?.('documents')}>Documents</button>
        <button type="button" onClick={() => onOpenSection?.('billing')}>Billing</button>
      </div>
    </section>
  );
}
