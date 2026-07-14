export const BUSINESS_STORE_KEY = 'owner-op-road-ready-business-v1';
export const BUSINESS_STORE_EVENT = 'owner-op-business-updated';

const EMPTY_STORE = {
  loads: [],
  settlements: [],
  fuel: [],
  maintenance: [],
  expenses: [],
  documents: [],
  updatedAt: 0,
};

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanRecord(record = {}) {
  return {
    ...record,
    id: String(record.id || ''),
    createdAt: number(record.createdAt, Date.now()),
    updatedAt: number(record.updatedAt, Date.now()),
  };
}

export function emptyBusinessStore() {
  return {
    ...EMPTY_STORE,
    loads: [],
    settlements: [],
    fuel: [],
    maintenance: [],
    expenses: [],
    documents: [],
  };
}

export function normalizeBusinessStore(value = {}) {
  return {
    loads: list(value.loads).map(cleanRecord),
    settlements: list(value.settlements).map(cleanRecord),
    fuel: list(value.fuel).map(cleanRecord),
    maintenance: list(value.maintenance).map(cleanRecord),
    expenses: list(value.expenses).map(cleanRecord),
    documents: list(value.documents).map(cleanRecord),
    updatedAt: number(value.updatedAt, 0),
  };
}

export function readBusinessStore() {
  if (typeof window === 'undefined' || !window.localStorage) return emptyBusinessStore();
  try {
    const raw = window.localStorage.getItem(BUSINESS_STORE_KEY);
    return raw ? normalizeBusinessStore(JSON.parse(raw)) : emptyBusinessStore();
  } catch {
    return emptyBusinessStore();
  }
}

export function writeBusinessStore(value = {}) {
  const next = normalizeBusinessStore({ ...value, updatedAt: Date.now() });
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(BUSINESS_STORE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(BUSINESS_STORE_EVENT, { detail: next }));
  }
  return next;
}

export function businessRecordId(prefix = 'record') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function addBusinessRecord(store, bucket, record = {}) {
  const current = normalizeBusinessStore(store);
  if (!Object.prototype.hasOwnProperty.call(current, bucket)) return current;
  const now = Date.now();
  const nextRecord = cleanRecord({
    ...record,
    id: record.id || businessRecordId(bucket),
    createdAt: record.createdAt || now,
    updatedAt: now,
  });
  return writeBusinessStore({
    ...current,
    [bucket]: [nextRecord, ...current[bucket]],
  });
}

export function updateBusinessRecord(store, bucket, id, patch = {}) {
  const current = normalizeBusinessStore(store);
  if (!Object.prototype.hasOwnProperty.call(current, bucket)) return current;
  return writeBusinessStore({
    ...current,
    [bucket]: current[bucket].map(record => (
      record.id === id ? cleanRecord({ ...record, ...patch, id:record.id, updatedAt:Date.now() }) : record
    )),
  });
}

export function removeBusinessRecord(store, bucket, id) {
  const current = normalizeBusinessStore(store);
  if (!Object.prototype.hasOwnProperty.call(current, bucket)) return current;
  return writeBusinessStore({
    ...current,
    [bucket]: current[bucket].filter(record => record.id !== id),
  });
}

export function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function currentWeekStart(reference = new Date()) {
  const date = reference instanceof Date ? new Date(reference) : new Date(reference);
  if (Number.isNaN(date.getTime())) return new Date();
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  return date;
}

function recordDate(record = {}) {
  const candidate = record.date || record.deliveredDate || record.bookedDate || record.createdAt;
  const parsed = candidate instanceof Date ? candidate : new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

export function recordsThisWeek(records = [], reference = new Date()) {
  const start = currentWeekStart(reference).getTime();
  const end = start + (7 * 24 * 60 * 60 * 1000);
  return list(records).filter(record => {
    const time = recordDate(record).getTime();
    return time >= start && time < end;
  });
}

export function businessSummary(value = {}, reference = new Date()) {
  const store = normalizeBusinessStore(value);
  const loads = recordsThisWeek(store.loads, reference);
  const settlements = recordsThisWeek(store.settlements, reference);
  const fuel = recordsThisWeek(store.fuel, reference);
  const maintenance = recordsThisWeek(store.maintenance, reference);
  const expenses = recordsThisWeek(store.expenses, reference);

  const gross = loads.reduce((sum, record) => sum + number(record.gross), 0);
  const loadedMiles = loads.reduce((sum, record) => sum + number(record.loadedMiles), 0);
  const deadheadMiles = loads.reduce((sum, record) => sum + number(record.deadheadMiles), 0);
  const totalMiles = loadedMiles + deadheadMiles;
  const fuelCost = fuel.reduce((sum, record) => sum + number(record.total), 0);
  const fuelGallons = fuel.reduce((sum, record) => sum + number(record.gallons), 0);
  const maintenanceCost = maintenance.reduce((sum, record) => sum + number(record.total), 0);
  const otherExpenses = expenses.reduce((sum, record) => sum + number(record.total), 0);
  const totalExpenses = fuelCost + maintenanceCost + otherExpenses;
  const estimatedNet = gross - totalExpenses;
  const settlementExpected = settlements.reduce((sum, record) => sum + number(record.expectedPay || record.expected), 0);
  const settlementActual = settlements.reduce((sum, record) => sum + number(record.actualPay || record.netPay || record.actual), 0);
  const settlementDifference = settlementActual - settlementExpected;
  const unpaid = store.loads.filter(record => !['paid', 'cancelled'].includes(String(record.status || '').toLowerCase()))
    .reduce((sum, record) => sum + number(record.gross), 0);
  const readyToInvoice = store.loads.filter(record => ['delivered', 'invoice_ready'].includes(String(record.status || '').toLowerCase())).length;
  const activeLoads = store.loads.filter(record => !['paid', 'cancelled', 'completed'].includes(String(record.status || '').toLowerCase())).length;
  const missingFuelReceipts = store.fuel.filter(record => !record.receiptAttached).length;
  const estimatedTaxReserve = Math.max(0, estimatedNet * 0.25);

  return {
    gross,
    loadedMiles,
    deadheadMiles,
    totalMiles,
    fuelCost,
    fuelGallons,
    maintenanceCost,
    otherExpenses,
    totalExpenses,
    estimatedNet,
    estimatedTaxReserve,
    settlementExpected,
    settlementActual,
    settlementDifference,
    settlementCount:settlements.length,
    documentCount:store.documents.length,
    unpaid,
    readyToInvoice,
    activeLoads,
    missingFuelReceipts,
    grossPerMile: totalMiles > 0 ? gross / totalMiles : 0,
    costPerMile: totalMiles > 0 ? totalExpenses / totalMiles : 0,
    netPerMile: totalMiles > 0 ? estimatedNet / totalMiles : 0,
    averageFuelPrice: fuelGallons > 0 ? fuelCost / fuelGallons : 0,
  };
}
