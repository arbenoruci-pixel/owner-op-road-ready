import { formatDay } from './financials.js';

export const instructionsSlot = 'carrier_document:road-document-instructions';

const evidence = {
  registration: 'Include the unit or VIN, plate, and registration dates.',
  insurance: 'Include the insured carrier, covered equipment or coverage description, and policy dates.',
  inspection: 'Include the unit or VIN, inspection date, and inspection result.',
  license: 'Include the driver name, license class, and expiration date.',
  medical: 'Include the driver name and certification dates on the requested proof.',
  permit: 'Include the permit holder, applicable vehicle or route, and validity dates.',
};

// Inputs are the active checklist and verified road files for one operator.
export function reviewDocuments(docs, requirements, today) {
  const groups = new Map();
  for (const doc of docs) {
    if (!doc.is_ready) continue;
    if (!groups.has(doc.slot_key)) groups.set(doc.slot_key, []);
    groups.get(doc.slot_key).push(doc);
  }
  const required = new Map(requirements.map((item) => [item.slot_key, item]));
  const slots = new Set([...required.keys(), ...groups.keys()]);
  return [...slots].map((key) => {
    const requirement = required.get(key);
    const versions = groups.get(key) || [];
    const doc = versions.find((file) => file.is_current);
    const title = requirement?.title || doc?.title || versions[0].title;
    let status = 'On file';
    let action = '';
    if (!doc) {
      status = 'Missing current document';
      action = 'Send a current, legible copy.';
    } else if (doc.expires_on && doc.expires_on < today) {
      status = 'Expired ' + formatDay(doc.expires_on);
      action = 'Send the renewed document.';
    } else if (doc.issued_on && doc.issued_on > today) {
      status = 'Future issue date · ' + formatDay(doc.issued_on);
      action = 'Send the copy covering today or ask dispatch to check the issue date.';
    } else if (!doc.expires_on && requirement?.expiry_required) {
      status = 'Expiry needs verification';
      action = 'Send the page showing the expiration date.';
    } else if (doc.expires_on) {
      status = doc.expires_on === today ? 'Expires today' : 'Expires ' + formatDay(doc.expires_on);
    }
    const detail = evidence[doc?.category || key.split(':')[0]];
    if (action && detail) action += ' ' + detail;
    return { key, title, required: Boolean(requirement), doc, versions, status, action };
  });
}

export function walletAttention(item, today, expiryLimit) {
  if (!item.doc || (item.doc.expires_on && item.doc.expires_on < today)) return 'urgent';
  if (item.action) return 'warn';
  return item.doc?.expires_on && item.doc.expires_on <= expiryLimit ? 'warn' : '';
}
