import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '101.1.0';
const RELEASED_AT = '2026-07-16T00:25:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v101.1 missing ${label}`);
  return content.replace(before, after);
}
function appendOnce(content, marker, addition) {
  return content.includes(marker) ? content : `${content.trimEnd()}\n\n${addition.trim()}\n`;
}

const parserPath = 'source/src/modules/scan/rateConfirmationParserV102.js';
let parser = read(parserPath);
if (!parser.includes('function parseBrokerContactV111')) {
  const anchor = `function routeSummary(stops = []) {`;
  const helper = `function parseBrokerContactV111(value = '') {
  const sourceLines = String(value || '').split(/\\r?\\n/).map(clean).filter(Boolean);
  const labelPattern = /\\b(Dispatcher|Dispatch Contact|Dispatch|Agent|Broker Contact|Broker Rep|Contact)\\b\\s*:?\\s*(.*)$/i;
  for (let index = 0; index < sourceLines.length; index += 1) {
    const row = sourceLines[index];
    const labeled = row.match(labelPattern);
    if (!labeled) continue;
    const block = sourceLines.slice(index, index + 4).join(' | ');
    const role = /dispatch/i.test(labeled[1]) ? 'Dispatcher' : (/agent|rep/i.test(labeled[1]) ? 'Broker agent' : 'Broker contact');
    const rawName = clean(labeled[2] || '')
      .replace(/\\b(?:Phone|Tel|Cell|Mobile|Email|E-mail)\\b[\\s\\S]*$/i, '')
      .replace(/^Name\\s*:\\s*/i, '');
    const phone = first(block, [
      /(?:Phone|Tel|Cell|Mobile)\\s*[:#-]?\\s*(\\+?1?[0-9() .-]{7,24})/i,
      /\\b(\\+?1?\\s*\\(?\\d{3}\\)?[ .-]\\d{3}[ .-]\\d{4})\\b/,
    ]);
    const email = first(block, [/(?:Email|E-mail)\\s*[:#-]?\\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,})/i, /\\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,})\\b/i]);
    if (phone || email) return { name:rawName, role, phone, email, source:'labeled_rate_confirmation_contact' };
  }
  const phone = first(value, [
    /(?:Agent|Dispatcher|Dispatch|Broker Contact)[\\s\\S]{0,180}?(?:Phone|Tel|Cell|Mobile)\\s*[:#-]?\\s*(\\+?1?[0-9() .-]{7,24})/i,
  ]);
  const email = first(value, [
    /(?:Agent|Dispatcher|Dispatch|Broker Contact)[\\s\\S]{0,240}?(?:Email|E-mail)\\s*[:#-]?\\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,})/i,
  ]);
  return { name:'', role:'Broker contact', phone, email, source:phone || email ? 'context_rate_confirmation_contact' : '' };
}

${anchor}`;
  parser = replaceOnce(parser, anchor, helper, 'Rate Con contact parser');
}
parser = replaceOnce(
  parser,
  `  const brokerPhone = first(source, [/(?:Agent[\\s\\S]{0,160}?)Phone\\s*:\\s*([0-9() .-]{7,24})/i]);\n  const brokerEmail = first(source, [/\\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,})\\b/i]);`,
  `  const brokerContactV111 = parseBrokerContactV111(source);\n  const brokerPhone = brokerContactV111.phone || first(source, [/(?:Agent[\\s\\S]{0,160}?)Phone\\s*:\\s*([0-9() .-]{7,24})/i]);\n  const brokerEmail = brokerContactV111.email || '';\n  const billingEmail = first(source, [/\\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,})\\b/i]);\n  const brokerContactName = brokerContactV111.name || '';\n  const dispatchPhone = brokerContactV111.phone || '';\n  const dispatchEmail = brokerContactV111.email || '';\n  const brokerContacts = (brokerPhone || brokerEmail) ? [{ id:'primary_dispatch', name:brokerContactName, role:brokerContactV111.role || 'Broker contact', phone:brokerPhone, email:brokerEmail, broker, source:brokerContactV111.source || 'rate_confirmation' }] : [];`,
  'Rate Con contact fields'
);
parser = replaceOnce(
  parser,
  `    broker,\n    brokerPhone,\n    brokerEmail,`,
  `    broker,\n    brokerContactName,\n    dispatcherName:brokerContactName,\n    brokerPhone,\n    brokerEmail,\n    dispatchPhone,\n    dispatchEmail,\n    billingEmail,\n    brokerContacts,`,
  'Rate Con contact return'
);
write(parserPath, parser);

const scanPath = 'source/src/modules/scan/SmartScanSheetV100.jsx';
let scan = read(scanPath);
scan = replaceOnce(
  scan,
  `    broker:f.broker || '',\n    merchant:f.merchant || '',`,
  `    broker:f.broker || '',\n    brokerContactName:f.brokerContactName || f.dispatcherName || '',\n    brokerPhone:f.dispatchPhone || f.brokerPhone || '',\n    brokerEmail:f.dispatchEmail || f.brokerEmail || '',\n    billingEmail:f.billingEmail || '',\n    brokerContacts:Array.isArray(f.brokerContacts) ? f.brokerContacts : [],\n    merchant:f.merchant || '',`,
  'scanner contact initial fields'
);
scan = replaceOnce(
  scan,
  `            <Field label="Broker" wide><input value={fields.broker || ''} onChange={event => updateField('broker', event.target.value)} placeholder="Broker or customer"/></Field>\n            <Field label="Leg #"><input value={fields.legNo || ''} onChange={event => updateField('legNo', event.target.value.toUpperCase())} placeholder="Optional"/></Field>`,
  `            <Field label="Broker" wide><input value={fields.broker || ''} onChange={event => updateField('broker', event.target.value)} placeholder="Broker or customer"/></Field>\n            <Field label="Dispatch / agent"><input value={fields.brokerContactName || ''} onChange={event => updateField('brokerContactName', event.target.value)} placeholder="Contact name"/></Field>\n            <Field label="SMS / WhatsApp"><input type="tel" value={fields.brokerPhone || ''} onChange={event => updateField('brokerPhone', event.target.value)} placeholder="Phone from Rate Con"/></Field>\n            <Field label="Dispatch email" wide><input type="email" value={fields.brokerEmail || ''} onChange={event => updateField('brokerEmail', event.target.value)} placeholder="Email from Rate Con"/></Field>\n            <div className="smart-rate-contact-note-v111">Used for ready-to-send pickup check-in drafts. Road Ready never sends a message without the driver's final tap.</div>\n            <Field label="Leg #"><input value={fields.legNo || ''} onChange={event => updateField('legNo', event.target.value.toUpperCase())} placeholder="Optional"/></Field>`,
  'scanner contact review fields'
);
scan = scan.replace(
  `broker:String(fields.broker || '').trim(), carrierName:String(fields.carrierName || '').trim(),`,
  `broker:String(fields.broker || '').trim(), brokerContactName:String(fields.brokerContactName || '').trim(), brokerPhone:String(fields.brokerPhone || '').trim(), brokerEmail:String(fields.brokerEmail || '').trim(), billingEmail:String(fields.billingEmail || '').trim(), brokerContacts:Array.isArray(fields.brokerContacts) ? fields.brokerContacts : [], carrierName:String(fields.carrierName || '').trim(),`
);
write(scanPath, scan);

const guidePath = 'source/src/modules/loads/loadGuideV103.js';
let guide = read(guidePath);
guide = replaceOnce(
  guide,
  `    broker:text(fields.broker),\n    carrierName:text(fields.carrierName),`,
  `    broker:text(fields.broker),\n    brokerContactName:text(fields.brokerContactName || fields.dispatcherName),\n    brokerPhone:text(fields.dispatchPhone || fields.brokerPhone),\n    brokerEmail:text(fields.dispatchEmail || fields.brokerEmail),\n    billingEmail:text(fields.billingEmail),\n    brokerContacts:Array.isArray(fields.brokerContacts) ? fields.brokerContacts : [],\n    carrierName:text(fields.carrierName),`,
  'guide contact fields'
);
guide = replaceOnce(
  guide,
  `    broker:mergedGuide.broker || state.loadInfo?.broker || '',\n    carrierName:mergedGuide.carrierName || state.loadInfo?.carrierName || '',`,
  `    broker:mergedGuide.broker || state.loadInfo?.broker || '',\n    brokerContactName:mergedGuide.brokerContactName || state.loadInfo?.brokerContactName || '',\n    dispatcherName:mergedGuide.brokerContactName || state.loadInfo?.dispatcherName || '',\n    brokerPhone:mergedGuide.brokerPhone || state.loadInfo?.brokerPhone || '',\n    brokerEmail:mergedGuide.brokerEmail || state.loadInfo?.brokerEmail || '',\n    dispatchPhone:mergedGuide.brokerPhone || state.loadInfo?.dispatchPhone || '',\n    dispatchEmail:mergedGuide.brokerEmail || state.loadInfo?.dispatchEmail || '',\n    billingEmail:mergedGuide.billingEmail || state.loadInfo?.billingEmail || '',\n    brokerContacts:mergedGuide.brokerContacts?.length ? mergedGuide.brokerContacts : (state.loadInfo?.brokerContacts || []),\n    carrierName:mergedGuide.carrierName || state.loadInfo?.carrierName || '',`,
  'loadInfo contact fields'
);
write(guidePath, guide);

const statusPath = 'source/src/modules/status/StatusWorkflowSheet.jsx';
let status = read(statusPath);
if (!status.includes("from '../loads/loadContactV111.js'")) {
  status = replaceOnce(
    status,
    `import { getAccurateGpsLocation } from '../../core/gps/locationService.js';`,
    `import { getAccurateGpsLocation } from '../../core/gps/locationService.js';\nimport { buildDispatchMessageV111, dispatchAuditV111, dispatchChannelsV111, dispatchSubjectV111, openDispatchComposerV111, preferredLoadContactV111 } from '../loads/loadContactV111.js';`,
    'status contact import'
  );
}
status = replaceOnce(
  status,
  `  const [notes, setNotes] = useState('');\n  const [showNotes, setShowNotes] = useState(false);`,
  `  const [notes, setNotes] = useState('');\n  const [showNotes, setShowNotes] = useState(false);\n  const initialDispatchContactV111 = preferredLoadContactV111(state) || {};\n  const [notifyNameV111, setNotifyNameV111] = useState(initialDispatchContactV111.name || '');\n  const [notifyPhoneV111, setNotifyPhoneV111] = useState(initialDispatchContactV111.phone || '');\n  const [notifyEmailV111, setNotifyEmailV111] = useState(initialDispatchContactV111.email || '');\n  const initialNotifyChannelsV111 = dispatchChannelsV111(initialDispatchContactV111);\n  const [notifyChannelV111, setNotifyChannelV111] = useState(initialNotifyChannelsV111[0] || '');\n  const [notifyAfterSaveV111, setNotifyAfterSaveV111] = useState(initialNotifyChannelsV111.length > 0);\n  const [notifyMessageV111, setNotifyMessageV111] = useState('');`,
  'status notification state'
);
status = replaceOnce(
  status,
  `      locationSource: gpsFix ? 'gps' : 'manual',\n    };`,
  `      locationSource: gpsFix ? 'gps' : 'manual',\n      ...(loadReasonKind(status, selectedReasons) === 'pickup' ? {\n        brokerContactName:notifyNameV111.trim(),\n        brokerPhone:notifyPhoneV111.trim(),\n        brokerEmail:notifyEmailV111.trim(),\n      } : {}),\n    };`,
  'status contact payload'
);
status = replaceOnce(
  status,
  `    if (status === 'D') {\n      onStartDriving({ city:p.city, state:p.state, lat:p.lat, lng:p.lng, gpsAccuracy:p.gpsAccuracy, locationSource:p.locationSource });\n      return;\n    }\n    onApplyStatus(p);`,
  `    if (status === 'D') {\n      onStartDriving({ city:p.city, state:p.state, lat:p.lat, lng:p.lng, gpsAccuracy:p.gpsAccuracy, locationSource:p.locationSource });\n      return;\n    }\n    let dispatchComposerV111 = null;\n    const pickupNotifyV111 = loadReasonKind(status, selectedReasons) === 'pickup';\n    if (pickupNotifyV111 && notifyAfterSaveV111) {\n      const contactV111 = { name:notifyNameV111.trim(), role:'Dispatcher', phone:notifyPhoneV111.trim(), email:notifyEmailV111.trim(), broker:String(state.loadInfo?.broker || '').trim() };\n      const channelsV111 = dispatchChannelsV111(contactV111);\n      const channelV111 = channelsV111.includes(notifyChannelV111) ? notifyChannelV111 : (channelsV111[0] || '');\n      if (channelV111) {\n        const messageV111 = notifyMessageV111.trim() || buildDispatchMessageV111({ state, payload:p, contact:contactV111 });\n        const subjectV111 = dispatchSubjectV111(state, p);\n        p.dispatchNotification = dispatchAuditV111({ channel:channelV111, contact:contactV111, message:messageV111, subject:subjectV111, loadNo:p.loadNo || p.shippingDocs || state.loadInfo?.loadNo || '' });\n        dispatchComposerV111 = { channel:channelV111, contact:contactV111, message:messageV111, subject:subjectV111 };\n      }\n    }\n    onApplyStatus(p);\n    if (dispatchComposerV111 && typeof window !== 'undefined') {\n      window.setTimeout(() => openDispatchComposerV111(dispatchComposerV111), 80);\n    }`,
  'status save notification composer'
);
status = replaceOnce(
  status,
  `  const equipmentDropSelected = dropHookSelected || dropOffSelected || hookEmptySelected;\n  const currentEquipmentText = [state.equipment?.container, state.equipment?.chassis].filter(Boolean).join(' / ') || state.currentTrailer || 'No equipment set';`,
  `  const equipmentDropSelected = dropHookSelected || dropOffSelected || hookEmptySelected;\n  const pickupNotifySelectedV111 = loadReasonKind(status, selectedReasons) === 'pickup';\n  const notifyContactV111 = { name:notifyNameV111, role:'Dispatcher', phone:notifyPhoneV111, email:notifyEmailV111, broker:state.loadInfo?.broker || '' };\n  const notifyChannelsAvailableV111 = dispatchChannelsV111(notifyContactV111);\n  const notifyPayloadPreviewV111 = payload();\n  const notifyAutoMessageV111 = buildDispatchMessageV111({ state, payload:notifyPayloadPreviewV111, contact:notifyContactV111 });\n  const notifyMessageValueV111 = notifyMessageV111 || notifyAutoMessageV111;\n  const currentEquipmentText = [state.equipment?.container, state.equipment?.chassis].filter(Boolean).join(' / ') || state.currentTrailer || 'No equipment set';`,
  'status notification derived state'
);
status = replaceOnce(
  status,
  `        <section className="picker-section">\n          <div className="picker-label-row">\n            <label>{leavingDriving ? 'Stop location' : 'Location'}</label>`,
  `        {pickupNotifySelectedV111 && (\n          <section className="picker-section dispatch-notify-v111">\n            <div className="picker-label-row">\n              <label>Notify broker / dispatch</label>\n              <span>contact from Rate Con</span>\n            </div>\n            <div className="dispatch-contact-summary-v111">\n              <span>↗</span>\n              <div><b>{notifyNameV111 || state.loadInfo?.broker || 'Broker / dispatch'}</b><em>{notifyPhoneV111 || notifyEmailV111 || 'Add a phone or email below'}</em></div>\n            </div>\n            <div className="dispatch-channel-chips-v111">\n              {notifyChannelsAvailableV111.map(channel => (\n                <button key={channel} type="button" className={notifyChannelV111 === channel ? 'picked' : ''} onClick={() => setNotifyChannelV111(channel)}>\n                  {channel === 'sms' ? 'SMS' : channel === 'whatsapp' ? 'WhatsApp' : 'Email'}\n                </button>\n              ))}\n            </div>\n            <div className="dispatch-contact-fields-v111">\n              <input value={notifyNameV111} onChange={event => setNotifyNameV111(event.target.value)} placeholder="Dispatcher / agent name" autoComplete="off"/>\n              <input type="tel" value={notifyPhoneV111} onChange={event => { setNotifyPhoneV111(event.target.value); if (!notifyChannelV111) setNotifyChannelV111('sms'); }} placeholder="Phone for SMS / WhatsApp" autoComplete="tel"/>\n              <input type="email" value={notifyEmailV111} onChange={event => { setNotifyEmailV111(event.target.value); if (!notifyChannelV111) setNotifyChannelV111('email'); }} placeholder="Dispatch email" autoComplete="email"/>\n            </div>\n            <label className="dispatch-after-save-v111">\n              <input type="checkbox" checked={notifyAfterSaveV111} onChange={event => setNotifyAfterSaveV111(event.target.checked)}/>\n              <span><b>Open check-in draft after Save ON</b><em>Road Ready fills the message. You review it and tap Send in Messages, WhatsApp, or Mail.</em></span>\n            </label>\n            <textarea className="dispatch-message-v111" value={notifyMessageValueV111} onChange={event => setNotifyMessageV111(event.target.value)} placeholder="Pickup check-in message"/>\n            <small className="dispatch-safety-v111">Nothing is sent automatically. The duty-status event saves first, then your selected messaging app opens a draft.</small>\n          </section>\n        )}\n\n        <section className="picker-section">\n          <div className="picker-label-row">\n            <label>{leavingDriving ? 'Stop location' : 'Location'}</label>`,
  'status notification UI'
);
write(statusPath, status);

const appPath = 'source/src/app/App.jsx';
let app = read(appPath);
if (!app.includes('lastDispatchNotification:payload.dispatchNotification')) {
  app = replaceOnce(
    app,
    `    if (deliveryLike) {\n      if (destination.city || destination.state) {`,
    `    if (payload.brokerContactName) patch.brokerContactName = String(payload.brokerContactName).trim();\n    if (payload.brokerPhone) { patch.brokerPhone = String(payload.brokerPhone).trim(); patch.dispatchPhone = String(payload.brokerPhone).trim(); }\n    if (payload.brokerEmail) { patch.brokerEmail = String(payload.brokerEmail).trim(); patch.dispatchEmail = String(payload.brokerEmail).trim(); }\n    if (payload.dispatchNotification) patch.lastDispatchNotification = payload.dispatchNotification;\n    if (deliveryLike) {\n      if (destination.city || destination.state) {`,
    'App contact persistence'
  );
}
write(appPath, app);

const stylesPath = 'source/src/styles.css';
let styles = read(stylesPath);
styles = appendOnce(styles, '/* v101.1 dispatch check-in */', `
/* v101.1 dispatch check-in */
.smart-rate-contact-note-v111{grid-column:1/-1;margin:-2px 0 4px;padding:9px 11px;border-radius:12px;background:#eef6ff;color:#526785;font-size:10px;font-weight:800;line-height:1.35;}
.dispatch-notify-v111{border:1px solid #b9d4ff!important;background:linear-gradient(145deg,#f5f9ff 0%,#fff 72%)!important;box-shadow:0 8px 24px rgba(37,99,235,.07);}
.dispatch-contact-summary-v111{display:flex;align-items:center;gap:10px;padding:11px 12px;border:1px solid #dbe8fb;border-radius:15px;background:#fff;}
.dispatch-contact-summary-v111>span{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:#e8f0ff;color:#2456d3;font-size:19px;font-weight:1000;}
.dispatch-contact-summary-v111 div,.dispatch-contact-summary-v111 b,.dispatch-contact-summary-v111 em{display:block;min-width:0;}
.dispatch-contact-summary-v111 b{color:#14213d;font-size:14px;font-weight:1000;}
.dispatch-contact-summary-v111 em{margin-top:2px;color:#64748b;font-size:11px;font-style:normal;font-weight:800;overflow-wrap:anywhere;}
.dispatch-channel-chips-v111{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;}
.dispatch-channel-chips-v111 button{min-height:38px;padding:0 15px;border:1px solid #c9d7ec;border-radius:999px;background:#fff;color:#40516e;font-size:12px;font-weight:1000;}
.dispatch-channel-chips-v111 button.picked{border-color:#2456d3;background:#2456d3;color:#fff;box-shadow:0 7px 15px rgba(37,86,211,.2);}
.dispatch-contact-fields-v111{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;}
.dispatch-contact-fields-v111 input{min-width:0;height:44px;padding:0 12px;border:1px solid #d6e0ef;border-radius:13px;background:#fff;color:#15213b;font-size:12px;font-weight:800;}
.dispatch-contact-fields-v111 input:first-child,.dispatch-contact-fields-v111 input:last-child{grid-column:1/-1;}
.dispatch-after-save-v111{display:flex;align-items:flex-start;gap:10px;margin-top:10px;padding:11px;border:1px solid #cfe0fb;border-radius:14px;background:#eef5ff;}
.dispatch-after-save-v111 input{width:19px;height:19px;margin:1px 0 0;accent-color:#2456d3;}
.dispatch-after-save-v111 span,.dispatch-after-save-v111 b,.dispatch-after-save-v111 em{display:block;}
.dispatch-after-save-v111 b{color:#18366c;font-size:12px;font-weight:1000;}
.dispatch-after-save-v111 em{margin-top:3px;color:#64748b;font-size:10px;font-style:normal;font-weight:750;line-height:1.35;}
.dispatch-message-v111{width:100%;min-height:92px;margin-top:10px;padding:11px 12px;border:1px solid #d6e0ef;border-radius:14px;background:#fff;color:#17233e;font-size:12px;font-weight:750;line-height:1.45;resize:vertical;}
.dispatch-safety-v111{display:block;margin-top:7px;color:#66758e;font-size:9px;font-weight:800;line-height:1.4;}
@media(max-width:520px){.dispatch-contact-fields-v111{grid-template-columns:1fr}.dispatch-contact-fields-v111 input{grid-column:1/-1}}
`);
write(stylesPath, styles);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v101.1-ratecon-dispatch-checkin',
  releasedAt:RELEASED_AT,
  notes:[
    'Extracts broker or dispatcher name, phone and email from labeled Rate Confirmation contact blocks and keeps those fields with the active load.',
    'Shows SMS, WhatsApp and Email check-in chips when ON DUTY Pickup / Loading is selected.',
    'Builds a load-aware pickup check-in message with facility, city/state, load number, pickup number, driver, carrier, truck and home-terminal time.',
    'Saves the duty-status event before opening a ready-to-send message draft; Road Ready never sends a message without the driver tapping Send.',
    'Stores the requested communication channel and message with the exact pickup event for an internal audit trail.'
  ],
  label:'v101.1 Rate Con Dispatch Check-in',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const verifyParser = read(parserPath);
const verifyScan = read(scanPath);
const verifyGuide = read(guidePath);
const verifyStatus = read(statusPath);
const verifyApp = read(appPath);
if (!verifyParser.includes('parseBrokerContactV111') || !verifyParser.includes('brokerContacts')) throw new Error('v101.1 Rate Con contact extraction failed');
if (!verifyScan.includes('Dispatch / agent') || !verifyScan.includes('brokerContactName')) throw new Error('v101.1 scanner contact review failed');
if (!verifyGuide.includes('dispatchPhone') || !verifyGuide.includes('brokerContacts')) throw new Error('v101.1 load contact persistence failed');
if (!verifyStatus.includes('Notify broker / dispatch') || !verifyStatus.includes('openDispatchComposerV111')) throw new Error('v101.1 status notification UI failed');
if (!verifyApp.includes('lastDispatchNotification:payload.dispatchNotification')) throw new Error('v101.1 notification audit persistence failed');
console.log('v101.1 Rate Con Dispatch Check-in materialized');
await import('./verify-dispatch-notify-v111.mjs');
