import React, { useState } from 'react';
import { estimatedRoadMiles, pointFromLogLocation, recalcMilesByTimeWindow } from '../../core/gps/locationService.js';
import { durLabel, timeLabel } from '../../shared/utils/time.js';

const TIME_GUIDE_MPH = 62;

const KNOWN_TRUCK_ROUTES = {
  'CHICAGO, IL|ELGIN, IL': 52,
  'ELGIN, IL|WOODHAVEN, MI': 327,
};

function place(event = {}) {
  const city = String(event.city || '').trim();
  const state = String(event.state || '').trim().toUpperCase().slice(0, 2);
  return { city, state, label:[city, state].filter(Boolean).join(', ') || 'Unknown' };
}

function samePlace(a, b) {
  return String(a?.city || '').trim().toLowerCase() === String(b?.city || '').trim().toLowerCase()
    && String(a?.state || '').trim().toUpperCase() === String(b?.state || '').trim().toUpperCase();
}

function routeKey(a, b) {
  return `${a.label.toUpperCase()}|${b.label.toUpperCase()}`;
}

function operationalAnchor(event = {}) {
  return event.status === 'ON' && /pickup|loading|hook|drop|delivery|unloading|pre[- ]?trip|inspection/i.test(`${event.note || ''} ${event.description || ''}`);
}

function drivingMinutes(events = []) {
  return events.reduce((sum, event) => sum + Math.max(0, Number(event.endMin || 0) - Number(event.startMin || 0)), 0);
}

function routeLegMiles(routeLegs = [], from, to) {
  const match = routeLegs.find(leg => {
    const a = { city:leg.fromCity, state:leg.fromState };
    const b = { city:leg.toCity, state:leg.toState };
    return samePlace(a, from) && samePlace(b, to);
  });
  const value = Number(match?.loadedMiles || match?.routeMiles || match?.miles || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function gpsMilesForSegment(gpsPoints = [], startMin, endMin) {
  const result = recalcMilesByTimeWindow(gpsPoints, startMin, endMin);
  return result.pointsUsed >= 4 && result.totalMiles > 1 ? result.totalMiles : 0;
}

function estimateSegmentMiles(segment, routeLegs, gpsPoints) {
  const timeGuide = () => ({ miles:Number(((drivingMinutes(segment.drivingEvents) / 60) * TIME_GUIDE_MPH).toFixed(2)), source:'driving-time guide', confidence:'Low', averageMph:TIME_GUIDE_MPH });
  // Without a recorded stop, no destination distance is known. The hours
  // provide an editable estimate, never a measured route or an invented stop.
  if (segment.continues) return timeGuide();
  const known = KNOWN_TRUCK_ROUTES[routeKey(segment.from, segment.to)];
  if (known) return { miles:known, source:'verified truck route', confidence:'High' };

  const gps = gpsMilesForSegment(gpsPoints, segment.startMin, segment.endMin);
  if (gps > 0) return { miles:Number(gps.toFixed(2)), source:'GPS breadcrumbs', confidence:'High' };

  const route = routeLegMiles(routeLegs, segment.from, segment.to);
  if (route > 0) return { miles:Number(route.toFixed(2)), source:'load route', confidence:'High' };

  const a = pointFromLogLocation(segment.fromEvent || segment.drivingEvents[0]);
  const b = pointFromLogLocation(segment.toEvent || {});
  const road = a && b ? estimatedRoadMiles(a, b) : 0;
  if (road > 0) {
    // Existing city-center road estimate is conservative. Midwest truck lanes in
    // real logs average about 15% above that value; keep it editable.
    return { miles:Number((road * 1.15).toFixed(2)), source:'city route estimate', confidence:'Medium' };
  }

  return timeGuide();
}

export function buildDailyMileageSegments(events = [], routeLegs = [], gpsPoints = []) {
  const ordered = [...events].filter(event => event && !event.displayOnly && !event.syntheticCoverage && !event.carriedFromPreviousDay
    && Number.isInteger(event.startMin) && Number.isInteger(event.endMin)
    && event.startMin >= 0 && event.endMin <= 1440 && event.endMin > event.startMin)
    .sort((a, b) => a.startMin - b.startMin);
  const segments = [];
  let i = 0;

  while (i < ordered.length) {
    if (ordered[i].status !== 'D') { i += 1; continue; }

    const firstDriveIndex = i;
    const drivingEvents = [ordered[i]];
    let endIndex = i;

    // Keep a short legal break inside the same trip segment when driving resumes
    // and no pickup/delivery/hook/drop anchor starts a new leg.
    while (endIndex + 1 < ordered.length) {
      const pause = ordered[endIndex + 1];
      const nextDrive = ordered[endIndex + 2];
      if (pause.status === 'D' && pause.startMin === ordered[endIndex].endMin) {
        drivingEvents.push(pause); endIndex += 1; continue;
      }
      const pauseMinutes = Math.max(0, Number(pause.endMin || 0) - Number(pause.startMin || 0));
      if (!nextDrive || !['OFF', 'SB'].includes(pause.status) || pauseMinutes > 60 || nextDrive.status !== 'D' || operationalAnchor(pause)
        || pause.startMin !== ordered[endIndex].endMin || nextDrive.startMin !== pause.endMin) break;
      drivingEvents.push(nextDrive);
      endIndex += 2;
    }

    const firstDrive = drivingEvents[0];
    const previous = ordered[firstDriveIndex - 1];
    let before = previous?.endMin === firstDrive.startMin ? previous : firstDrive;
    if (!before.city || !before.state) before = firstDrive;
    const next = ordered[endIndex + 1];
    const after = next && next.status !== 'D' && next.startMin === drivingEvents.at(-1).endMin ? next : null;

    const from = place(before);
    const to = after ? place(after) : {city:'',state:'',label:'Continues'};
    {
      const segment = {
        id:`${drivingEvents[0].id}_${drivingEvents.at(-1).id}`,
        from,
        to,
        fromEvent:before,
        toEvent:after,
        continues:!after,
        drivingEvents,
        drivingMinutes:drivingMinutes(drivingEvents),
        startMin:Number(drivingEvents[0].startMin || 0),
        endMin:Number(drivingEvents.at(-1).endMin || 0),
      };
      Object.assign(segment, estimateSegmentMiles(segment, routeLegs, gpsPoints));
      segments.push(segment);
    }

    i = endIndex + 1;
  }

  return segments;
}

export function allocateMiles(segment, miles) {
  const totalMinutes = Math.max(1, drivingMinutes(segment.drivingEvents));
  let assigned = 0;
  return segment.drivingEvents.map((event, index) => {
    const mins = Math.max(0, Number(event.endMin || 0) - Number(event.startMin || 0));
    const value = index === segment.drivingEvents.length - 1
      ? Number((miles - assigned).toFixed(2))
      : Number(((mins / totalMinutes) * miles).toFixed(2));
    assigned += value;
    return { eventId:event.id, miles:Math.max(0, value) };
  });
}

export default function MileageSegmentEditor({ open, ...props }) {
  return open ? <MileageDraft {...props} /> : null;
}

function MileageDraft({ events = [], routeLegs = [], gpsPoints = [], onClose, onSave }) {
  // Freeze the displayed time window while reviewing. Clock ticks must not
  // erase typed miles or silently change what the driver is about to save.
  const [built] = useState(() => buildDailyMileageSegments(events, routeLegs, gpsPoints));
  const [values, setValues] = useState(() => Object.fromEntries(built.map(segment => {
    const reviewed = segment.drivingEvents.every(event => Number.isFinite(event.manualMiles) && event.manualMiles > 0);
    const miles = reviewed ? segment.drivingEvents.reduce((sum, event) => sum + event.manualMiles, 0) : segment.miles;
    return [segment.id, String(Number(miles.toFixed(2)))];
  })));
  const valid = built.length > 0 && built.every(segment => Number.isFinite(Number(values[segment.id])) && Number(values[segment.id]) > 0);
  const total = built.reduce((sum, segment) => sum + Math.max(0, Number(values[segment.id] || 0)), 0);

  function save() {
    const segments = built.map(segment => {
      const miles = Number(values[segment.id]);
      return { ...segment, miles, allocations:allocateMiles(segment, miles) };
    });
    if (!segments.length || segments.some(segment => !Number.isFinite(segment.miles) || segment.miles <= 0)) return;
    onSave?.({ totalMiles:Number(total.toFixed(2)), segments });
  }

  return (
    <div className="mileage-editor-overlay" role="dialog" aria-modal="true" aria-label="Daily mileage segments">
      <div className="mileage-editor-card">
        <div className="mileage-editor-head">
          <div><span>Daily driving miles</span><b>Review each route segment</b></div>
          <button type="button" onClick={onClose}>Close</button>
        </div>

        <p className="mileage-editor-help">Review every driving segment, including driving without a recorded stop. Time estimates use 62 mph; adjust the miles before saving.</p>

        <div className="mileage-segment-list">
          {built.map((segment, index) => (
            <label key={segment.id} className={`mileage-segment-row tone-${index % 4}`}>
              <span className="mileage-segment-number">{index + 1}</span>
              <span className="mileage-segment-route">
                <b>{segment.from.label} <i>→</i> {segment.to.label}</b>
                <span className="mileage-driving-time-v110366">{timeLabel(segment.startMin)} – {segment.endMin === 1440 ? '24:00' : timeLabel(segment.endMin)} · {durLabel(segment.drivingMinutes)} driving</span>
                <em>{segment.source} · {segment.confidence} confidence</em>
                {segment.averageMph && <em>{durLabel(segment.drivingMinutes)} × {segment.averageMph} mph = {segment.miles.toFixed(2)} mi estimate</em>}
              </span>
              <span className="mileage-segment-input">
                <input aria-label={`Miles for segment ${index + 1}`} inputMode="decimal" value={values[segment.id] ?? ''} onChange={event => setValues(current => ({ ...current, [segment.id]:event.target.value.replace(/[^0-9.]/g, '') }))} />
                <small>mi</small>
              </span>
            </label>
          ))}
        </div>

        {!built.length ? <div className="mileage-editor-empty">No elapsed driving was found on this day.</div> : null}

        <div className="mileage-editor-total"><span>Total for the day</span><b>{total.toFixed(2)} mi</b></div>
        <div className="mileage-editor-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="button" disabled={!valid} onClick={save}>Save daily miles</button>
        </div>
      </div>
    </div>
  );
}
