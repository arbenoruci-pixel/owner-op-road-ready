export const OPERATOR_PROFILE_KEY = 'owner-op-road-ready-operator-profile-v1';
export const OPERATOR_PROFILE_EVENT = 'owner-op-operator-profile-updated';

export const OPERATOR_MODES = [
  {
    id:'leased_on',
    title:'Leased-on owner-operator',
    detail:'Track percentage pay, settlements, deductions, fuel, maintenance and documents.',
    badge:'Percentage pay',
  },
  {
    id:'own_authority',
    title:'Owner-operator with own authority',
    detail:'Manage rate confirmations, BOL/POD, invoices, broker payments and operating costs.',
    badge:'Invoices & loads',
  },
  {
    id:'business_only',
    title:'Business tools only',
    detail:'Fuel, receipts, taxes, maintenance and wallet without Road Ready Logbook.',
    badge:'No logbook required',
  },
  {
    id:'driver',
    title:'Driver workflow',
    detail:'Logbook, DOT Mode, current load documents, check-in and roadside wallet.',
    badge:'Driver focused',
  },
  {
    id:'small_fleet',
    title:'Small fleet',
    detail:'Multiple trucks, loads, settlements, costs and fleet performance.',
    badge:'Fleet ready',
  },
];

export const MODULE_CATALOG = [
  { id:'loads', label:'Loads & Documents', detail:'Rate confirmations, BOL, POD, stops and billing' },
  { id:'settlements', label:'Lease & Settlements', detail:'Percentage pay, deductions, escrow and short-pay review' },
  { id:'fuel', label:'Fuel & IFTA', detail:'Fuel receipts, gallons, MPG, cost per mile and state totals' },
  { id:'money', label:'Money & Taxes', detail:'Income, expenses, estimated profit and tax reserve' },
  { id:'maintenance', label:'Maintenance', detail:'Repair bills, service history and mileage reminders' },
  { id:'wallet', label:'Digital Wallet', detail:'Driver, truck, company and roadside documents' },
  { id:'expenses', label:'Expenses', detail:'Tolls, parking, scales, lumper and operating costs' },
  { id:'performance', label:'Performance', detail:'Gross, net, loaded/deadhead miles and cost per mile' },
  { id:'logbook', label:'Road Ready Logbook', detail:'Optional paper RODS, HOS clocks and signatures' },
  { id:'dot', label:'DOT Mode', detail:'Roadside package with active load documents' },
  { id:'drive', label:'Drive Mode', detail:'Driver-focused HOS and next-stop view' },
];

const MODE_DEFAULTS = {
  leased_on:['loads','settlements','fuel','money','maintenance','wallet','expenses','performance'],
  own_authority:['loads','fuel','money','maintenance','wallet','expenses','performance'],
  business_only:['fuel','money','maintenance','wallet','expenses','performance'],
  driver:['loads','wallet','logbook','dot','drive'],
  small_fleet:['loads','settlements','fuel','money','maintenance','wallet','expenses','performance'],
};

function clampPercent(value, fallback = 85) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed * 100) / 100));
}

function uniqueModules(values = []) {
  const allowed = new Set(MODULE_CATALOG.map(module => module.id));
  return [...new Set((Array.isArray(values) ? values : []).filter(value => allowed.has(value)))];
}

export function defaultsForMode(mode = 'business_only') {
  return [...(MODE_DEFAULTS[mode] || MODE_DEFAULTS.business_only)];
}

export function emptyOperatorProfile() {
  return {
    setupComplete:false,
    mode:'',
    companyName:'',
    carrierName:'',
    truckNumber:'',
    trailerNumber:'',
    fleetSize:1,
    driverSharePercent:85,
    carrierSharePercent:15,
    percentageBasis:'linehaul_fsc',
    modules:[],
    createdAt:null,
    updatedAt:0,
  };
}

export function normalizeOperatorProfile(value = {}) {
  const base = emptyOperatorProfile();
  const mode = OPERATOR_MODES.some(item => item.id === value.mode) ? value.mode : '';
  const driverSharePercent = clampPercent(value.driverSharePercent, 85);
  const carrierSharePercent = clampPercent(
    value.carrierSharePercent,
    Math.max(0, 100 - driverSharePercent)
  );
  const rawModules = uniqueModules(value.modules);
  const modules = rawModules.length ? rawModules : (mode ? defaultsForMode(mode) : []);
  return {
    ...base,
    ...value,
    setupComplete:Boolean(value.setupComplete),
    mode,
    companyName:String(value.companyName || '').trim(),
    carrierName:String(value.carrierName || '').trim(),
    truckNumber:String(value.truckNumber || '').trim(),
    trailerNumber:String(value.trailerNumber || '').trim(),
    fleetSize:Math.max(1, Math.round(Number(value.fleetSize || 1))),
    driverSharePercent,
    carrierSharePercent,
    percentageBasis:['linehaul','linehaul_fsc','total_gross'].includes(value.percentageBasis) ? value.percentageBasis : 'linehaul_fsc',
    modules,
    createdAt:value.createdAt || null,
    updatedAt:Number(value.updatedAt || 0),
  };
}

export function readOperatorProfile() {
  if (typeof window === 'undefined' || !window.localStorage) return emptyOperatorProfile();
  try {
    const raw = window.localStorage.getItem(OPERATOR_PROFILE_KEY);
    return raw ? normalizeOperatorProfile(JSON.parse(raw)) : emptyOperatorProfile();
  } catch {
    return emptyOperatorProfile();
  }
}

export function writeOperatorProfile(value = {}) {
  const current = readOperatorProfile();
  const now = Date.now();
  const next = normalizeOperatorProfile({
    ...current,
    ...value,
    createdAt:value.createdAt || current.createdAt || new Date(now).toISOString(),
    updatedAt:now,
  });
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(OPERATOR_PROFILE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(OPERATOR_PROFILE_EVENT, { detail:next }));
  }
  return next;
}

export function resetOperatorProfile() {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(OPERATOR_PROFILE_KEY);
    const next = emptyOperatorProfile();
    window.dispatchEvent(new CustomEvent(OPERATOR_PROFILE_EVENT, { detail:next }));
    return next;
  }
  return emptyOperatorProfile();
}

export function moduleEnabled(profile = {}, moduleId = '') {
  const normalized = normalizeOperatorProfile(profile);
  return normalized.modules.includes(moduleId);
}

export function modeLabel(mode = '') {
  return OPERATOR_MODES.find(item => item.id === mode)?.title || 'Owner-operator';
}

export function primaryNavigationForProfile(profile = {}) {
  const p = normalizeOperatorProfile(profile);
  if (p.modules.includes('logbook')) return ['home','logbook','drive','loads','more'];
  if (p.mode === 'leased_on') return ['home','loads','settlements','wallet','more'];
  return ['home','loads','money','wallet','more'];
}
