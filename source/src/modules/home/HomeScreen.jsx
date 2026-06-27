import React from 'react';
import LogGraph from '../graph/LogGraph.jsx';
import { label } from '../../shared/utils/status.js';
import { localDayKey } from '../../shared/utils/date.js';
import { signableLogDays } from '../logbook/signing.js';

function titleFromDay(day) {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return {
    weekday: d.toLocaleDateString(undefined, { weekday:'long' }),
    month: d.toLocaleDateString(undefined, { month:'short' }),
    day: String(d.getDate()).padStart(2, '0'),
  };
}

function dayTitle(day) {
  const t = titleFromDay(day);
  return `${t.weekday} ${t.month} ${t.day}`;
}

function duration(events = []) {
  return events.reduce((sum, e) => sum + Math.max(0, (e.endMin || 0) - (e.startMin || 0)), 0);
}

function hLabel(mins) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h} hr, ${m} min`;
}

function statusSummary(state) {
  const day = state.activeDay || localDayKey();
  const events = state.eventsByDay?.[day] || [];
  const last = [...events].sort((a,b)=>a.startMin-b.startMin).at(-1);
  const status = state.currentStatus || last?.status || 'OFF';
  const loc = state.currentLocation || {};
  const source = loc.locationSource || state.homeGpsStatus || 'default';
  const hasRealLocation = source === 'gps' || source === 'manual' || (loc.city && loc.state && !(loc.city === 'Chicago' && loc.state === 'IL' && source === 'default'));
  let location = 'Getting GPS…';

  if (hasRealLocation) location = `${loc.city || 'GPS'}, ${loc.state || 'UNK'}`;
  else if (state.homeGpsStatus === 'blocked') location = 'GPS blocked';
  else if (state.homeGpsStatus === 'unavailable') location = 'GPS unavailable';

  return {
    status,
    label: label(status),
    location,
    locationSource: source,
    vehicle: state.currentTrailer || 'No vehicle selected',
  };
}

export default function LogsList({ state, onOpenDay, onReset, onOpenStatus, onOpenTrailer, onOpenGps, onOpenUnsigned }) {
  const today = localDayKey();
  const todayEvents = state.eventsByDay?.[today] || [];
  const selectedDay = state.activeDay || today;
  const selectedEvents = state.eventsByDay?.[selectedDay] || [];
  const unsignedDays = signableLogDays(state);
  const unsigned = unsignedDays.length;
  const reviews = Object.values(state.certifyStatus || {}).filter(v => String(v).includes('Review') || String(v).includes('Not certified')).length;
  const s = statusSummary(state);
  const currentStatusClass = `home-status-pill ${s.status}`;

  const last14 = Object.keys(state.eventsByDay || {})
    .sort()
    .reverse()
    .slice(0, 7);

  return (
    <section className="screen home-screen">
      <div className="home-head">
        <button className="home-menu" onClick={onReset}>☰<span /></button>
        <div>Home</div>
        <button className="home-tools" onClick={onOpenGps}>◴</button>
      </div>

      <main className="home-body">
        <div className="home-greeting">
          <h1>Good evening, Arben.</h1>
          <div className="home-status-line">
            <button className={currentStatusClass} onClick={onOpenStatus}>{s.label}</button>
            <span className={s.locationSource === 'gps' ? 'gps-home-location ok' : 'gps-home-location'}>{s.location}</span>
            <button onClick={onOpenTrailer}>{s.vehicle}</button>
          </div>
          <div className="home-gps-note">
            {s.locationSource === 'gps' ? 'GPS location' : state.homeGpsStatus === 'blocked' ? 'GPS blocked · tap status to set location' : state.homeGpsStatus === 'unavailable' ? 'GPS unavailable · enter location manually' : 'Getting GPS location…'}
          </div>
        </div>

        <section className="home-hero">
          <div className="hero-icon">✦</div>
          <h2>{todayEvents.length ? 'Continue your day' : 'Start your day'}</h2>
          <p>{todayEvents.length ? 'Open today’s log, review events, and certify when ready.' : 'Complete pre-trip, set your vehicle, and open today’s log.'}</p>
          <button onClick={() => onOpenDay(today)}>{todayEvents.length ? 'Open today’s log' : 'Get started'}</button>
        </section>

        <section className="home-compliance">
          <div className="home-card-title">
            <h2>Compliance</h2>
            <button onClick={() => onOpenDay(today)}>→</button>
          </div>
          <div className="compliance-grid">
            <button onClick={() => unsigned ? onOpenUnsigned?.() : onOpenDay(today)}>
              <span>Unsigned logs</span>
              <b className={unsigned ? 'warn' : ''}>{unsigned}</b>
            </button>
            <button onClick={() => onOpenDay(today)}>
              <span>Reviews</span>
              <b className={reviews ? 'warn' : ''}>{reviews}</b>
            </button>
            <button onClick={() => onOpenDay(today)}>
              <span>Today</span>
              <b>{state.certifyStatus?.[today] === 'Certified' ? 'OK' : 'Active'}</b>
            </button>
          </div>
        </section>

        <section className="quick-tiles">
          <button className="tile logs" onClick={() => onOpenDay(today)}>
            <span>▤</span>
            <b>Logs</b>
          </button>
          <button className="tile inspect" onClick={() => onOpenDay(today)}>
            <span>◎</span>
            <b>Inspection</b>
          </button>
          <button className="tile docs" onClick={() => onOpenGps?.()}>
            <span>▧</span>
            <b>Tracking</b>
          </button>
        </section>

        <section className="home-card day-preview">
          <div className="home-card-title">
            <h2>Today’s log</h2>
            <button onClick={() => onOpenDay(today)}>→</button>
          </div>
          <div className="today-summary">
            <div>
              <b>{dayTitle(today)}</b>
              <span>{hLabel(duration(selectedEvents))} total · {state.certifyStatus?.[today] || 'Not certified'}</span>
            </div>
          </div>
          <div className="home-graph-preview">
            <LogGraph events={selectedEvents} selectedId={null} />
          </div>
        </section>

        <section className="home-card">
          <div className="home-card-title">
            <h2>Maintenance</h2>
            <button>→</button>
          </div>
          <button className="home-list-row" onClick={() => onOpenDay(today)}>Pre-trip vehicle inspection <span>›</span></button>
          <button className="home-list-row" onClick={() => onOpenDay(today)}>Post-trip vehicle inspection <span>›</span></button>
          <button className="home-list-row" onClick={() => onOpenDay(today)}>Vehicle inspection <span>›</span></button>
          <button className="home-list-row" onClick={onOpenTrailer}>Asset inspection <span>›</span></button>
        </section>

        <section className="home-card messages">
          <div className="home-card-title">
            <h2>Messages</h2>
            <button>→</button>
          </div>
          <p>You’re all caught up.</p>
        </section>

        <section className="home-card recent-logs">
          <div className="home-card-title">
            <h2>Recent logs</h2>
            <button onClick={() => onOpenDay(today)}>→</button>
          </div>
          {last14.map(day => {
            const evs = state.eventsByDay?.[day] || [];
            const cert = state.certifyStatus?.[day] || 'Not certified';
            return (
              <button key={day} className="recent-log-row" onClick={() => onOpenDay(day)}>
                <div>
                  <b>{dayTitle(day)}</b>
                  <span>{hLabel(duration(evs))} · {cert}</span>
                </div>
                <em>{cert === 'Certified' ? '✓' : '!'}</em>
              </button>
            );
          })}
        </section>
      </main>

      <button className="bottom-status-bar" onClick={onOpenStatus}>
        <div>
          <b>{s.label}</b>
          <span>{s.vehicle}</span>
        </div>
        <div>
          <b>16:25</b>
          <span>Until cycle restart</span>
        </div>
      </button>
    </section>
  );
}
