import React, { useEffect, useMemo, useState } from 'react';
import {
  BUSINESS_STORE_EVENT,
  addBusinessRecord,
  businessSummary,
  localDateKey,
  readBusinessStore,
  removeBusinessRecord,
  updateBusinessRecord,
} from './businessStore.js';

const TABS = [
  { id:'loads', label:'Loads' },
  { id:'fuel', label:'Fuel' },
  { id:'maintenance', label:'Maintenance' },
  { id:'expenses', label:'Expenses' },
  { id:'performance', label:'Performance' },
];

const LOAD_STATUSES = [
  ['booked', 'Booked'],
  ['in_transit', 'In transit'],
  ['delivered', 'Delivered'],
  ['invoiced', 'Invoiced'],
  ['paid', 'Paid'],
];

const EXPENSE_CATEGORIES = [
  'Tolls', 'Parking', 'Scale', 'Lumper', 'Truck wash', 'Insurance',
  'Truck payment', 'Trailer payment', 'Factoring fee', 'Dispatch fee',
  'Phone / ELD', 'Permits', 'Office', 'Other',
];

const MAINTENANCE_CATEGORIES = [
  'Oil service', 'Tires', 'Brakes', 'Engine', 'Transmission', 'Electrical',
  'Trailer repair', 'Roadside service', 'Towing', 'Inspection', 'Other',
];

function money(value = 0) {
  const amount = Number(value || 0);
  return amount.toLocaleString(undefined, { style:'currency', currency:'USD', maximumFractionDigits:0 });
}

function money2(value = 0) {
  const amount = Number(value || 0);
  return amount.toLocaleString(undefined, { style:'currency', currency:'USD', minimumFractionDigits:2, maximumFractionDigits:2 });
}

function miles(value = 0) {
  return `${Math.round(Number(value || 0)).toLocaleString()} mi`;
}

function number(value = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusLabel(value = '') {
  return LOAD_STATUSES.find(([id]) => id === value)?.[1] || 'Booked';
}

function recordDateLabel(value = '') {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
}

function FormField({ label, children, wide = false }) {
  return (
    <label className={wide ? 'business-field wide' : 'business-field'}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ title, detail, action, actionLabel }) {
  return (
    <div className="business-empty">
      <span className="business-empty-mark" aria-hidden="true">+</span>
      <b>{title}</b>
      <p>{detail}</p>
      {action ? <button type="button" onClick={action}>{actionLabel}</button> : null}
    </div>
  );
}

function SummaryTile({ label, value, detail }) {
  return (
    <div className="business-summary-tile">
      <span>{label}</span>
      <b>{value}</b>
      {detail ? <em>{detail}</em> : null}
    </div>
  );
}

function LoadStatusActions({ store, load, onChange }) {
  const currentIndex = Math.max(0, LOAD_STATUSES.findIndex(([id]) => id === load.status));
  const next = LOAD_STATUSES[Math.min(LOAD_STATUSES.length - 1, currentIndex + 1)];
  if (!next || next[0] === load.status) return null;
  return (
    <button
      type="button"
      className="business-record-next"
      onClick={() => onChange(updateBusinessRecord(store, 'loads', load.id, { status:next[0] }))}
    >
      Mark {next[1]}
    </button>
  );
}

export default function OwnerOpBusinessScreen({ state, section = 'loads', onBack, onOpenLog }) {
  const [activeTab, setActiveTab] = useState(TABS.some(tab => tab.id === section) ? section : 'loads');
  const [store, setStore] = useState(() => readBusinessStore());
  const [showForm, setShowForm] = useState(false);
  const today = localDateKey();
  const currentLoad = state?.loadInfo || {};

  const [loadForm, setLoadForm] = useState({
    date:today,
    loadNo:'',
    broker:'',
    origin:'',
    destination:'',
    gross:'',
    loadedMiles:'',
    deadheadMiles:'',
    status:'booked',
  });
  const [fuelForm, setFuelForm] = useState({
    date:today,
    merchant:'',
    cityState:'',
    gallons:'',
    pricePerGallon:'',
    total:'',
    odometer:'',
    receiptAttached:true,
  });
  const [maintenanceForm, setMaintenanceForm] = useState({
    date:today,
    vendor:'',
    category:'Oil service',
    total:'',
    odometer:'',
    nextDueMiles:'',
    notes:'',
  });
  const [expenseForm, setExpenseForm] = useState({
    date:today,
    merchant:'',
    category:'Tolls',
    total:'',
    loadNo:'',
    reimbursable:false,
    receiptAttached:true,
  });

  useEffect(() => {
    setActiveTab(TABS.some(tab => tab.id === section) ? section : 'loads');
  }, [section]);

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

  useEffect(() => setShowForm(false), [activeTab]);

  const summary = useMemo(() => businessSummary(store), [store]);
  const latestOdometer = useMemo(() => {
    const values = [...store.fuel, ...store.maintenance].map(record => number(record.odometer)).filter(Boolean);
    return values.length ? Math.max(...values) : 0;
  }, [store]);

  const upcomingService = useMemo(() => {
    return store.maintenance
      .filter(record => number(record.nextDueMiles) > 0)
      .sort((a, b) => number(a.nextDueMiles) - number(b.nextDueMiles))[0] || null;
  }, [store]);

  const currentLoadDefaults = {
    loadNo:String(currentLoad.shippingDocs || currentLoad.loadNo || currentLoad.bol || '').trim(),
    broker:String(currentLoad.broker || '').trim(),
    origin:[currentLoad.pickupCity, currentLoad.pickupState].filter(Boolean).join(', '),
    destination:[currentLoad.deliveryCity, currentLoad.deliveryState].filter(Boolean).join(', '),
    gross:String(currentLoad.gross || currentLoad.rate || currentLoad.amount || ''),
    loadedMiles:String(currentLoad.loadedMiles || currentLoad.miles || ''),
  };

  function prefillCurrentLoad() {
    setLoadForm(current => ({ ...current, ...currentLoadDefaults }));
    setShowForm(true);
  }

  function saveLoad(event) {
    event.preventDefault();
    if (!loadForm.loadNo.trim() && !loadForm.origin.trim() && !loadForm.destination.trim()) return;
    const next = addBusinessRecord(store, 'loads', {
      ...loadForm,
      loadNo:loadForm.loadNo.trim(),
      broker:loadForm.broker.trim(),
      origin:loadForm.origin.trim(),
      destination:loadForm.destination.trim(),
      gross:number(loadForm.gross),
      loadedMiles:number(loadForm.loadedMiles),
      deadheadMiles:number(loadForm.deadheadMiles),
    });
    setStore(next);
    setLoadForm({ date:today, loadNo:'', broker:'', origin:'', destination:'', gross:'', loadedMiles:'', deadheadMiles:'', status:'booked' });
    setShowForm(false);
  }

  function saveFuel(event) {
    event.preventDefault();
    if (!fuelForm.total && !fuelForm.gallons) return;
    const gallons = number(fuelForm.gallons);
    const total = number(fuelForm.total) || (gallons * number(fuelForm.pricePerGallon));
    const next = addBusinessRecord(store, 'fuel', {
      ...fuelForm,
      merchant:fuelForm.merchant.trim(),
      cityState:fuelForm.cityState.trim(),
      gallons,
      total,
      pricePerGallon:number(fuelForm.pricePerGallon) || (gallons > 0 ? total / gallons : 0),
      odometer:number(fuelForm.odometer),
    });
    setStore(next);
    setFuelForm({ date:today, merchant:'', cityState:'', gallons:'', pricePerGallon:'', total:'', odometer:'', receiptAttached:true });
    setShowForm(false);
  }

  function saveMaintenance(event) {
    event.preventDefault();
    if (!maintenanceForm.total && !maintenanceForm.vendor.trim()) return;
    const next = addBusinessRecord(store, 'maintenance', {
      ...maintenanceForm,
      vendor:maintenanceForm.vendor.trim(),
      total:number(maintenanceForm.total),
      odometer:number(maintenanceForm.odometer),
      nextDueMiles:number(maintenanceForm.nextDueMiles),
      notes:maintenanceForm.notes.trim(),
    });
    setStore(next);
    setMaintenanceForm({ date:today, vendor:'', category:'Oil service', total:'', odometer:'', nextDueMiles:'', notes:'' });
    setShowForm(false);
  }

  function saveExpense(event) {
    event.preventDefault();
    if (!expenseForm.total && !expenseForm.merchant.trim()) return;
    const next = addBusinessRecord(store, 'expenses', {
      ...expenseForm,
      merchant:expenseForm.merchant.trim(),
      total:number(expenseForm.total),
      loadNo:expenseForm.loadNo.trim(),
    });
    setStore(next);
    setExpenseForm({ date:today, merchant:'', category:'Tolls', total:'', loadNo:'', reimbursable:false, receiptAttached:true });
    setShowForm(false);
  }

  function remove(bucket, id) {
    if (typeof window !== 'undefined' && !window.confirm('Remove this business record?')) return;
    setStore(removeBusinessRecord(store, bucket, id));
  }

  const deadheadPercent = summary.totalMiles > 0 ? (summary.deadheadMiles / summary.totalMiles) * 100 : 0;
  const serviceMilesLeft = upcomingService ? number(upcomingService.nextDueMiles) - latestOdometer : null;

  return (
    <section className="screen business-screen">
      <header className="business-head">
        <button type="button" className="business-back" onClick={onBack} aria-label="Back">‹</button>
        <div>
          <span>Owner-Op</span>
          <b>Business Center</b>
        </div>
        <button type="button" className="business-log-link" onClick={onOpenLog}>Log</button>
      </header>

      <div className="business-hero">
        <div className="business-hero-copy">
          <span>This week</span>
          <b>{money(summary.estimatedNet)}</b>
          <em>estimated net</em>
        </div>
        <div className="business-hero-ring">
          <span>{summary.totalMiles ? money2(summary.netPerMile) : '$0.00'}</span>
          <em>net / mi</em>
        </div>
      </div>

      <div className="business-tabbar" role="tablist" aria-label="Business sections">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <main className="business-body">
        {activeTab === 'loads' && (
          <>
            <div className="business-section-head">
              <div><span>Loads & billing</span><b>{store.loads.length} tracked loads</b></div>
              <button type="button" onClick={() => setShowForm(value => !value)}>{showForm ? 'Close' : '+ Add rate con'}</button>
            </div>

            <div className="business-summary-grid three">
              <SummaryTile label="Gross" value={money(summary.gross)} detail="this week" />
              <SummaryTile label="Unpaid" value={money(summary.unpaid)} detail="open balance" />
              <SummaryTile label="Invoice" value={String(summary.readyToInvoice)} detail="ready" />
            </div>

            {!showForm && (currentLoadDefaults.loadNo || currentLoadDefaults.origin || currentLoadDefaults.destination) ? (
              <button type="button" className="business-import-current" onClick={prefillCurrentLoad}>
                <span>Use active Road Ready load</span>
                <b>{currentLoadDefaults.loadNo || `${currentLoadDefaults.origin} → ${currentLoadDefaults.destination}`}</b>
                <em>Prefill rate and mileage tracking</em>
              </button>
            ) : null}

            {showForm && (
              <form className="business-form" onSubmit={saveLoad}>
                <div className="business-form-title"><b>Add rate confirmation</b><span>Track gross, route and miles</span></div>
                <div className="business-form-grid">
                  <FormField label="Date"><input type="date" value={loadForm.date} onChange={e => setLoadForm({ ...loadForm, date:e.target.value })} /></FormField>
                  <FormField label="Load #"><input value={loadForm.loadNo} onChange={e => setLoadForm({ ...loadForm, loadNo:e.target.value })} placeholder="Load / PO #" /></FormField>
                  <FormField label="Broker" wide><input value={loadForm.broker} onChange={e => setLoadForm({ ...loadForm, broker:e.target.value })} placeholder="Broker or customer" /></FormField>
                  <FormField label="Pickup" wide><input value={loadForm.origin} onChange={e => setLoadForm({ ...loadForm, origin:e.target.value })} placeholder="City, ST" /></FormField>
                  <FormField label="Delivery" wide><input value={loadForm.destination} onChange={e => setLoadForm({ ...loadForm, destination:e.target.value })} placeholder="City, ST" /></FormField>
                  <FormField label="Gross"><input inputMode="decimal" value={loadForm.gross} onChange={e => setLoadForm({ ...loadForm, gross:e.target.value })} placeholder="$0" /></FormField>
                  <FormField label="Loaded miles"><input inputMode="numeric" value={loadForm.loadedMiles} onChange={e => setLoadForm({ ...loadForm, loadedMiles:e.target.value })} placeholder="0" /></FormField>
                  <FormField label="Deadhead miles"><input inputMode="numeric" value={loadForm.deadheadMiles} onChange={e => setLoadForm({ ...loadForm, deadheadMiles:e.target.value })} placeholder="0" /></FormField>
                  <FormField label="Status"><select value={loadForm.status} onChange={e => setLoadForm({ ...loadForm, status:e.target.value })}>{LOAD_STATUSES.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></FormField>
                </div>
                <button type="submit" className="business-save">Save load</button>
              </form>
            )}

            {!store.loads.length ? (
              <EmptyState title="No rate confirmations yet" detail="Add a load to track weekly gross, mileage, invoicing and payment status." action={() => setShowForm(true)} actionLabel="Add first load" />
            ) : (
              <div className="business-record-list">
                {store.loads.map(load => {
                  const totalMiles = number(load.loadedMiles) + number(load.deadheadMiles);
                  const rpm = totalMiles > 0 ? number(load.gross) / totalMiles : 0;
                  return (
                    <article key={load.id} className="business-record-card load-record">
                      <div className="business-record-top">
                        <span className={`business-status ${load.status || 'booked'}`}>{statusLabel(load.status)}</span>
                        <button type="button" onClick={() => remove('loads', load.id)} aria-label="Remove load">×</button>
                      </div>
                      <b>{load.loadNo || 'Unnumbered load'}</b>
                      <p>{[load.origin, load.destination].filter(Boolean).join(' → ') || load.broker || 'Route not entered'}</p>
                      <div className="business-record-stats">
                        <span><em>Gross</em><b>{money(load.gross)}</b></span>
                        <span><em>Miles</em><b>{miles(totalMiles)}</b></span>
                        <span><em>Gross / mi</em><b>{money2(rpm)}</b></span>
                      </div>
                      <div className="business-record-foot">
                        <span>{recordDateLabel(load.date)}</span>
                        <LoadStatusActions store={store} load={load} onChange={setStore} />
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}

        {activeTab === 'fuel' && (
          <>
            <div className="business-section-head">
              <div><span>Fuel control</span><b>Receipts · gallons · IFTA</b></div>
              <button type="button" onClick={() => setShowForm(value => !value)}>{showForm ? 'Close' : '+ Add fuel'}</button>
            </div>
            <div className="business-summary-grid three">
              <SummaryTile label="Fuel" value={money(summary.fuelCost)} detail="this week" />
              <SummaryTile label="Gallons" value={summary.fuelGallons.toFixed(1)} detail="purchased" />
              <SummaryTile label="Avg price" value={money2(summary.averageFuelPrice)} detail="per gallon" />
            </div>

            {showForm && (
              <form className="business-form" onSubmit={saveFuel}>
                <div className="business-form-title"><b>Add fuel purchase</b><span>Use the receipt totals</span></div>
                <div className="business-form-grid">
                  <FormField label="Date"><input type="date" value={fuelForm.date} onChange={e => setFuelForm({ ...fuelForm, date:e.target.value })} /></FormField>
                  <FormField label="Truck stop"><input value={fuelForm.merchant} onChange={e => setFuelForm({ ...fuelForm, merchant:e.target.value })} placeholder="Pilot, Love's…" /></FormField>
                  <FormField label="City, state" wide><input value={fuelForm.cityState} onChange={e => setFuelForm({ ...fuelForm, cityState:e.target.value })} placeholder="Joliet, IL" /></FormField>
                  <FormField label="Gallons"><input inputMode="decimal" value={fuelForm.gallons} onChange={e => setFuelForm({ ...fuelForm, gallons:e.target.value })} placeholder="0.0" /></FormField>
                  <FormField label="Price / gal"><input inputMode="decimal" value={fuelForm.pricePerGallon} onChange={e => setFuelForm({ ...fuelForm, pricePerGallon:e.target.value })} placeholder="$0.00" /></FormField>
                  <FormField label="Total"><input inputMode="decimal" value={fuelForm.total} onChange={e => setFuelForm({ ...fuelForm, total:e.target.value })} placeholder="$0.00" /></FormField>
                  <FormField label="Odometer"><input inputMode="numeric" value={fuelForm.odometer} onChange={e => setFuelForm({ ...fuelForm, odometer:e.target.value })} placeholder="0" /></FormField>
                  <label className="business-check wide"><input type="checkbox" checked={fuelForm.receiptAttached} onChange={e => setFuelForm({ ...fuelForm, receiptAttached:e.target.checked })} /><span>Receipt saved</span></label>
                </div>
                <button type="submit" className="business-save">Save fuel</button>
              </form>
            )}

            {!store.fuel.length ? (
              <EmptyState title="No fuel purchases yet" detail="Track gallons, price, IFTA state and fuel cost per mile." action={() => setShowForm(true)} actionLabel="Add fuel purchase" />
            ) : (
              <div className="business-record-list compact">
                {store.fuel.map(record => (
                  <article key={record.id} className="business-record-card">
                    <div className="business-record-top"><span>{recordDateLabel(record.date)}</span><button type="button" onClick={() => remove('fuel', record.id)}>×</button></div>
                    <b>{record.merchant || 'Fuel purchase'}</b>
                    <p>{record.cityState || 'Location missing'} · {number(record.gallons).toFixed(1)} gal</p>
                    <div className="business-record-row"><strong>{money2(record.total)}</strong><span>{money2(record.pricePerGallon)} / gal</span></div>
                    {!record.receiptAttached ? <em className="business-warning">Receipt missing</em> : null}
                  </article>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'maintenance' && (
          <>
            <div className="business-section-head">
              <div><span>Maintenance & repairs</span><b>Service history and cost</b></div>
              <button type="button" onClick={() => setShowForm(value => !value)}>{showForm ? 'Close' : '+ Add repair'}</button>
            </div>
            <div className="business-summary-grid three">
              <SummaryTile label="Repairs" value={money(summary.maintenanceCost)} detail="this week" />
              <SummaryTile label="Odometer" value={latestOdometer ? latestOdometer.toLocaleString() : '—'} detail="latest entry" />
              <SummaryTile label="Next service" value={serviceMilesLeft == null ? '—' : miles(Math.max(0, serviceMilesLeft))} detail={serviceMilesLeft != null && serviceMilesLeft <= 0 ? 'due now' : 'remaining'} />
            </div>

            {showForm && (
              <form className="business-form" onSubmit={saveMaintenance}>
                <div className="business-form-title"><b>Add maintenance bill</b><span>Track parts, labor and next service</span></div>
                <div className="business-form-grid">
                  <FormField label="Date"><input type="date" value={maintenanceForm.date} onChange={e => setMaintenanceForm({ ...maintenanceForm, date:e.target.value })} /></FormField>
                  <FormField label="Shop"><input value={maintenanceForm.vendor} onChange={e => setMaintenanceForm({ ...maintenanceForm, vendor:e.target.value })} placeholder="Repair shop" /></FormField>
                  <FormField label="Category" wide><select value={maintenanceForm.category} onChange={e => setMaintenanceForm({ ...maintenanceForm, category:e.target.value })}>{MAINTENANCE_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></FormField>
                  <FormField label="Total"><input inputMode="decimal" value={maintenanceForm.total} onChange={e => setMaintenanceForm({ ...maintenanceForm, total:e.target.value })} placeholder="$0.00" /></FormField>
                  <FormField label="Odometer"><input inputMode="numeric" value={maintenanceForm.odometer} onChange={e => setMaintenanceForm({ ...maintenanceForm, odometer:e.target.value })} placeholder="0" /></FormField>
                  <FormField label="Next due miles" wide><input inputMode="numeric" value={maintenanceForm.nextDueMiles} onChange={e => setMaintenanceForm({ ...maintenanceForm, nextDueMiles:e.target.value })} placeholder="Odometer reading for next service" /></FormField>
                  <FormField label="Notes" wide><textarea value={maintenanceForm.notes} onChange={e => setMaintenanceForm({ ...maintenanceForm, notes:e.target.value })} placeholder="Parts, labor, warranty…" /></FormField>
                </div>
                <button type="submit" className="business-save">Save maintenance</button>
              </form>
            )}

            {!store.maintenance.length ? (
              <EmptyState title="No maintenance records" detail="Save repair bills and track cost per mile and upcoming service." action={() => setShowForm(true)} actionLabel="Add maintenance" />
            ) : (
              <div className="business-record-list compact">
                {store.maintenance.map(record => (
                  <article key={record.id} className="business-record-card">
                    <div className="business-record-top"><span>{recordDateLabel(record.date)}</span><button type="button" onClick={() => remove('maintenance', record.id)}>×</button></div>
                    <b>{record.category || 'Maintenance'}</b>
                    <p>{record.vendor || 'Shop not entered'}{record.odometer ? ` · ${number(record.odometer).toLocaleString()} mi` : ''}</p>
                    <div className="business-record-row"><strong>{money2(record.total)}</strong>{record.nextDueMiles ? <span>Next: {number(record.nextDueMiles).toLocaleString()} mi</span> : null}</div>
                    {record.notes ? <small>{record.notes}</small> : null}
                  </article>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'expenses' && (
          <>
            <div className="business-section-head">
              <div><span>Operating expenses</span><b>Tolls, parking, lumper and more</b></div>
              <button type="button" onClick={() => setShowForm(value => !value)}>{showForm ? 'Close' : '+ Add expense'}</button>
            </div>
            <div className="business-summary-grid three">
              <SummaryTile label="Other spend" value={money(summary.otherExpenses)} detail="this week" />
              <SummaryTile label="Total cost" value={money(summary.totalExpenses)} detail="fuel + repairs" />
              <SummaryTile label="Cost / mi" value={money2(summary.costPerMile)} detail="all miles" />
            </div>

            {showForm && (
              <form className="business-form" onSubmit={saveExpense}>
                <div className="business-form-title"><b>Add expense</b><span>Link it to a load when needed</span></div>
                <div className="business-form-grid">
                  <FormField label="Date"><input type="date" value={expenseForm.date} onChange={e => setExpenseForm({ ...expenseForm, date:e.target.value })} /></FormField>
                  <FormField label="Merchant"><input value={expenseForm.merchant} onChange={e => setExpenseForm({ ...expenseForm, merchant:e.target.value })} placeholder="Merchant" /></FormField>
                  <FormField label="Category"><select value={expenseForm.category} onChange={e => setExpenseForm({ ...expenseForm, category:e.target.value })}>{EXPENSE_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></FormField>
                  <FormField label="Total"><input inputMode="decimal" value={expenseForm.total} onChange={e => setExpenseForm({ ...expenseForm, total:e.target.value })} placeholder="$0.00" /></FormField>
                  <FormField label="Load #" wide><input value={expenseForm.loadNo} onChange={e => setExpenseForm({ ...expenseForm, loadNo:e.target.value })} placeholder="Optional" /></FormField>
                  <label className="business-check"><input type="checkbox" checked={expenseForm.reimbursable} onChange={e => setExpenseForm({ ...expenseForm, reimbursable:e.target.checked })} /><span>Reimbursable</span></label>
                  <label className="business-check"><input type="checkbox" checked={expenseForm.receiptAttached} onChange={e => setExpenseForm({ ...expenseForm, receiptAttached:e.target.checked })} /><span>Receipt saved</span></label>
                </div>
                <button type="submit" className="business-save">Save expense</button>
              </form>
            )}

            {!store.expenses.length ? (
              <EmptyState title="No expenses yet" detail="Track tolls, parking, lumper, fees and other operating costs." action={() => setShowForm(true)} actionLabel="Add expense" />
            ) : (
              <div className="business-record-list compact">
                {store.expenses.map(record => (
                  <article key={record.id} className="business-record-card">
                    <div className="business-record-top"><span>{recordDateLabel(record.date)}</span><button type="button" onClick={() => remove('expenses', record.id)}>×</button></div>
                    <b>{record.category || 'Expense'}</b>
                    <p>{record.merchant || 'Merchant not entered'}{record.loadNo ? ` · Load ${record.loadNo}` : ''}</p>
                    <div className="business-record-row"><strong>{money2(record.total)}</strong><span>{record.reimbursable ? 'Reimbursable' : 'Operating cost'}</span></div>
                    {!record.receiptAttached ? <em className="business-warning">Receipt missing</em> : null}
                  </article>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'performance' && (
          <>
            <div className="business-section-head">
              <div><span>Weekly performance</span><b>Profitability on all miles</b></div>
            </div>
            <div className="performance-profit-card">
              <span>Estimated net</span>
              <b>{money(summary.estimatedNet)}</b>
              <div><em>{money2(summary.netPerMile)} net / mi</em><em>{money2(summary.grossPerMile)} gross / mi</em></div>
            </div>
            <div className="business-summary-grid two performance-grid">
              <SummaryTile label="Gross" value={money(summary.gross)} detail="booked this week" />
              <SummaryTile label="Expenses" value={money(summary.totalExpenses)} detail="tracked costs" />
              <SummaryTile label="Loaded miles" value={miles(summary.loadedMiles)} detail="revenue miles" />
              <SummaryTile label="Deadhead" value={miles(summary.deadheadMiles)} detail={`${deadheadPercent.toFixed(0)}% empty`} />
              <SummaryTile label="Fuel" value={money(summary.fuelCost)} detail={`${money2(summary.totalMiles ? summary.fuelCost / summary.totalMiles : 0)} / mi`} />
              <SummaryTile label="Maintenance" value={money(summary.maintenanceCost)} detail={`${money2(summary.totalMiles ? summary.maintenanceCost / summary.totalMiles : 0)} / mi`} />
            </div>

            <div className="business-insights">
              <div className="business-section-head inline"><div><span>Smart review</span><b>Best next actions</b></div></div>
              {!summary.totalMiles && !summary.gross ? (
                <p>Add loads, fuel and expenses to build the first weekly scorecard.</p>
              ) : (
                <ul>
                  {deadheadPercent > 15 ? <li><b>Deadhead is {deadheadPercent.toFixed(0)}%.</b><span>Try to line up the next pickup closer to the final stop.</span></li> : <li><b>Deadhead is controlled.</b><span>{deadheadPercent.toFixed(0)}% of tracked miles are empty.</span></li>}
                  {summary.missingFuelReceipts > 0 ? <li><b>{summary.missingFuelReceipts} fuel receipt{summary.missingFuelReceipts === 1 ? '' : 's'} missing.</b><span>Add them before IFTA and tax review.</span></li> : <li><b>Fuel receipts are complete.</b><span>Every tracked fuel entry has a receipt marker.</span></li>}
                  {summary.readyToInvoice > 0 ? <li><b>{summary.readyToInvoice} load{summary.readyToInvoice === 1 ? '' : 's'} ready to invoice.</b><span>Send paperwork while the delivery is fresh.</span></li> : null}
                  {summary.grossPerMile > 0 && summary.grossPerMile < 2.5 ? <li><b>Gross per mile is {money2(summary.grossPerMile)}.</b><span>Review rate and deadhead before booking similar lanes.</span></li> : null}
                </ul>
              )}
            </div>
          </>
        )}
      </main>
    </section>
  );
}
