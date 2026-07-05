// v95.57 DOT Digital Wallet helpers
// Smart paper-log mode: wallet stores local proof/expiry metadata and keeps
// roadside readiness simple. It does not replace state/FMCSA filings.

export const DOT_WALLET_VERSION = '95.57.0';

export const DOC_SECTIONS = [
  { id:'driver', title:'Driver', shortTitle:'Driver' },
  { id:'power_unit', title:'Truck / Power Unit', shortTitle:'Truck' },
  { id:'trailer', title:'Trailer', shortTitle:'Trailer' },
  { id:'carrier', title:'Carrier', shortTitle:'Carrier' },
  { id:'load', title:'Current Load', shortTitle:'Load' },
  { id:'supporting', title:'Supporting Docs', shortTitle:'Support' },
];

export const DOT_DOCUMENT_REQUIREMENTS = [
  {
    id:'driver_license',
    section:'driver',
    title:'CDL / Driver License',
    shortTitle:'CDL',
    required:'roadside',
    expirationRequired:true,
    fields:['number','state','expiresOn'],
    detail:'Driver license or CDL carried for roadside inspection.',
  },
  {
    id:'medical_certificate',
    section:'driver',
    title:'Medical Certificate',
    shortTitle:'Medical',
    required:'roadside',
    expirationRequired:true,
    fields:['expiresOn'],
    detail:'Medical Examiner Certificate, waiver, or SPE if applicable.',
  },
  {
    id:'medical_waiver_spe',
    section:'driver',
    title:'Waiver / SPE',
    shortTitle:'Waiver',
    required:'conditional',
    expirationRequired:true,
    fields:['expiresOn'],
    detail:'Only needed if the driver has a waiver or Skill Performance Evaluation certificate.',
  },
  {
    id:'truck_registration',
    section:'power_unit',
    title:'Truck Registration',
    shortTitle:'Truck reg',
    required:'roadside',
    expirationRequired:true,
    fields:['unit','plate','state','vin','expiresOn'],
    detail:'Registration for the truck or tractor.',
  },
  {
    id:'truck_annual_inspection',
    section:'power_unit',
    title:'Truck Annual Inspection',
    shortTitle:'Annual insp',
    required:'roadside',
    expirationRequired:true,
    fields:['unit','inspectionDate','expiresOn'],
    detail:'Periodic inspection document for the truck/power unit.',
  },
  {
    id:'trailer_registration',
    section:'trailer',
    title:'Trailer Registration',
    shortTitle:'Trailer reg',
    required:'roadside_if_used',
    expirationRequired:true,
    fields:['trailer','plate','state','vin','expiresOn'],
    detail:'Registration for trailer or chassis when used.',
  },
  {
    id:'trailer_annual_inspection',
    section:'trailer',
    title:'Trailer Annual Inspection',
    shortTitle:'Trailer insp',
    required:'roadside_if_used',
    expirationRequired:true,
    fields:['trailer','inspectionDate','expiresOn'],
    detail:'Periodic inspection document for trailer/chassis when operated.',
  },
  {
    id:'insurance_card',
    section:'carrier',
    title:'Insurance Card / Cab Card',
    shortTitle:'Insurance',
    required:'roadside',
    expirationRequired:true,
    fields:['policyNo','carrier','expiresOn'],
    detail:'Proof of active vehicle/liability insurance kept with the vehicle.',
  },
  {
    id:'mcs90_endorsement',
    section:'carrier',
    title:'MCS-90 Endorsement',
    shortTitle:'MCS-90',
    required:'carrier_file',
    expirationRequired:true,
    fields:['policyNo','expiresOn'],
    detail:'Financial responsibility endorsement or proof kept in company file; useful in wallet.',
  },
  {
    id:'operating_authority',
    section:'carrier',
    title:'Operating Authority / MC',
    shortTitle:'Authority',
    required:'carrier_file',
    expirationRequired:false,
    fields:['mcNumber','usdotNumber'],
    detail:'USDOT/MC authority info for carrier packet and roadside support.',
  },
  {
    id:'ucr_registration',
    section:'carrier',
    title:'UCR Registration',
    shortTitle:'UCR',
    required:'carrier_file',
    expirationRequired:true,
    fields:['year','expiresOn'],
    detail:'Current Unified Carrier Registration proof where applicable.',
  },
  {
    id:'ifta_license',
    section:'carrier',
    title:'IFTA License / Decal',
    shortTitle:'IFTA',
    required:'recommended',
    expirationRequired:true,
    fields:['year','expiresOn'],
    detail:'IFTA license/decal proof for interstate fuel tax operations.',
  },
  {
    id:'irp_cab_card',
    section:'power_unit',
    title:'IRP Cab Card',
    shortTitle:'IRP',
    required:'recommended',
    expirationRequired:true,
    fields:['unit','expiresOn'],
    detail:'Apportioned registration cab card for interstate vehicles.',
  },
  {
    id:'lease_agreement',
    section:'carrier',
    title:'Lease Agreement',
    shortTitle:'Lease',
    required:'conditional',
    expirationRequired:true,
    fields:['expiresOn'],
    detail:'Needed if the owner-operator is leased to a carrier.',
  },
  {
    id:'bol_shipping_papers',
    section:'load',
    title:'BOL / Shipping Papers',
    shortTitle:'BOL',
    required:'trip',
    expirationRequired:false,
    fields:['loadNo','bolNo'],
    detail:'Bill of lading or shipping papers for the active load. Route/load folder should also track this.',
  },
  {
    id:'fuel_receipts',
    section:'supporting',
    title:'Fuel Receipts',
    shortTitle:'Fuel receipts',
    required:'supporting_docs',
    expirationRequired:false,
    fields:['quarter'],
    detail:'Trip receipts/supporting documents available when requested.',
  },
];

export const REQUIRED_FILTERS = {
  all: 'All',
  roadside: 'Roadside',
  expiring: 'Expiring',
  missing: 'Missing',
};

const REQUIRED_ORDER = {
  roadside: 0,
  roadside_if_used: 1,
  trip: 2,
  carrier_file: 3,
  recommended: 4,
  supporting_docs: 5,
  conditional: 6,
};

export function emptyWallet() {
  return {
    version: DOT_WALLET_VERSION,
    documents: {},
    settings: {
      warningDays: 30,
      watchDays: 60,
      includeTrailerDocs: true,
      includeCarrierFileDocs: true,
      notifyOnHome: true,
    },
    reminders: {},
    lastReviewedAt: null,
  };
}

export function normalizeWallet(wallet = {}) {
  const base = emptyWallet();
  return {
    ...base,
    ...wallet,
    version: DOT_WALLET_VERSION,
    documents: wallet?.documents || {},
    settings: { ...base.settings, ...(wallet?.settings || {}) },
    reminders: wallet?.reminders || {},
  };
}

export function requirementById(id) {
  return DOT_DOCUMENT_REQUIREMENTS.find(req => req.id === id) || null;
}

export function requirementSort(a, b) {
  const sectionDelta = DOC_SECTIONS.findIndex(s => s.id === a.section) - DOC_SECTIONS.findIndex(s => s.id === b.section);
  if (sectionDelta) return sectionDelta;
  return (REQUIRED_ORDER[a.required] ?? 99) - (REQUIRED_ORDER[b.required] ?? 99);
}

export function todayDateOnly(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function parseDateOnly(value) {
  if (!value) return null;
  const parts = String(value).slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return null;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isoDate(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addMonths(date, months) {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

export function daysUntil(dateValue, now = new Date()) {
  const d = parseDateOnly(dateValue);
  if (!d) return null;
  const start = todayDateOnly(now);
  return Math.ceil((d.getTime() - start.getTime()) / 86400000);
}

export function derivedExpiresOn(requirement, doc = {}) {
  if (doc.expiresOn) return doc.expiresOn;
  if (/annual_inspection/.test(requirement?.id || '') && doc.inspectionDate) {
    return isoDate(addMonths(parseDateOnly(doc.inspectionDate) || todayDateOnly(), 12));
  }
  return '';
}

export function isRequirementActive(requirement, wallet = {}) {
  if (!requirement) return false;
  const settings = normalizeWallet(wallet).settings;
  if (requirement.required === 'conditional') return !!wallet.documents?.[requirement.id]?.enabled;
  if (requirement.required === 'roadside_if_used') return settings.includeTrailerDocs !== false;
  if (requirement.required === 'carrier_file') return settings.includeCarrierFileDocs !== false;
  return true;
}

export function hasAttachment(doc = {}) {
  return !!(doc.attachmentDataUrl || doc.fileName || doc.photoDataUrl);
}

export function hasCoreMetadata(requirement, doc = {}) {
  if (!doc || !doc.present) return false;
  if (requirement.expirationRequired && !derivedExpiresOn(requirement, doc)) return false;
  return true;
}

export function evaluateWalletDoc(requirement, wallet = {}, now = new Date()) {
  const normalized = normalizeWallet(wallet);
  const doc = normalized.documents?.[requirement.id] || {};
  const active = isRequirementActive(requirement, normalized);
  if (!active) {
    return { requirement, doc, active:false, status:'off', severity:'off', label:'Not used', days:null, expiresOn:'', missing:false };
  }

  const expiresOn = derivedExpiresOn(requirement, doc);
  const days = expiresOn ? daysUntil(expiresOn, now) : null;
  const missing = !hasCoreMetadata(requirement, doc);
  const requiredRoadside = ['roadside','roadside_if_used','trip'].includes(requirement.required);
  const requiredCarrier = requirement.required === 'carrier_file';

  if (missing) {
    const severity = requiredRoadside ? 'high' : (requiredCarrier ? 'review' : 'watch');
    return { requirement, doc, active:true, status:'missing', severity, label:'Missing', days, expiresOn, missing:true };
  }

  if (days != null && days < 0) {
    return { requirement, doc, active:true, status:'expired', severity: requiredRoadside ? 'high' : 'review', label:'Expired', days, expiresOn, missing:false };
  }
  if (days != null && days <= (normalized.settings.warningDays ?? 30)) {
    return { requirement, doc, active:true, status:'expires_soon', severity:'review', label:`Expires in ${days}d`, days, expiresOn, missing:false };
  }
  if (days != null && days <= (normalized.settings.watchDays ?? 60)) {
    return { requirement, doc, active:true, status:'watch', severity:'watch', label:`Watch ${days}d`, days, expiresOn, missing:false };
  }

  return { requirement, doc, active:true, status:'ok', severity:'ok', label:'OK', days, expiresOn, missing:false };
}

export function evaluateDotWallet(wallet = {}, now = new Date()) {
  const normalized = normalizeWallet(wallet);
  const rows = DOT_DOCUMENT_REQUIREMENTS
    .slice()
    .sort(requirementSort)
    .map(req => evaluateWalletDoc(req, normalized, now));

  const activeRows = rows.filter(row => row.active);
  const high = activeRows.filter(row => row.severity === 'high');
  const review = activeRows.filter(row => row.severity === 'review');
  const watch = activeRows.filter(row => row.severity === 'watch');
  const ok = activeRows.filter(row => row.severity === 'ok');
  const missing = activeRows.filter(row => row.status === 'missing');
  const expired = activeRows.filter(row => row.status === 'expired');
  const expiring = activeRows.filter(row => row.status === 'expires_soon' || row.status === 'watch');

  let status = 'ok';
  let title = 'DOT wallet ready';
  let detail = `${ok.length}/${activeRows.length} documents ready`;
  if (high.length) {
    status = 'high';
    title = 'DOT wallet needs attention';
    detail = `${high.length} high priority · ${missing.length} missing · ${expired.length} expired`;
  } else if (review.length) {
    status = 'review';
    title = 'DOT wallet review';
    detail = `${review.length} item(s) need review`;
  } else if (watch.length) {
    status = 'watch';
    title = 'DOT wallet watch';
    detail = `${watch.length} item(s) expire soon`;
  }

  return {
    wallet: normalized,
    rows,
    activeRows,
    counts: {
      total: activeRows.length,
      ok: ok.length,
      high: high.length,
      review: review.length,
      watch: watch.length,
      missing: missing.length,
      expired: expired.length,
      expiring: expiring.length,
    },
    status,
    title,
    detail,
  };
}

export function sectionSummary(rows = [], sectionId) {
  const sectionRows = rows.filter(row => row.active && row.requirement.section === sectionId);
  if (!sectionRows.length) return { status:'off', label:'Off', high:0, review:0, watch:0, ok:0, total:0 };
  const high = sectionRows.filter(r => r.severity === 'high').length;
  const review = sectionRows.filter(r => r.severity === 'review').length;
  const watch = sectionRows.filter(r => r.severity === 'watch').length;
  const ok = sectionRows.filter(r => r.severity === 'ok').length;
  const status = high ? 'high' : (review ? 'review' : (watch ? 'watch' : 'ok'));
  const label = high ? `${high} fix` : (review ? `${review} review` : (watch ? `${watch} watch` : 'OK'));
  return { status, label, high, review, watch, ok, total:sectionRows.length };
}

export function nextExpiringRows(rows = [], limit = 3) {
  return rows
    .filter(row => row.active && row.days != null && row.days >= 0 && row.severity !== 'ok')
    .sort((a, b) => a.days - b.days)
    .slice(0, limit);
}

export function walletCardLabel(summary) {
  if (!summary) return { title:'DOT Wallet', detail:'Add roadside documents', status:'review' };
  if (summary.status === 'high') return { title:'DOT wallet needs attention', detail:summary.detail, status:'high' };
  if (summary.status === 'review') return { title:'DOT wallet review', detail:summary.detail, status:'review' };
  if (summary.status === 'watch') return { title:'DOT wallet watch', detail:summary.detail, status:'watch' };
  return { title:'DOT wallet ready', detail:summary.detail, status:'ok' };
}
