import React, { useEffect, useMemo, useState } from 'react';
import { label } from '../../shared/utils/status.js';
import { addDays, localDayKey } from '../../shared/utils/date.js';
import { signableLogDays, validateLogForSigning } from '../logbook/signing.js';
import { displayEventsForDay } from '../../core/timeline/displayTimeline.js';
import { rawStoredEventsForDay } from '../../core/compliance/rawRodsChecks.js';
import { evaluateDotWallet, walletCardLabel } from '../../core/wallet/dotWallet.js';
import HosCompactClocks from '../drive/HosCompactClocks.jsx';
import OwnerOpBusinessScreen from '../business/OwnerOpBusinessScreen.jsx';
import { BUSINESS_STORE_EVENT, businessSummary, readBusinessStore } from '../business/businessStore.js';

const SHORT = { OFF:'OFF', SB:'SB', D:'DRV', ON:'ON' };

function Icon({ name, size = 22 }) {
  const common = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:'1.8', strokeLinecap:'round', strokeLinejoin:'round', 'aria-hidden':'true' };
  if (name === 'scan') return <svg {...common}><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M7 12h10"/></svg>;
  if (name === 'log') return <svg {...common}><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 11h6M9 15h6"/></svg>;
  if (name === 'shield') return <svg {...common}><path d="M12 3 20 6v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6z"/><path d="m8.8 12 2.1 2.1 4.4-4.5"/></svg>;
  if (name === 'wallet') return <svg {...common}><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H18v16H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 8h14M14 12h6v4h-6a2 2 0 0 1 0-4z"/></svg>;
  if (name === 'load') return <svg {...common}><path d="M3 7h12v10H3zM15 10h3l3 3v4h-6z"/><path d="M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/></svg>;
  if (name === 'fuel') return <svg {...common}><path d="M5 21V4h9v17M3 21h13M7 7h5v4H7z"/><path d="M14 8h2l3 3v7a2 2 0 0 0 2 2V9l-2-2"/></svg>;
  if (name === 'wrench') return <svg {...common}><path d="M14.5 6.5a4 4 0 0 0-5-5L12 4 9 7 6.5 4.5a4 4 0 0 0 5 5L19 17a2.1 2.1 0 0 1-3 3l-7.5-7.5"/></svg>;
  if (name === 'receipt') return <svg {...common}><path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>;
  if (name === 'chart') return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>;
  if (name === 'route') return <svg {...common}><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h3a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3"/></svg>;
  if (name === 'clock') return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
  if (name === 'truck') return <svg {...common}><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>;
  if (name === 'home') return <svg {...common}><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></svg>;
  if (name === 'more') return <svg {...common}><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></svg>;
  return <svg {...common}><path d="m9 18 6-6-6-6"/></svg>;
}

function dayParts(day) {
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return { weekday:day, date:'' };
  return {
    weekday:date.toLocaleDateString(undefined, { weekday:'short' }),
    date:date.toLocaleDateString(undefined, { month:'short', day:'numeric' }),
  };
}

function duration(events = []) {
  return events.reduce((sum, event) => sum + Math.max(0, Number(event.endMin || 0) - Number(event.startMin || 0)), 0);
}

function hoursLabel(minutes = 0) {
  const total = Math.max(0, Math.round(Number(minutes || 0)));
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`;
}

function money(value = 0) {
  return Number(value || 0).toLocaleString(undefined, { style:'currency', currency:'USD', maximumFractionDigits:0 });
}

function money2(value = 0) {
  return Number(value || 0).toLocaleString(undefined, { style:'currency', currency:'USD', minimumFractionDigits:2, maximumFractionDigits:2 });
}

function safeLiveStatus(status = 'OFF', hasRawToday = false) {
  return status === 'D' && !hasRawToday ? 'OFF' : (status || 'OFF');
}

function equipmentDisplayName(state = {}) {
  const equipment = state.equipment || {};
  if (equipment.type === 'intermodal') {
    const chassis = String(equipment.chassis || state.loadInfo?.equipmentChassis || '').trim();
    return chassis ? `Chassis ${chassis}` : 'Intermodal equipment';
  }
  if (state.currentTrailer && state.currentTrailer !== 'No trailer') return state.currentTrailer;
  return equipment.trailer || state.driver?.trailer || 'No trailer set';
}

function statusSummary(state = {}) {
  const day = localDayKey();
  const events = rawStoredEventsForDay(state.eventsByDay || {}, day);
  const last = [...events].sort((a, b) => Number(a.startMin || 0) - Number(b.startMin || 0)).at(-1);
  const status = last?.status || safeLiveStatus(state.currentStatus || 'OFF', events.length > 0);
  const location = state.currentLocation || {};
  const cityState = [location.city, location.state].filter(Boolean).join(', ');
  return {
    status,
    label:label(status),
    location:cityState && !/GPS, UNK/i.test(cityState) ? cityState : 'Location needed',
    vehicle:equipmentDisplayName(state),
    reason:last?.note || last?.description || state.currentReason || '',
  };
}

function flattenRouteLegs(state = {}) {
  return Object.entries(state.routeLegsByDay || {}).flatMap(([homeDay, legs]) => (
    (Array.isArray(legs) ? legs : []).filter(Boolean).map(leg => ({ ...leg, homeDay, day:leg.day || homeDay }))
  ));
}

function cityState(city = '', state = '') {
  return [String(city || '').trim(), String(state || '').trim().toUpperCase()].filter(Boolean).join(', ');
}

function activeLoadSummary(state = {}, businessStore = {}) {
  const routeLegs = flattenRouteLegs(state).filter(leg => String(leg.status || '').toLowerCase() !== 'cancelled');
  const groups = new Map();
  routeLegs.forEach(leg => {
    const key = leg.loadGroupId || leg.pickupEventId || leg.loadNo || leg.shippingDocs || leg.id;
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(leg);
  });

  const grouped = [...groups.entries()].map(([key, legs]) => {
    const ordered = [...legs].sort((a, b) => (
      String(a.pickupDay || a.day || '').localeCompare(String(b.pickupDay || b.day || ''))
      || Number(a.stopSequence ?? 9999) - Number(b.stopSequence ?? 9999)
      || Number(a.pickupMin ?? 9999) - Number(b.pickupMin ?? 9999)
    ));
    const pending = ordered.filter(leg => String(leg.status || '').toLowerCase() !== 'delivered');
    return { key, ordered, pending };
  }).filter(group => group.pending.length > 0)
    .sort((a, b) => String(a.ordered[0]?.pickupDay || a.ordered[0]?.day || '').localeCompare(String(b.ordered[0]?.pickupDay || b.ordered[0]?.day || '')));

  const group = grouped[0] || null;
  const info = state.loadInfo || {};
  const infoDocs = String(info.shippingDocs || info.loadNo || info.bol || info.po || '').trim();

  if (!group) {
    const origin = cityState(info.pickupCity, info.pickupState);
    const destination = cityState(info.deliveryCity, info.deliveryState);
    if (!infoDocs && !origin && !destination) return null;
    const matchingBusiness = (businessStore.loads || []).find(record => infoDocs && String(record.loadNo || '').trim().toLowerCase() === infoDocs.toLowerCase()) || null;
    return {
      id:infoDocs || 'active-load',
      loadNo:infoDocs,
      origin,
      destination,
      docs:infoDocs ? [infoDocs] : [],
      stopCount:destination ? 1 : 0,
      completedStops:0,
      currentStop:destination ? 1 : 0,
      gross:Number(matchingBusiness?.gross || info.gross || info.rate || 0),
      loadedMiles:Number(matchingBusiness?.loadedMiles || info.loadedMiles || info.miles || 0),
      deadheadMiles:Number(matchingBusiness?.deadheadMiles || 0),
      appointment:info.appointment || '',
      legs:[],
    };
  }

  const ordered = group.ordered;
  const first = ordered[0] || {};
  const next = group.pending[0] || first;
  const last = ordered.at(-1) || next;
  const docs = [...new Set(ordered.flatMap(leg => [leg.shippingDocs, leg.loadNo, leg.bol, leg.po]).map(value => String(value || '').trim()).filter(Boolean))];
  const loadNo = docs[0] || infoDocs || String(group.key || '');
  const matchingBusiness = (businessStore.loads || []).find(record => loadNo && String(record.loadNo || '').trim().toLowerCase() === loadNo.toLowerCase())
    || (businessStore.loads || []).find(record => !['paid', 'cancelled', 'completed'].includes(String(record.status || '').toLowerCase()))
    || null;
  const completedStops = ordered.filter(leg => String(leg.status || '').toLowerCase() === 'delivered').length;

  return {
    id:group.key,
    loadNo,
    origin:cityState(first.fromCity || info.pickupCity, first.fromState || info.pickupState),
    destination:cityState(last.toCity || next.toCity || info.deliveryCity, last.toState || next.toState || info.deliveryState),
    nextDestination:cityState(next.toCity || info.deliveryCity, next.toState || info.deliveryState),
    docs,
    stopCount:ordered.length,
    completedStops,
    currentStop:Math.min(ordered.length, completedStops + 1),
    gross:Number(matchingBusiness?.gross || info.gross || info.rate || 0),
    loadedMiles:Number(matchingBusiness?.loadedMiles || info.loadedMiles || info.miles || 0),
    deadheadMiles:Number(matchingBusiness?.deadheadMiles || 0),
    appointment:next.appointment || next.deliveryAppointment || info.appointment || '',
    legs:ordered,
  };
}

function activeRouteUrl(load) {
  if (!load) return '';
  const origin = load.origin;
  const destination = load.destination || load.nextDestination;
  if (!origin || !destination) return '';
  const waypoints = (load.legs || []).map(leg => cityState(leg.toCity, leg.toState)).filter(Boolean);
  const unique = [...new Set(waypoints)];
  const middle = unique.filter(place => place !== destination);
  const params = new URLSearchParams({ api:'1', origin, destination, travelmode:'driving' });
  if (middle.length) params.set('waypoints', middle.join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function useBusinessSnapshot() {
  const [store, setStore] = useState(() => readBusinessStore());
  useEffect(() => {
    function refresh(event) {
      setStore(event?.detail || readBusinessStore());
    }
    window.addEventListener(BUSINESS_STORE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(BUSINESS_STORE_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return store;
}

function RecentLogRow({ state, day, today, onOpen }) {
  const raw = rawStoredEventsForDay(state.eventsByDay || {}, day);
  const events = displayEventsForDay(raw, day === today);
  const last = raw.at(-1);
  const status = last?.status || (day === today ? safeLiveStatus(state.currentStatus || 'OFF', raw.length > 0) : 'OFF');
  const certified = state.certifyStatus?.[day] === 'Certified';
  const issues = day < today ? validateLogForSigning(state, day).length : 0;
  const parts = dayParts(day);
  return (
    <button type="button" className="command-log-row" onClick={() => onOpen(day)}>
      <span className={`command-log-status ${status}`}>{SHORT[status] || status}</span>
      <span className="command-log-copy"><b>{day === today ? 'Today' : parts.weekday}</b><em>{parts.date} · {hoursLabel(duration(events))}</em></span>
      <span className={issues ? 'command-log-state warn' : certified ? 'command-log-state done' : 'command-log-state'}>{issues ? `${issues} review` : certified ? 'Signed' : day === today ? 'Active' : 'Open'}</span>
      <Icon name="chevron" size={17} />
    </button>
  );
}

function ModuleCard({ icon, title, detail, metric, tone = 'blue', onClick }) {
  return (
    <button type="button" className={`command-module-card ${tone}`} onClick={onClick}>
      <span className="command-module-icon"><Icon name={icon} /></span>
      <span className="command-module-copy"><b>{title}</b><em>{detail}</em></span>
      {metric ? <strong>{metric}</strong> : <Icon name="chevron" size={17} />}
    </button>
  );
}

export default function HomeScreen({
  state,
  onOpenDay,
  onOpenStatus,
  onOpenTrailer,
  onOpenUnsigned,
  onOpenDot,
  onOpenWallet,
  onOpenDrive,
}) {
  const today = localDayKey();
  const [businessSection, setBusinessSection] = useState('');
  const [showAllLogs, setShowAllLogs] = useState(false);
  const businessStore = useBusinessSnapshot();
  const business = useMemo(() => businessSummary(businessStore), [businessStore]);
  const summary = statusSummary(state);
  const unsigned = signableLogDays(state).length;
  const walletSummary = evaluateDotWallet(state.dotWallet || {});
  const walletCard = walletCardLabel(walletSummary);
  const activeLoad = useMemo(() => activeLoadSummary(state, businessStore), [state, businessStore]);
  const roadsideDays = useMemo(() => Array.from({ length:8 }, (_, index) => addDays(today, -index)), [today]);
  const logDays = showAllLogs ? roadsideDays : roadsideDays.slice(0, 4);

  if (businessSection) {
    return (
      <OwnerOpBusinessScreen
        state={state}
        section={businessSection}
        onBack={() => setBusinessSection('')}
        onOpenLog={() => onOpenDay?.(today)}
      />
    );
  }

  const reason = `${summary.reason || ''}`;
  let nextStep = {
    eyebrow:'Next driver step',
    title:'Update your duty status',
    detail:'Keep the log current before the next move.',
    actionLabel:'Change status',
    action:() => onOpenStatus?.(),
    tone:'status',
  };

  if (unsigned > 0) {
    nextStep = {
      eyebrow:'Paperwork reminder',
      title:`${unsigned} log${unsigned === 1 ? '' : 's'} need signing`,
      detail:'Finish certification while the details are fresh.',
      actionLabel:'Review logs',
      action:() => onOpenUnsigned?.(),
      tone:'warning',
    };
  } else if (activeLoad && /pickup|loading/i.test(reason) && activeLoad.docs.length === 0) {
    nextStep = {
      eyebrow:'Pickup workflow',
      title:'Add BOL before leaving',
      detail:`${activeLoad.origin || 'Pickup'} is active. Save the shipping reference and destination.`,
      actionLabel:'Open pickup',
      action:() => onOpenDay?.(today),
      tone:'load',
    };
  } else if (activeLoad && /delivery|unloading/i.test(reason)) {
    nextStep = {
      eyebrow:'Delivery workflow',
      title:'Finish delivery paperwork',
      detail:'Add POD, check out and close the current stop.',
      actionLabel:'Open delivery',
      action:() => onOpenDay?.(today),
      tone:'load',
    };
  } else if (summary.status === 'D') {
    nextStep = {
      eyebrow:'Drive mode',
      title:`Continue to ${activeLoad?.nextDestination || activeLoad?.destination || 'the next stop'}`,
      detail:'Clocks and active-load details stay one tap away.',
      actionLabel:'Open drive mode',
      action:() => (onOpenDrive ? onOpenDrive() : onOpenStatus?.()),
      tone:'drive',
    };
  } else if (activeLoad) {
    nextStep = {
      eyebrow:'Active load',
      title:`Next: ${activeLoad.nextDestination || activeLoad.destination || 'continue load'}`,
      detail:activeLoad.appointment ? `Appointment ${activeLoad.appointment}` : 'Open the load or update your status when ready.',
      actionLabel:'Continue load',
      action:() => onOpenStatus?.(),
      tone:'load',
    };
  } else {
    nextStep = {
      eyebrow:'Start the next load',
      title:'Add a rate confirmation',
      detail:'Track the route, gross, loaded miles and payment from the first step.',
      actionLabel:'Add load',
      action:() => setBusinessSection('loads'),
      tone:'business',
    };
  }

  const totalLoadMiles = Number(activeLoad?.loadedMiles || 0) + Number(activeLoad?.deadheadMiles || 0);
  const loadProgress = activeLoad?.stopCount ? Math.min(100, (activeLoad.completedStops / activeLoad.stopCount) * 100) : 0;
  const routeUrl = activeRouteUrl(activeLoad);
  const attention = [];

  if (unsigned > 0) attention.push({ title:`${unsigned} log${unsigned === 1 ? '' : 's'} need signing`, detail:'Certification is still open.', action:() => onOpenUnsigned?.() });
  if (activeLoad && activeLoad.docs.length === 0) attention.push({ title:'Active load has no BOL', detail:'Add the shipping reference before DOT review.', action:() => onOpenDay?.(today) });
  if (business.readyToInvoice > 0) attention.push({ title:`${business.readyToInvoice} load${business.readyToInvoice === 1 ? '' : 's'} ready to invoice`, detail:'Complete billing while POD is fresh.', action:() => setBusinessSection('loads') });
  if (business.missingFuelReceipts > 0) attention.push({ title:`${business.missingFuelReceipts} fuel receipt${business.missingFuelReceipts === 1 ? '' : 's'} missing`, detail:'Add receipt proof before IFTA review.', action:() => setBusinessSection('fuel') });

  const modules = [
    { icon:'log', title:'Logbook', detail:`${summary.label} · ${unsigned ? `${unsigned} unsigned` : 'up to date'}`, metric:'Open', tone:'blue', onClick:() => onOpenDay?.(today) },
    { icon:'shield', title:'DOT Mode', detail:`${activeLoad?.docs.length || 0} active BOL${activeLoad?.docs.length === 1 ? '' : 's'}`, metric:'Ready', tone:'green', onClick:() => onOpenDot?.() },
    { icon:'wallet', title:'Wallet', detail:walletCard.detail || 'Roadside documents', metric:walletCard.status === 'ok' ? 'Valid' : 'Review', tone:'violet', onClick:() => onOpenWallet?.() },
    { icon:'load', title:'Loads & Billing', detail:`${business.activeLoads} active · ${business.readyToInvoice} to invoice`, metric:money(business.unpaid), tone:'indigo', onClick:() => setBusinessSection('loads') },
    { icon:'fuel', title:'Fuel & IFTA', detail:`${business.fuelGallons.toFixed(1)} gal this week`, metric:money(business.fuelCost), tone:'amber', onClick:() => setBusinessSection('fuel') },
    { icon:'wrench', title:'Maintenance', detail:'Repairs and service schedule', metric:money(business.maintenanceCost), tone:'slate', onClick:() => setBusinessSection('maintenance') },
    { icon:'receipt', title:'Expenses', detail:'Tolls, parking, lumper and fees', metric:money(business.otherExpenses), tone:'rose', onClick:() => setBusinessSection('expenses') },
    { icon:'chart', title:'Performance', detail:`${business.totalMiles.toLocaleString()} total miles`, metric:money2(business.netPerMile), tone:'teal', onClick:() => setBusinessSection('performance') },
  ];

  return (
    <section className="screen command-home-screen">
      <header className="command-home-head">
        <div className="command-brand">
          <span className="command-brand-mark"><Icon name="truck" size={20} /></span>
          <div><b>Road Ready</b><em>Owner-Op Command Center</em></div>
        </div>
        <button type="button" className="command-scan-btn" onClick={() => setBusinessSection('loads')}><Icon name="scan" size={19} /><span>Scan</span></button>
      </header>

      <main className="command-home-body">
        <section className="command-ready-card">
          <div className="command-ready-top">
            <span className="command-ready-pill"><i /> Road ready</span>
            <button type="button" onClick={onOpenTrailer}>{summary.vehicle}</button>
          </div>
          <button type="button" className="command-current-status" onClick={onOpenStatus}>
            <span className={`command-status-badge ${summary.status}`}>{SHORT[summary.status] || summary.status}</span>
            <span><b>{summary.label}</b><em>{summary.location}</em></span>
            <Icon name="chevron" size={18} />
          </button>
        </section>

        <section className={`command-next-card ${nextStep.tone}`}>
          <div className="command-card-eyebrow"><Icon name={nextStep.tone === 'drive' ? 'route' : nextStep.tone === 'warning' ? 'clock' : 'truck'} size={17} />{nextStep.eyebrow}</div>
          <h1>{nextStep.title}</h1>
          <p>{nextStep.detail}</p>
          <button type="button" onClick={nextStep.action}>{nextStep.actionLabel}<Icon name="chevron" size={17} /></button>
        </section>

        <section className={activeLoad ? 'command-load-card' : 'command-load-card empty'}>
          <div className="command-load-head">
            <div><span>Active load</span><b>{activeLoad?.loadNo || 'No active load'}</b></div>
            <span className={activeLoad ? 'command-load-chip active' : 'command-load-chip'}>{activeLoad ? 'In progress' : 'Ready to book'}</span>
          </div>
          {activeLoad ? (
            <>
              <div className="command-load-route">
                <span className="command-route-dot start" />
                <div><b>{activeLoad.origin || 'Pickup not entered'}</b><em>Pickup</em></div>
                <span className="command-route-line" />
                <span className="command-route-dot end" />
                <div><b>{activeLoad.nextDestination || activeLoad.destination || 'Destination not entered'}</b><em>{activeLoad.stopCount > 1 ? `Stop ${activeLoad.currentStop} of ${activeLoad.stopCount}` : 'Delivery'}</em></div>
              </div>
              {activeLoad.stopCount > 1 ? (
                <div className="command-load-progress"><span><i style={{ width:`${loadProgress}%` }} /></span><em>{activeLoad.completedStops} of {activeLoad.stopCount} stops complete</em></div>
              ) : null}
              <div className="command-load-metrics">
                <span><em>Gross</em><b>{activeLoad.gross ? money(activeLoad.gross) : '—'}</b></span>
                <span><em>Miles</em><b>{totalLoadMiles ? totalLoadMiles.toLocaleString() : '—'}</b></span>
                <span><em>BOLs</em><b>{activeLoad.docs.length}</b></span>
              </div>
              <div className="command-load-actions">
                <button type="button" onClick={() => onOpenDay?.(today)}>Open load</button>
                <button type="button" disabled={!routeUrl} onClick={() => routeUrl && window.open(routeUrl, '_blank', 'noopener,noreferrer')}><Icon name="route" size={17} /> Route</button>
                <button type="button" onClick={() => setBusinessSection('loads')}>Billing</button>
              </div>
            </>
          ) : (
            <div className="command-load-empty">
              <p>Add a rate confirmation to track gross, route, miles, paperwork and payment.</p>
              <button type="button" onClick={() => setBusinessSection('loads')}>+ Add rate confirmation</button>
            </div>
          )}
        </section>

        <section className="command-hos-card">
          <div className="command-section-title"><span>Hours of service</span><button type="button" onClick={() => onOpenDay?.(today)}>Open log</button></div>
          <HosCompactClocks state={state} />
        </section>

        <section className="command-modules-section">
          <div className="command-section-title"><span>Your operation</span><em>Everything in one place</em></div>
          <div className="command-module-grid">
            {modules.map(module => <ModuleCard key={module.title} {...module} />)}
          </div>
        </section>

        <section className="command-attention-section">
          <div className="command-section-title"><span>Needs attention</span><em>{attention.length ? `${attention.length} action${attention.length === 1 ? '' : 's'}` : 'All caught up'}</em></div>
          {attention.length ? (
            <div className="command-attention-list">
              {attention.slice(0, 4).map((item, index) => (
                <button type="button" key={`${item.title}_${index}`} onClick={item.action}>
                  <span>{index + 1}</span><span><b>{item.title}</b><em>{item.detail}</em></span><Icon name="chevron" size={17} />
                </button>
              ))}
            </div>
          ) : (
            <div className="command-all-clear"><span>✓</span><div><b>Everything looks good</b><em>Logs, documents and business tasks are caught up.</em></div></div>
          )}
        </section>

        <section className="command-week-card">
          <div className="command-section-title light"><span>This week</span><button type="button" onClick={() => setBusinessSection('performance')}>Full report</button></div>
          <div className="command-week-main"><span><em>Gross</em><b>{money(business.gross)}</b></span><span><em>Expenses</em><b>{money(business.totalExpenses)}</b></span><span className="net"><em>Est. net</em><b>{money(business.estimatedNet)}</b></span></div>
          <div className="command-week-foot"><span>{business.totalMiles.toLocaleString()} miles</span><i /><span>{money2(business.grossPerMile)} gross / mi</span><i /><span>{money2(business.netPerMile)} net / mi</span></div>
        </section>

        <section className="command-recent-section">
          <div className="command-section-title"><span>Recent logs</span><button type="button" onClick={() => setShowAllLogs(value => !value)}>{showAllLogs ? 'Show less' : 'All 8 days'}</button></div>
          <div className="command-log-list">
            {logDays.map(day => <RecentLogRow key={day} state={state} day={day} today={today} onOpen={onOpenDay} />)}
          </div>
        </section>
      </main>

      <nav className="command-bottom-nav" aria-label="Primary navigation">
        <button type="button" className="active"><Icon name="home" /><span>Home</span></button>
        <button type="button" onClick={() => onOpenDay?.(today)}><Icon name="log" /><span>Logbook</span></button>
        <button type="button" className="drive" onClick={() => (onOpenDrive ? onOpenDrive() : onOpenStatus?.())}><span><Icon name="truck" /></span><em>Drive</em></button>
        <button type="button" onClick={() => setBusinessSection('loads')}><Icon name="load" /><span>Loads</span></button>
        <button type="button" onClick={() => setBusinessSection('performance')}><Icon name="more" /><span>More</span></button>
      </nav>
    </section>
  );
}
