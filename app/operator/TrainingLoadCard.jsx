'use client';

import {appointment} from './portalData.js';
import css from './trainingLoadCard.module.css';

// Pilot only. The facility labels and staging instruction belong to this rehearsal.
export const trainingCardLoadId = 'f95459d3-3526-5585-966b-75ee8d82301d';

function locality(address) {
  return address?.match(/,\s*([^,]+),\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?\s*$/)?.slice(1).join(', ');
}

function when(value, zone) {
  const formatted = appointment(value, zone);
  if (!formatted) return 'Appointment pending';
  try {
    const date = new Date(value);
    const day = date.toLocaleDateString('en-US', {timeZone: zone || 'UTC', weekday: 'short', month: 'short', day: 'numeric'});
    const time = date.toLocaleTimeString('en-US', {timeZone: zone || 'UTC', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'});
    return day + ' · ' + time;
  } catch {
    return formatted;
  }
}

function TrainingStop({label, place, address, at, zone, reference, children}) {
  const city = locality(address);
  const split = city ? address.lastIndexOf(', ' + city) : -1;
  return <li className={css.stop}>
    <div className={css.when}><h3>{label}</h3><time dateTime={at || undefined}>{when(at, zone)}</time></div>
    <div className={css.placeRow}>
      <div className={css.place}>
        {place && <strong>{place}</strong>}
        <div className={css.address}>{split > 0 ? <>{address.slice(0, split)}<br/>{address.slice(split + 2)}</> : address || 'Address pending'}</div>
        {reference && <p>Reference: {reference}</p>}
      </div>
      {address && <a aria-label={'Open ' + label.toLowerCase() + ' in Google Maps'} href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address)} target="_blank" rel="noreferrer">Open Maps</a>}
    </div>
    {children}
  </li>;
}

export default function LoadCard({load, status, podStatus, controls, initialOpen, gross, children}) {
  const rehearsal = load.id === trainingCardLoadId && load.status === 'assigned';
  const pickup = locality(load.pickup_address);
  const delivery = locality(load.delivery_address);
  return <details className={css.card} open={initialOpen}>
    <summary className={css.summary}>
      <span className={css.status} data-accepted={status === 'Accepted'}>{status}</span>
      <strong className={css.route}>{pickup && delivery ? pickup + ' → ' + delivery : [load.pickup_address,load.delivery_address].filter(Boolean).join(' → ') || load.load_number}</strong>
      <span className={css.id}>{load.broker_name} · {load.load_number}</span>
      {podStatus && <strong>{podStatus}</strong>}
      <span className={css.next}>Pickup <b>{when(load.pickup_at, load.pickup_timezone)}</b></span>
    </summary>
    <div className={css.inside}>
      {(load.steps || []).filter(s => /lot|staging|check[ -]?in/i.test([s.title,s.detail].join(' '))).map((s,i)=><p key={i} className={css.note}><b>{s.title}</b> {s.detail}</p>)}
      <ol className={css.timeline} role="list" aria-label="Route stops">
        <TrainingStop label="Pickup" place={rehearsal ? 'Rockford Foam' : null} address={load.pickup_address} at={load.pickup_at} zone={load.pickup_timezone} reference={load.pickup_number}/>
        <TrainingStop label="Delivery" place={rehearsal ? 'Owens Corning · Tallmadge Plant' : null} address={load.delivery_address} at={load.delivery_at} zone={load.delivery_timezone} reference={load.delivery_number}>
          {rehearsal && <p className={css.note}>Check in at <b>Lot 2</b>. Wait for release before going to the plant.</p>}
        </TrainingStop>
      </ol>
      <div className={css.controls}>{controls}</div>
      <details className={css.more}><summary>Load Details</summary><div className={css.detailContent}>
      <div className={css.gross}><span>Load gross</span><b>{gross}</b></div>
      {children}</div></details>
    </div>
  </details>;
}
