function text(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizePhoneV111(value = '') {
  const raw = text(value);
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (raw.startsWith('+') && digits.length >= 8) return `+${digits}`;
  return digits.length >= 7 ? digits : '';
}

export function normalizeEmailV111(value = '') {
  const email = text(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function contactRole(value = '') {
  const role = text(value);
  if (/dispatch/i.test(role)) return 'Dispatcher';
  if (/agent|rep/i.test(role)) return 'Broker agent';
  return role || 'Broker contact';
}

function normalizeContact(value = {}, fallback = {}) {
  if (!value || typeof value !== 'object') return null;
  const phone = normalizePhoneV111(value.phone || value.mobile || value.cell || value.sms || fallback.phone);
  const email = normalizeEmailV111(value.email || fallback.email);
  if (!phone && !email) return null;
  return {
    id:text(value.id) || `${phone || email}`,
    name:text(value.name || value.contactName || value.dispatcherName || value.agentName || fallback.name),
    role:contactRole(value.role || fallback.role),
    phone,
    email,
    broker:text(value.broker || fallback.broker),
    source:text(value.source || fallback.source || 'rate_confirmation'),
  };
}

function guideFromState(state = {}) {
  const exact = state.loadGuidesById?.[state.activeLoadGuideId];
  if (exact) return exact;
  const loadNo = text(state.loadInfo?.loadNo || state.loadInfo?.orderNo || state.loadInfo?.shippingDocs).toUpperCase();
  const guides = Object.values(state.loadGuidesById || {}).filter(Boolean);
  return guides.find(guide => text(guide.loadNo || guide.orderNo).toUpperCase() === loadNo)
    || guides.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0]
    || null;
}

function directContact(source = {}, fallback = {}) {
  if (!source || typeof source !== 'object') return null;
  const dispatchNamed = source.dispatcherName || source.dispatchContactName || source.dispatchPhone || source.dispatchEmail;
  return normalizeContact({
    name:source.dispatcherName || source.dispatchContactName || source.brokerContactName || source.agentName || source.contactName,
    role:dispatchNamed ? 'Dispatcher' : (source.agentName ? 'Broker agent' : 'Broker contact'),
    phone:source.dispatchPhone || source.dispatcherPhone || source.brokerPhone || source.contactPhone,
    email:source.dispatchEmail || source.dispatcherEmail || source.brokerEmail || source.contactEmail,
    broker:source.broker,
    source:source.contactSource || source.source || fallback.source,
  }, fallback);
}

export function loadContactCandidatesV111(stateOrFields = {}) {
  const state = stateOrFields || {};
  const guide = guideFromState(state);
  const sources = [state.loadInfo, guide, state.activeLoad, state.fields, state].filter(Boolean);
  const contacts = [];

  for (const source of sources) {
    const fallback = { broker:text(source.broker || state.loadInfo?.broker || guide?.broker), source:'rate_confirmation' };
    const lists = [source.brokerContacts, source.dispatchContacts, source.contacts];
    for (const list of lists) {
      const rows = Array.isArray(list) ? list : (list && typeof list === 'object' ? Object.values(list) : []);
      rows.forEach(row => {
        const contact = normalizeContact(row, fallback);
        if (contact) contacts.push(contact);
      });
    }
    const direct = directContact(source, fallback);
    if (direct) contacts.push(direct);
  }

  const seen = new Set();
  return contacts
    .filter(contact => {
      const key = `${contact.phone}|${contact.email}`;
      if (!key || key === '|' || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const score = contact => (/dispatch/i.test(contact.role) ? 30 : /agent/i.test(contact.role) ? 20 : 10)
        + (contact.phone ? 4 : 0) + (contact.email ? 2 : 0) + (contact.name ? 1 : 0);
      return score(b) - score(a);
    });
}

export function preferredLoadContactV111(stateOrFields = {}) {
  return loadContactCandidatesV111(stateOrFields)[0] || null;
}

export function dispatchChannelsV111(contact = {}) {
  const channels = [];
  if (normalizePhoneV111(contact.phone)) channels.push('sms', 'whatsapp');
  if (normalizeEmailV111(contact.email)) channels.push('email');
  return channels;
}

function pickupStopFromState(state = {}) {
  const guide = guideFromState(state);
  return (guide?.stops || state.loadInfo?.stops || []).find?.(stop => stop?.type === 'pickup') || null;
}

function displayTime(state = {}, now = new Date()) {
  const timeZone = text(state.homeTerminalTimeZone || state.settings?.homeTerminalTimeZone || 'America/New_York');
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour:'numeric',
      minute:'2-digit',
      timeZoneName:'short',
    }).format(now);
  } catch {
    return now.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
  }
}

export function buildDispatchMessageV111({ state = {}, payload = {}, contact = {}, now = new Date() } = {}) {
  const load = state.loadInfo || {};
  const guide = guideFromState(state) || {};
  const pickup = pickupStopFromState(state) || {};
  const loadNo = text(payload.loadNo || payload.shippingDocs || load.loadNo || load.orderNo || guide.loadNo || guide.orderNo);
  const pickupNumber = text(load.pickupNumber || guide.pickupNumber || pickup.pickupNumber);
  const place = [text(payload.city || state.currentLocation?.city || pickup.city), text(payload.state || state.currentLocation?.state || pickup.state).toUpperCase()].filter(Boolean).join(', ');
  const facility = text(pickup.company || load.pickupCompany);
  const driverName = text(state.driverProfile?.name || state.driverName || 'Driver');
  const carrier = text(state.carrierName || state.driverProfile?.carrierName || load.carrierName || guide.carrierName);
  const truck = text(state.driver?.truck || state.truck || load.truck);
  const firstName = text(contact.name).split(/\s+/)[0];
  const greeting = firstName ? `Hi ${firstName},` : 'Hello,';
  const identity = carrier ? `${driverName} with ${carrier}` : driverName;
  const locationText = facility && place ? `${facility} in ${place}` : (facility || place || 'the pickup');
  const reference = loadNo ? ` for Load ${loadNo}` : '';
  const pickupRef = pickupNumber ? `, Pickup #${pickupNumber}` : '';
  const truckRef = truck ? ` Truck ${truck}.` : '';
  return `${greeting} this is ${identity}. I am checking in at ${locationText}${reference}${pickupRef} at ${displayTime(state, now)}.${truckRef}`.replace(/\s+/g, ' ').trim();
}

export function dispatchSubjectV111(state = {}, payload = {}) {
  const load = state.loadInfo || {};
  const guide = guideFromState(state) || {};
  const loadNo = text(payload.loadNo || payload.shippingDocs || load.loadNo || load.orderNo || guide.loadNo || guide.orderNo);
  return loadNo ? `Pickup check-in · Load ${loadNo}` : 'Pickup check-in';
}

function isiOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function dispatchHrefV111(channel = '', contact = {}, message = '', subject = '') {
  const phone = normalizePhoneV111(contact.phone);
  const email = normalizeEmailV111(contact.email);
  const body = encodeURIComponent(text(message));
  const cleanSubject = encodeURIComponent(text(subject || 'Pickup check-in'));
  if (channel === 'sms' && phone) return `sms:${phone}${isiOS() ? '&' : '?'}body=${body}`;
  if (channel === 'whatsapp' && phone) return `https://wa.me/${phone.replace(/\D/g, '')}?text=${body}`;
  if (channel === 'email' && email) return `mailto:${email}?subject=${cleanSubject}&body=${body}`;
  return '';
}

export function openDispatchComposerV111({ channel = '', contact = {}, message = '', subject = '' } = {}) {
  const href = dispatchHrefV111(channel, contact, message, subject);
  if (!href || typeof window === 'undefined') return { ok:false, channel, reason:'missing_contact' };
  try {
    window.location.assign(href);
    return { ok:true, channel, href };
  } catch (error) {
    return { ok:false, channel, reason:text(error?.message || error || 'open_failed') };
  }
}

export function dispatchAuditV111({ channel = '', contact = {}, message = '', subject = '', loadNo = '' } = {}) {
  return {
    type:'pickup_check_in',
    channel:text(channel),
    contactName:text(contact.name),
    contactRole:contactRole(contact.role),
    phone:normalizePhoneV111(contact.phone),
    email:normalizeEmailV111(contact.email),
    broker:text(contact.broker),
    loadNo:text(loadNo),
    subject:text(subject),
    message:text(message),
    status:'composer_requested',
    requestedAt:Date.now(),
    sentByDriverConfirmation:true,
    source:'rate_confirmation_contact_v111',
  };
}
