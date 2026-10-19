// Audit preparation is a scoped review of evidence, never a legal certification.
export const AUDIT_VERSION = 1;
export const RULESET = '2026-10-19.1';
export const AREAS = { ifta: 'IFTA', safety: 'Safety', irp: 'IRP' };
export const PROFILE_KEY = 'auditEvidenceProfileV1';
export const REVIEWS_KEY = 'auditEvidenceReviewsV1';
export const SOURCES = {
  iftaRecords: { label: 'IFTA 2026 Procedures Manual · P510–P560', url: 'https://www.iftach.org/manuals/2026/PM/Procedures%20Manual%20-%2001-05-26.pdf' },
  iftaReturns: { label: 'IFTA 2026 Articles · R820, R930, R960', url: 'https://www.iftach.org/manuals/2026/AA/Articles%20of%20Agreement%20-%2003-11-2026.pdf' },
  iftaIL: { label: 'Illinois IFTA record requirements · September 2026', url: 'https://tax.illinois.gov/content/dam/soi/en/web/tax/forms/excise/documents/mft/mfut-53-rr.pdf' },
  logs: { label: '49 CFR 395.8 and 395.11 · duty records and support', url: 'https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-395/subpart-A/section-395.8', related: 'https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-395/subpart-A/section-395.11' },
  defects: { label: '49 CFR 396.11 · defects and repair certification', url: 'https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-396/section-396.11' },
  maintenance: { label: '49 CFR 396.3 · maintenance records', url: 'https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-396/section-396.3' },
  inspection: { label: '49 CFR 396.17 and 396.21 · periodic inspection', url: 'https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-396/section-396.17', related: 'https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-396/section-396.21' },
  qualification: { label: '49 CFR 391.51 · driver qualification file', url: 'https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-391/subpart-F/section-391.51' },
  mvr: { label: '49 CFR 391.25 · annual driving record review', url: 'https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-391/subpart-C/section-391.25' },
  clearinghouse: { label: '49 CFR 382.701 and 382.703 · queries and consent', url: 'https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-382/subpart-G/section-382.701', related: 'https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-382/subpart-G/section-382.703' },
  drugProgram: { label: '49 CFR 382.401 · controlled substance and alcohol records', url: 'https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-382/subpart-D/section-382.401' },
  accidents: { label: '49 CFR 390.15 · accident register', url: 'https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-390/subpart-B/section-390.15' },
  irpNJ: { label: 'New Jersey MVC · IRP carrier guide', url: 'https://www.nj.gov/mvc/pdf/business/IRP_Carrier_Guide.pdf', related: 'https://www.nj.gov/mvc/business/irpfaqnew.htm' },
  irpIL: { label: 'Illinois Secretary of State · 2026 IRP manual', url: 'https://www.ilsos.gov/content/dam/publications/pdf_publications/cft_irp25.pdf' },
  insuranceNJ: { label: 'New Jersey MVC · IRP insurance evidence', url: 'https://www.nj.gov/mvc/business/irp.htm' },
};

export const REQUIREMENTS = [
  { id: 'ifta-distance', area: 'ifta', title: 'Actual distance and jurisdiction records', cadence: 'weekly', entity: 'vehicle', categories: ['logs', 'other', 'bol', 'pod'], add: 'other', source: 'iftaRecords', retention: 'At least 4 years from the later return due date or filing date; retain longer for audit holds or waivers.', detail: 'Review all actual travel, including empty, deadhead and bobtail miles. RateCon miles are estimates. Electronic tracking records need the required raw, usable data export.', questions: ['Vehicle, dates, origins, destinations and routes agree with the source.', 'All actual miles, odometer continuity, jurisdiction totals and gaps were reconciled.', 'If tracking data is used, raw data is retained with required time, location, unit and odometer fields; capture interval was checked.'] },
  { id: 'ifta-fuel', area: 'ifta', title: 'Fuel purchases and tax-paid evidence', cadence: 'weekly', entity: 'vehicle', categories: ['fuel', 'other'], add: 'fuel', source: 'iftaRecords', retention: 'At least 4 years from the later return due date or filing date; retain longer if required.', detail: 'Reconcile purchases to receipts or a fuel-card statement. A state does not need a receipt merely because the truck traveled there. Keep reefer fuel and DEF separate from propulsion fuel.', questions: ['All purchases, quantities, fuel types and vehicle attribution were reconciled.', 'Date, seller name/address, purchaser, unit and price or total are supported.', 'Tax-paid credit is backed by valid evidence; reefer fuel and DEF are separated.'] },
  { id: 'ifta-return', area: 'ifta', title: 'Quarterly return and payment confirmation', cadence: 'quarterly', entity: 'company', categories: ['other', 'permit'], add: 'other', source: 'iftaReturns', retention: 'Retain return workpapers and supporting records for the applicable IFTA period and any hold.', detail: 'Use the actual filed return for this quarter, including a zero-operation return when required. A saved draft or a payment alone does not show filing. Due-date adjustments depend on the base jurisdiction.', questions: ['The filed return is for this company, base jurisdiction and quarter, covering all relevant vehicles.', 'Miles, fuel and adjustments reconcile to the quarter workpapers.', 'Submission confirmation and payment, or no-payment amount due, were checked.'] },
  { id: 'ifta-license', area: 'ifta', title: 'License and decal year', cadence: 'annual', entity: 'vehicle', categories: ['permit', 'registration'], wallet: ['ifta_license'], add: 'permit', source: 'iftaReturns', retention: 'Keep license and vehicle/decal evidence with the supporting record set.', detail: 'Confirm the license year, carrier, qualified vehicle and base jurisdiction. The issue date alone does not establish current validity.', questions: ['Carrier and base jurisdiction match the confirmed profile.', 'License/decal year and applicable vehicle are correct.', 'The validity dates were checked against the source.'] },
  { id: 'safety-logs', area: 'safety', title: 'Duty records and supporting evidence', cadence: 'weekly', entity: 'driver', categories: ['logs', 'bol', 'pod', 'fuel', 'tolls', 'other'], add: 'other', source: 'logs', retention: 'Duty records and required supporting documents: at least 6 months. Driver carries the required prior 7 days.', detail: 'Review the selected driver and complete week, including certification, explanations and supporting times/locations. This review does not alter logs or dismiss violations.', questions: ['Required days and all duty statuses were reviewed for the selected driver.', 'Certification, edits and any HOS exceptions or violations were reviewed in the logbook.', 'Available supporting documents agree with driver, date, time and location.'] },
  { id: 'safety-defects', area: 'safety', title: 'Defects and repair follow-up', cadence: 'weekly', entity: 'vehicle', categories: ['inspection', 'repair', 'other'], add: 'inspection', source: 'defects', retention: 'Required DVIRs and repair certifications: 3 months.', detail: 'A no-defect report is not universally required for property carriers. Confirm applicability and whether any reportable defect occurred; record the reason when this check is not applicable.', questions: ['Reportable defects for this unit and week were checked.', 'Required reports and repair certifications are present.', 'Unresolved safety defects and return-to-service decisions were reviewed.'] },
  { id: 'safety-maintenance', area: 'safety', title: 'Maintenance and repair records', cadence: 'weekly', entity: 'vehicle', categories: ['repair', 'inspection', 'other'], add: 'repair', source: 'maintenance', retention: 'Records for 1 year while under carrier control and 6 months after the vehicle leaves control.', detail: 'Check completed work, scheduled work and unresolved items. If there was no applicable maintenance event, record that finding with its reason.', questions: ['Vehicle identity, service dates and work performed are supported.', 'Required maintenance intervals and next due work were checked.', 'Open repairs and safety-related follow-up were reviewed.'] },
  { id: 'safety-inspection', area: 'safety', title: 'Periodic inspection for this unit', cadence: 'expiry', entity: 'vehicle', categories: ['inspection'], wallet: ['truck_annual_inspection', 'trailer_annual_inspection'], add: 'inspection', source: 'inspection', maxMonths: 12, retention: 'Periodic inspection report: 14 months.', detail: 'Each tractor and trailer needs its own applicable inspection evidence. A truck report does not cover a different trailer.', questions: ['VIN/unit matches the selected vehicle.', 'The inspection, required components and qualified inspector were checked.', 'Inspection date and next due date were verified against the 12-month requirement.'] },
  { id: 'safety-qualification', area: 'safety', title: 'Driver qualification and medical status', cadence: 'expiry', entity: 'driver', categories: ['driver', 'other'], wallet: ['driver_license', 'medical_certificate', 'medical_waiver_spe'], add: 'driver', source: 'qualification', retention: 'DQ file: employment plus 3 years; certain recurring MVR/medical records have their own 3-year period.', detail: 'Confirm license, qualification file and current medical status. The appropriate CDLIS driving record may establish medical status; a separate paper medical certificate is not always the right proof.', questions: ['The driver and applicable license, qualification and medical requirements were checked.', 'Current license/medical status and any restriction, waiver or SPE are supported.', 'Validity ends at the earliest relevant expiration; required file records are retained.'] },
  { id: 'safety-mvr', area: 'safety', title: 'Annual motor vehicle record review', cadence: 'rolling', entity: 'driver', categories: ['driver', 'other'], add: 'driver', source: 'mvr', maxMonths: 12, retention: 'Keep annual MVR and documented reviews for the required 3-year period.', detail: 'An MVR file alone does not show that the carrier completed and documented the annual review.', questions: ['The correct driver and required licensing jurisdictions were checked.', 'The carrier review is documented with review date and reviewer.', 'The next annual review due date was verified.'] },
  { id: 'safety-clearinghouse', area: 'safety', title: 'Clearinghouse query and consent', cadence: 'rolling', entity: 'driver', categories: ['driver', 'other'], add: 'driver', source: 'clearinghouse', maxMonths: 12, conditional: 'cdl', retention: 'Limited-query consent: 3 years after the last query performed under that consent.', detail: 'Confirm CDL/Part 382 applicability. Annual and pre-employment query requirements differ; a limited-query result may require a full query within 24 hours.', questions: ['Applicable query type, driver consent and driver identity were checked.', 'The dated result and required follow-up are supported.', 'The next annual query date and any immediate follow-up were reviewed.'] },
  { id: 'safety-drug-program', area: 'safety', title: 'Drug and alcohol program records', cadence: 'ongoing', entity: 'company', categories: ['driver', 'other'], add: 'other', source: 'drugProgram', conditional: 'cdl', retention: 'Retention depends on the record: commonly 1, 2 or 5 years. Keep sensitive records with controlled access.', detail: 'Review applicable program records and obligations with the responsible person. A generic enrollment file does not establish completion of every testing obligation.', questions: ['Part 382 applicability and the company program were checked.', 'Required testing, follow-up and record retention were reviewed for this scope.', 'Evidence access is appropriate and unresolved program items are recorded.'] },
  { id: 'safety-accidents', area: 'safety', title: 'Accident register and required reports', cadence: 'weekly', entity: 'company', categories: ['other', 'inspection'], add: 'other', source: 'accidents', retention: 'Accident register and required copies: 3 years after the accident date.', detail: 'Check whether a recordable accident occurred. Record a reason for a no-applicable-event finding; absence of an uploaded file cannot establish that finding.', questions: ['Recordable events for this company and week were checked.', 'Required register details and report copies are supported.', 'Open follow-up and retention dates were reviewed.'] },
  { id: 'irp-distance', area: 'irp', title: 'Distance records for apportioned vehicles', cadence: 'weekly', entity: 'vehicle', categories: ['logs', 'other', 'bol', 'pod'], add: 'other', source: 'irpBase', retention: 'Use the confirmed base-jurisdiction retention period; do not delete records automatically.', detail: 'Keep actual trips and jurisdiction totals, including empty, deadhead and bobtail travel. The same source can support IFTA and IRP without copying its original.', questions: ['Unit, dates, route, odometer and actual jurisdiction miles are supported.', 'Loaded and empty travel, gaps and duplicate mileage were reconciled.', 'Base-jurisdiction source-record and retention requirements were reviewed.'] },
  { id: 'irp-reporting', area: 'irp', title: 'Registration reporting period and distance totals', cadence: 'registration', entity: 'company', categories: ['registration', 'other', 'permit'], add: 'registration', source: 'irpBase', retention: 'NJ guidance specifies 5-year retention; IL uses 3 years after registration expiration. Check the actual registration/reporting period and holds.', detail: 'Confirm the base jurisdiction, fleet and actual reporting period used for renewal. A registration year is not automatically a calendar year.', questions: ['The base, fleet, reporting period and renewal application match.', 'All applicable vehicles and jurisdiction totals reconcile to retained records.', 'Application/renewal confirmation and the base-specific retention rule were checked.'] },
  { id: 'irp-card', area: 'irp', title: 'Cab card and registration validity', cadence: 'expiry', entity: 'vehicle', categories: ['registration', 'permit'], wallet: ['irp_cab_card', 'truck_registration', 'trailer_registration'], add: 'registration', source: 'irpBase', retention: 'Keep the applicable cab card, registration and supporting records for the base-jurisdiction period.', detail: 'Confirm VIN, unit, plate, weights and jurisdictions. A prior-year cab card stays in history but does not establish current registration.', questions: ['VIN, plate and unit match the selected vehicle.', 'Base, fleet, weights and operating jurisdictions were checked.', 'Registration validity and any required trip permits were verified.'] },
  { id: 'irp-insurance', area: 'irp', title: 'Insurance evidence for the registration', cadence: 'expiry', entity: 'vehicle', categories: ['insurance'], wallet: ['insurance_card', 'mcs90_endorsement'], add: 'insurance', source: 'insuranceBase', retention: 'Keep applicable policy/COI evidence and prior versions with the registration record set.', detail: 'Verify the base-jurisdiction and operation-specific insurance requirement. NJ MVC lists $1.5 million liability evidence for NJ-apportioned vehicles. Do not apply that limit merely because a trip enters NJ.', questions: ['Carrier, vehicle, insurer, policy and covered operations were checked.', 'Required coverage and filing/COI evidence for the confirmed base were reviewed.', 'Effective and expiration dates, exclusions and unresolved questions were checked.'] },
];

export const text = value => String(value ?? '').trim();
const list = value => Array.isArray(value) ? value.filter(Boolean) : [];
export const canonical = value => JSON.stringify(sorted(value));
function sorted(value) { return Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value; }
export function day(value) { const v = text(value); if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return ''; const n = new Date(v + 'T12:00:00Z'); return Number.isFinite(n.getTime()) && n.toISOString().slice(0, 10) === v ? v : ''; }
export function addDays(value, count) { const d = new Date(day(value) + 'T12:00:00Z'); if (!Number.isFinite(d.getTime())) return ''; d.setUTCDate(d.getUTCDate() + count); return d.toISOString().slice(0, 10); }
export function addMonths(value, count) { const d = new Date(day(value) + 'T12:00:00Z'); if (!Number.isFinite(d.getTime())) return ''; const n = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + count); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(n, last)); return d.toISOString().slice(0, 10); }
export function todayInZone(zone, now = new Date()) { try { const p = new Intl.DateTimeFormat('en-US', { timeZone: zone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now); return ['year', 'month', 'day'].map(k => p.find(v => v.type === k).value).join('-'); } catch { return now.toISOString().slice(0, 10); } }
export const auditTimeZone = (state = {}) => state.homeTerminalTimeZone || state.homeTimezone || state.homeTerminalTimezone || 'UTC';
export function weekRange(value) { const v = day(value); if (!v) throw Error('Choose a valid week.'); const weekday = new Date(v + 'T12:00:00Z').getUTCDay(); const from = addDays(v, weekday === 0 ? -6 : 1 - weekday); return { from, to: addDays(from, 6) }; }
export function quarterRange(value) { const v = day(value); if (!v) throw Error('Choose a valid period.'); const year = Number(v.slice(0, 4)), q = Math.floor((Number(v.slice(5, 7)) - 1) / 3); const from = `${year}-${String(q * 3 + 1).padStart(2, '0')}-01`; return { id: `${year}-Q${q + 1}`, from, to: addDays(addMonths(from, 3), -1) }; }
export function quarterDue(period) { const next = addMonths(period.from, 4); let due = addDays(next, -1); while ([0, 6].includes(new Date(due + 'T12:00:00Z').getUTCDay())) due = addDays(due, 1); return due; }
export const emptyProfile = () => ({ version: 1, company: '', operations: 'unknown', jurisdictions: '', units: '', iftaApplies: 'unknown', iftaBase: '', irpApplies: 'unknown', irpBase: '', cdl: 'unknown', applicabilityNote: '', reference: '', confirmedBy: '', confirmedAt: '', effectiveFrom: '' });
export function normalizeAudit(business = {}) { const profile = business[PROFILE_KEY]; return { profile: profile?.version === 1 ? { ...emptyProfile(), ...profile } : emptyProfile(), reviews: list(business[REVIEWS_KEY]).filter(v => v.version === 1 && text(v.id)) }; }
export function profileFingerprint(profile) { const p = { ...emptyProfile(), ...profile }; return canonical(Object.fromEntries(['company', 'operations', 'jurisdictions', 'units', 'iftaApplies', 'iftaBase', 'irpApplies', 'irpBase', 'cdl', 'applicabilityNote', 'reference', 'effectiveFrom'].map(k => [k, p[k]]))); }
export function validateProfile(input, now = new Date().toISOString()) {
  const profile = emptyProfile();
  for (const key of Object.keys(profile)) if (!['version', 'confirmedAt'].includes(key)) profile[key] = text(input[key]).slice(0, ['applicabilityNote', 'reference'].includes(key) ? 2000 : 300);
  if (!profile.company || !profile.confirmedBy || !profile.reference) throw Error('Enter the company, reviewer and source/reference for this profile.');
  if (!['unknown', 'interstate_property', 'other'].includes(profile.operations)) throw Error('Choose an operating profile.');
  for (const key of ['iftaApplies', 'irpApplies']) if (!['unknown', 'required', 'not_applicable'].includes(profile[key])) throw Error('Choose applicability explicitly.');
  if (!['unknown', 'yes', 'no'].includes(profile.cdl)) throw Error('Confirm CDL/Part 382 applicability or leave it unconfirmed.');
  for (const key of ['iftaBase', 'irpBase']) { profile[key] = profile[key].toUpperCase(); if (profile[key] && !/^[A-Z]{2}$/.test(profile[key])) throw Error('Use a two-letter base-jurisdiction code.'); }
  if ([profile.iftaApplies, profile.irpApplies, profile.cdl].some(v => ['not_applicable', 'no'].includes(v)) && !profile.applicabilityNote) throw Error('Explain every not-applicable finding in the applicability notes.');
  if (!day(profile.effectiveFrom)) throw Error('Enter when this confirmed profile applies.');
  return { ...profile, confirmedAt: now, ruleSet: RULESET };
}
export function profileBlock(profile, area, week) {
  if (!profile.confirmedAt || !profile.company || !profile.confirmedBy || !profile.reference) return 'Confirm the company and applicability profile.';
  if (!profile.effectiveFrom || profile.effectiveFrom > week.from) return 'This profile does not cover the start of the selected week. Confirm the applicable historical profile.';
  if (profile.operations !== 'interstate_property') return 'The listed federal property-carrier rules need review for this operating profile.';
  if (!text(profile.jurisdictions) || !text(profile.units)) return 'Confirm operating jurisdictions and the vehicle/fleet scope.';
  if (area === 'ifta' || area === 'irp') {
    if (profile[area + 'Applies'] === 'unknown') return `Confirm whether ${AREAS[area]} applies.`;
    if (profile[area + 'Applies'] === 'required' && !profile[area + 'Base']) return `Confirm the ${AREAS[area]} base jurisdiction.`;
  }
  return '';
}
export function sourcesFor(requirement, profile) {
  let key = requirement.source;
  if (key === 'irpBase') key = profile.irpBase === 'NJ' ? 'irpNJ' : profile.irpBase === 'IL' ? 'irpIL' : '';
  if (key === 'insuranceBase') key = profile.irpBase === 'NJ' ? 'insuranceNJ' : profile.irpBase === 'IL' ? 'irpIL' : '';
  const sources = key && SOURCES[key] ? [{ id: key, ...SOURCES[key] }] : [];
  if (requirement.area === 'ifta' && profile.iftaBase === 'IL') sources.push({ id: 'iftaIL', ...SOURCES.iftaIL });
  return sources;
}
export function scopeFor(requirement, scope, profile) {
  const base = { company: text(profile.company), unit: '', driverId: '', loadNo: '' };
  if (requirement.entity === 'vehicle') base.unit = text(scope.unit).toUpperCase();
  if (requirement.entity === 'driver') { base.driverId = text(scope.driverId); base.unit = text(scope.unit).toUpperCase(); }
  if (requirement.cadence === 'weekly' && requirement.entity !== 'company') base.loadNo = text(scope.loadNo).toUpperCase();
  return base;
}
export function scopeLabel(scope, entity) { return [scope.company || 'Unconfirmed company', entity === 'company' ? 'all relevant vehicles/drivers' : '', scope.driverId ? `Driver ${scope.driverId}` : '', scope.unit ? `Unit ${scope.unit}` : '', scope.loadNo ? `Load ${scope.loadNo} only` : ''].filter(Boolean).join(' · '); }
function periodsFor(requirement, week) {
  if (requirement.cadence === 'weekly') return [{ id: 'week/' + week.from, ...week, assessment: week }];
  if (requirement.cadence === 'quarterly') return [...new Map([quarterRange(week.from), quarterRange(week.to)].map(p => [p.id, { ...p, assessment: p }])).values()];
  if (requirement.cadence === 'annual') return [...new Set([week.from.slice(0, 4), week.to.slice(0, 4)])].map(year => ({ id: 'year/' + year, from: year + '-01-01', to: year + '-12-31', assessment: { from: week.from < year + '-01-01' ? year + '-01-01' : week.from, to: week.to > year + '-12-31' ? year + '-12-31' : week.to } }));
  return [{ id: 'validity', from: week.from, to: week.to, assessment: week }];
}
export function reviewKey(requirement, period, scope) { return ['audit', requirement.id, period.id, canonical(scope)].join('/'); }
export function sourceHashes(row) { const d = row.source || {}; return [...new Set([d.sha256, d.sourceSha256, d.content_hash, d.contentHash].map(v => text(v).toLowerCase()).filter(Boolean))]; }
export function sourceRevision(row) { const d = row.source || {}; return canonical({ id: row.id, category: row.category, date: row.date, unit: row.unit, loadNo: row.loadNo, size: d.file_size_bytes || d.fileSizeBytes || '', hashes: sourceHashes(row), inactive: Boolean(d.deleted_at || d.trashedAt || d.is_deleted) }); }
export function eligibleRow(requirement, row, scope) {
  const d = row.source || {};
  if (d.deleted_at || d.trashedAt || d.is_deleted || !requirement.categories.includes(row.category)) return false;
  if (requirement.entity !== 'company') {
    if (scope.unit && text(row.unit) && text(row.unit).toUpperCase() !== scope.unit) return false;
    if (scope.driverId && row.kind === 'log' && text(d.driverId) !== scope.driverId) return false;
    if (scope.loadNo && text(row.loadNo) && text(row.loadNo).toUpperCase() !== scope.loadNo) return false;
  }
  if (row.kind === 'wallet' && requirement.wallet && !requirement.wallet.includes(row.id.replace(/^wallet\//, ''))) return false;
  return true;
}
function suggestedRow(requirement, row, period) { if (requirement.cadence !== 'weekly') return true; const date = day(row.date); if (!date) return true; const f = day(row.source?.coverageFrom || row.source?.dateFrom), t = day(row.source?.coverageThrough || row.source?.dateTo); return (date >= period.from && date <= period.to) || Boolean(f && t && f <= period.to && t >= period.from); }
export function sourceValidity(ref, row, proofs = {}) {
  if (!/^[a-f0-9]{64}$/.test(ref.sha256 || '')) return 'The saved review has no valid original content hash.';
  if (!row) return 'The linked source is no longer available in this workspace.';
  if (sourceRevision(row) !== ref.revision) return 'Source details changed; review this evidence again.';
  const hashes = sourceHashes(row), proof = proofs[row.id];
  if (row.kind === 'log' && proof?.rowSnapshot !== canonical(row.source)) return 'Check the original again to verify this saved review.';
  if (row.kind === 'wallet' && !hashes.length && proof?.rowSnapshot !== (row.source.attachmentDataUrl || row.source.dataUrl)) return 'Check the original again to verify this saved review.';
  if (hashes.some(hash => !/^[a-f0-9]{64}$/.test(hash) || hash !== ref.sha256)) return 'The original content hash changed or conflicts with this review.';
  if (proof?.revision === ref.revision && proof.error) return proof.error;
  if (proof?.revision === ref.revision && proof.sha256 !== ref.sha256) return 'The original bytes changed; review the source again.';
  if (row.kind === 'log' || !hashes.length) {
    if (!proof || proof.revision !== ref.revision) return 'Check the original again to verify this saved review.';
  }
  return '';
}
export function validateReview(requirement, input, instance, profile, refs, now = new Date().toISOString()) {
  const status = input.status || 'checked', note = text(input.note).slice(0, 3000), reviewer = text(input.reviewer).slice(0, 180);
  if (!['checked', 'not_applicable', 'needs_review'].includes(status)) throw Error('Choose a review result.');
  if (!reviewer) throw Error('Enter who reviewed this check.');
  if (!instance.scope.company || (requirement.entity === 'vehicle' && !instance.scope.unit) || (requirement.entity === 'driver' && !instance.scope.driverId)) throw Error('Choose the required company, vehicle or driver scope.');
  if (status !== 'checked' && !note) throw Error('Explain why the evidence needs review or is not applicable.');
  const coverageFrom = day(input.coverageFrom), coverageThrough = day(input.coverageThrough);
  if (status === 'not_applicable' && (!coverageFrom || !coverageThrough || coverageFrom > coverageThrough)) throw Error('Enter the dates covered by this not-applicable finding.');
  if (status === 'checked') {
    const block = profileBlock(profile, requirement.area, instance.week); if (block) throw Error(block);
    if (!sourcesFor(requirement, profile).length) throw Error('Base-specific requirements have not been verified in this rule set. Save this as needs review.');
    if (requirement.conditional === 'cdl' && profile.cdl !== 'yes') throw Error('Confirm CDL/Part 382 applicability before checking this evidence.');
    if (!refs.length || refs.some(ref => !/^[a-f0-9]{64}$/.test(ref.sha256))) throw Error('Choose and verify original evidence. A filing label alone is not proof.');
    if (!coverageFrom || !coverageThrough || coverageFrom > coverageThrough) throw Error('Enter the actual evidence coverage or validity dates.');
    if (['weekly', 'quarterly'].includes(requirement.cadence) && (coverageFrom > instance.period.from || coverageThrough < instance.period.to)) throw Error('The confirmed evidence must cover the entire selected period.');
    if (requirement.maxMonths && coverageThrough > addMonths(coverageFrom, requirement.maxMonths)) throw Error(`The confirmed period exceeds this check’s ${requirement.maxMonths}-month interval.`);
    if (requirement.cadence === 'quarterly' && instance.period.to >= now.slice(0, 10)) throw Error('The quarter has not ended. Keep the return in preparation.');
    if (requirement.questions.some((_, i) => input.confirmations?.[i] !== true)) throw Error('Check each evidence question or save the unresolved items as needs review.');
  }
  return { version: AUDIT_VERSION, id: instance.id, requirement: requirement.id, ruleSet: RULESET, period: { id: instance.period.id, from: instance.period.from, to: instance.period.to }, scope: { ...instance.scope }, profileFingerprint: profileFingerprint(profile), status, note, reviewer, reviewedAt: now, coverageFrom, coverageThrough, confirmations: requirement.questions.map((_, i) => input.confirmations?.[i] === true), sourceRefs: refs, ruleSources: sourcesFor(requirement, profile) };
}
export const STATUS = { checked: 'Evidence checked', needs_review: 'Needs review', missing: 'Add evidence', not_applicable: 'Not applicable', unknown: 'Applicability unconfirmed', scope: 'Choose scope', stale: 'Review changed source', verify: 'Check original', expired: 'Expired', expiring: 'Expires during this week', coverage: 'Period not covered', not_due: 'Not due yet' };
export function buildAudit({ rows = [], business = {}, area = 'ifta', week: selectedWeek, scope = {}, today, proofs = {} } = {}) {
  const week = weekRange(selectedWeek || today || todayInZone('UTC')), assessmentDay = day(today) || week.from, { profile, reviews } = normalizeAudit(business), blocked = profileBlock(profile, area, week), byId = new Map(rows.map(row => [row.id, row]));
  const requirements = REQUIREMENTS.filter(r => r.area === area), items = [];
  for (const requirement of requirements) for (const period of periodsFor(requirement, week)) {
    const entity = scopeFor(requirement, scope, profile), id = reviewKey(requirement, period, entity), matches = reviews.filter(r => r.id === id), review = matches.length === 1 ? matches[0] : null;
    const eligible = rows.filter(row => eligibleRow(requirement, row, entity)), candidates = eligible.filter(row => suggestedRow(requirement, row, period));
    const item = { id, requirement, period, week, scope: entity, scopeLabel: scopeLabel(entity, requirement.entity), review, candidates, eligible, sources: sourcesFor(requirement, profile), status: candidates.length ? 'needs_review' : 'missing', reason: candidates.length ? 'Files are available. Confirm their content and coverage.' : 'No suggested source is available for this check.' };
    const update = (status, reason) => { item.status = status; item.reason = reason; };
    if (matches.length > 1) update('needs_review', 'Conflicting reviews share this scope. Resolve the account conflict before confirming.');
    else if (blocked) update('unknown', blocked);
    else if (['ifta', 'irp'].includes(area) && profile[area + 'Applies'] === 'not_applicable') update('not_applicable', profile.applicabilityNote);
    else if (requirement.conditional === 'cdl' && profile.cdl === 'no') update('not_applicable', profile.applicabilityNote);
    else if (requirement.conditional === 'cdl' && profile.cdl !== 'yes') update('unknown', 'Confirm CDL/Part 382 applicability.');
    else if (!item.sources.length) update('unknown', 'This base jurisdiction needs a source-specific rule review. The NJ and IL rules cannot be assumed to apply.');
    else if ((requirement.entity === 'vehicle' && !entity.unit) || (requirement.entity === 'driver' && !entity.driverId)) update('scope', 'Choose the vehicle or driver this evidence should cover.');
    else if (review) {
      if (review.ruleSet !== RULESET || review.profileFingerprint !== profileFingerprint(profile)) update('stale', 'The applicable profile or rule set changed. The prior review is retained in history.');
      else if (review.status === 'not_applicable') {
        if (!day(review.coverageFrom) || !day(review.coverageThrough) || review.coverageFrom > period.assessment.from || review.coverageThrough < period.assessment.to) update('coverage', 'The not-applicable finding does not cover this review period. Confirm its current applicability.');
        else update('not_applicable', review.note);
      }
      else if (review.status === 'needs_review') update('needs_review', review.note);
      else {
        const refs = list(review.sourceRefs), failures = refs.map(ref => ({ ref, reason: sourceValidity(ref, byId.get(ref.rowId), proofs) })).filter(v => v.reason);
        if (!refs.length || requirement.questions.some((_, i) => review.confirmations?.[i] !== true)) update('needs_review', 'This review is missing verified evidence or required confirmations.');
        else if (refs.some(ref => byId.has(ref.rowId) && !eligibleRow(requirement, byId.get(ref.rowId), entity))) update('stale', 'A linked source no longer matches this vehicle, driver, load or evidence category.');
        else if (failures.length) update(failures.some(v => !/Check the original again/.test(v.reason)) ? 'stale' : 'verify', failures[0].reason);
        else if (!day(review.coverageFrom) || !day(review.coverageThrough)) update('coverage', 'Confirm the source coverage or validity dates.');
        else if (review.coverageThrough < period.assessment.from) update('expired', `Evidence coverage ended ${review.coverageThrough}.`);
        else if (review.coverageFrom > period.assessment.from) update('coverage', `Evidence begins ${review.coverageFrom}, after this review period starts.`);
        else if (review.coverageThrough < period.assessment.to) update(requirement.cadence === 'weekly' || requirement.cadence === 'quarterly' ? 'coverage' : 'expiring', `Evidence coverage ends ${review.coverageThrough}; the period continues through ${period.assessment.to}.`);
        else if (requirement.maxMonths && review.coverageThrough > addMonths(review.coverageFrom, requirement.maxMonths)) update('needs_review', 'The recorded validity exceeds this requirement’s review interval.');
        else update('checked', `Reviewed by ${review.reviewer} on ${review.reviewedAt.slice(0, 10)}; covers ${review.coverageFrom} through ${review.coverageThrough}.`);
      }
    } else if (requirement.cadence === 'quarterly' && assessmentDay <= quarterDue(period)) update('not_due', `Prepare for the standard due date ${quarterDue(period)}; confirm base-jurisdiction holiday adjustments.`);
    items.push(item);
  }
  return { format: 'road_ready_audit_readiness_v1', ruleSet: RULESET, area, week, scope, profile, profileBlock: blocked, items, counts: { checked: items.filter(i => i.status === 'checked').length, attention: items.filter(i => !['checked', 'not_applicable', 'not_due'].includes(i.status)).length, notApplicable: items.filter(i => i.status === 'not_applicable').length, notDue: items.filter(i => i.status === 'not_due').length }, scopeNotice: 'Preparation checks for the listed period and scope. Evidence checked means the recorded content questions were confirmed against linked originals. It does not guarantee legal compliance or replace a regulator’s audit.' };
}
export function auditIndex(model, createdAt = new Date().toISOString()) { return { format: model.format, createdAt, ruleSet: model.ruleSet, area: model.area, week: model.week, selectedScope: model.scope, confirmedProfile: model.profile, counts: model.counts, scope: model.scopeNotice, checks: model.items.map(item => ({ id: item.id, requirement: item.requirement.id, title: item.requirement.title, cadence: item.requirement.cadence, period: item.period, scope: item.scope, status: item.status, reason: item.reason, retention: item.requirement.retention, sources: item.sources, review: item.review || null })) }; }
export function packetRowsFor(model) { const rows = new Map(); for (const item of model.items) for (const ref of item.review?.sourceRefs || []) { const row = item.eligible.find(v => v.id === ref.rowId); if (row) rows.set(row.id, row); } return [...rows.values()]; }
export function archiveAuditIndex(index, records, missing) {
  const byId = new Map(records.map(row => [row.id, row])), problems = new Map(missing.map(row => [row.id, row.reason]));
  const checks = (index.checks || []).map(check => {
    const archiveSourceIssues = (check.review?.sourceRefs || []).flatMap(ref => {
      const row = byId.get(ref.rowId), reason = problems.get(ref.rowId) || (!row ? 'Linked original is outside this packet or unavailable.' : row.auditSha256 && row.auditSha256 !== ref.sha256 ? 'Exported bytes differ from the reviewed original.' : '');
      return reason ? [{ rowId: ref.rowId, reason }] : [];
    });
    return { ...check, ...(archiveSourceIssues.length ? { archiveSourceIssues, status: check.status === 'checked' ? 'needs_review' : check.status, reason: check.status === 'checked' ? 'An original could not be verified against the saved review. See archiveSourceIssues.' : check.reason } : {}) };
  });
  return { ...index, checks, counts: { checked: checks.filter(c => c.status === 'checked').length, attention: checks.filter(c => !['checked', 'not_applicable', 'not_due'].includes(c.status)).length, notApplicable: checks.filter(c => c.status === 'not_applicable').length, notDue: checks.filter(c => c.status === 'not_due').length }, archiveVerification: { originalRecords: records.length, unavailableOriginals: missing } };
}

const withoutHistory = value => { const next = { ...value }; delete next.history; return next; };
export function updateProfileRecord(business, input, expected, now = new Date().toISOString()) {
  const current = normalizeAudit(business).profile;
  if (canonical(current) !== canonical(expected)) throw Error('The applicability profile changed on another view or device. Reopen it before saving.');
  const profile = validateProfile(input, now);
  const history = [...list(current.history), { at: now, action: 'profile_confirmed', before: withoutHistory(current), after: withoutHistory(profile) }];
  return { ...business, [PROFILE_KEY]: { ...profile, history }, updatedAt: Date.parse(now) };
}
export function updateReviewRecord(business, review, expected, expectedProfile) {
  const audit = normalizeAudit(business), matches = audit.reviews.filter(r => r.id === review.id), current = matches[0] || null;
  if (matches.length > 1 || canonical(current) !== canonical(expected || null)) throw Error('This review changed on another view or device. Reopen it before saving.');
  if (canonical(audit.profile) !== canonical(expectedProfile)) throw Error('The applicability profile changed while reviewing. Reopen this check.');
  const history = [...list(current?.history), { at: review.reviewedAt, action: 'evidence_reviewed', before: current ? withoutHistory(current) : null, after: withoutHistory(review) }];
  const next = { ...review, history }, reviews = audit.reviews.filter(r => r.id !== review.id);
  return { ...business, [REVIEWS_KEY]: [...reviews, next], updatedAt: Date.parse(review.reviewedAt) };
}
