import fs from 'node:fs';
import assert from 'node:assert/strict';

function replaceExact(source, before, after, label) {
  if (source.includes(after)) return source;
  assert.ok(source.includes(before), `110.2.8 DOT email anchor missing: ${label}`);
  return source.replace(before, after);
}

const dotPath='source/src/modules/dot/DotMode.jsx';
let source=fs.readFileSync(dotPath,'utf8');
source=replaceExact(source,
`import { eventHasNoLoadDeclaration } from '../../core/routes/shippingDocsRepair.js';`,
`import { eventHasNoLoadDeclaration } from '../../core/routes/shippingDocsRepair.js';\nimport { backupLocalData, cloudApi } from '../../../../lib/owner-op-cloud/client.js';`,
'cloud share import');

source=replaceExact(source,
`function driverEmail(state) {\n  return state.driverProfile?.email || state.driver?.email || DEFAULT_DRIVER_EMAIL;\n}`,
`function driverEmail(state) {\n  return state.driverProfile?.email || state.driver?.email || DEFAULT_DRIVER_EMAIL;\n}\n\nfunction validOfficerEmailV11028(value = '') {\n  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/i.test(String(value || '').trim());\n}\n\nfunction officerEmailBodyV11028(state, days, shareUrl, expiresAt) {\n  const expires = expiresAt ? new Date(expiresAt).toLocaleString() : 'in about 4 hours';\n  return [\n    emailSummary(state, days, ''),\n    '',\n    'Secure Road Ready inspection link:',\n    shareUrl,\n    '',\n    'This link contains the current 24-hour period and previous 7 consecutive log days plus the selected roadside wallet documents.',\n    'Link expires: ' + expires,\n    '',\n    'Road Ready manual RODS share. This is not an FMCSA eRODS transfer.'\n  ].join('\\n');\n}`,
'email helper');

source=replaceExact(source,
`  const [officerEmail, setOfficerEmail] = useState('');\n  const [routingCode, setRoutingCode] = useState('');`,
`  const [officerEmail, setOfficerEmail] = useState('');\n  const [routingCode, setRoutingCode] = useState('');\n  const [officerEmailBusyV11028, setOfficerEmailBusyV11028] = useState(false);\n  const [secureOfficerShareV11028, setSecureOfficerShareV11028] = useState(null);`,
'email state');

source=replaceExact(source,
`  function emailOfficer() {\n    const to = officerEmail.trim();\n    const subject = encodeURIComponent(\`DOT Inspection Logs - \${carrierName(state)} - \${unitName(state)}\`);\n    const body = encodeURIComponent(emailSummary(state, days, routingCode.trim()));\n    window.location.href = \`mailto:\${encodeURIComponent(to)}?subject=\${subject}&body=\${body}\`;\n  }`,
`  async function emailOfficer() {\n    const to = officerEmail.trim();\n    if (!validOfficerEmailV11028(to)) {\n      setStatus('Enter the officer email address first.');\n      return;\n    }\n    if (typeof navigator !== 'undefined' && navigator.onLine === false) {\n      setStatus('Internet is required to create the secure officer link. Use Share DOT HTML Package if needed.');\n      return;\n    }\n\n    setOfficerEmailBusyV11028(true);\n    setStatus('Preparing the current 8-day roadside package…');\n    try {\n      const sync = await backupLocalData({\n        maxUploads:80,\n        bootstrap:true,\n        onlyDays:days,\n        onProgress:message => setStatus(message),\n      });\n      if (sync?.busy) throw new Error('Cloud backup is already running. Try again when it finishes.');\n      if (sync?.remaining) throw new Error('Some roadside records are still waiting to upload.');\n      if (sync?.errors?.length) throw new Error(sync.errors.join(' · '));\n\n      const walletKeys = Object.keys(state.dotWallet?.documents || {});\n      const share = await cloudApi({ action:'create_share', wallet_keys:walletKeys });\n      const shareUrl = \`\${window.location.origin}/inspection#\${share.token}\`;\n      const subject = \`DOT Inspection Logs - \${carrierName(state)} - \${unitName(state)}\`;\n      const body = officerEmailBodyV11028(state, days, shareUrl, share.expires_at);\n      const mailto = \`mailto:\${encodeURIComponent(to)}?subject=\${encodeURIComponent(subject)}&body=\${encodeURIComponent(body)}\`;\n      setSecureOfficerShareV11028({ ...share, url:shareUrl, mailto, email:to });\n      setStatus(\`Secure officer link ready for \${to}. It expires in about 4 hours.\`);\n      window.location.href = mailto;\n    } catch (error) {\n      setStatus(\`Could not prepare officer email: \${error?.message || 'Unknown error'}. Local records were not changed.\`);\n    } finally {\n      setOfficerEmailBusyV11028(false);\n    }\n  }`,
'email share action');

source=replaceExact(source,
`            <h2>Send DOT HTML package</h2>\n            <p>Share one self-contained HTML file. The officer can open saved documents and review today plus the previous 7 log days inside the same package.</p>\n            <input value={officerEmail} onChange={e => setOfficerEmail(e.target.value)} placeholder="Officer email (optional)" />\n            <input value={routingCode} onChange={e => setRoutingCode(e.target.value)} placeholder="Routing / reference code (if provided)" />`,
`            <h2>Email logs to officer</h2>\n            <p>The officer can enter an email address. Road Ready creates a private 8-day inspection link and opens an email already addressed to that officer.</p>\n            <input type="email" autoComplete="email" inputMode="email" value={officerEmail} onChange={e => setOfficerEmail(e.target.value)} placeholder="Officer email" aria-label="Officer email" />`,
'home email card');

source=replaceExact(source,
`              <button className="primary dot-html-share-primary" onClick={shareReportFile}>Share DOT HTML Package</button>`,
`              <button className="primary dot-html-share-primary" disabled={officerEmailBusyV11028 || !validOfficerEmailV11028(officerEmail)} onClick={emailOfficer}>{officerEmailBusyV11028 ? 'Preparing secure link…' : 'Email Logs to Officer'}</button>`,
'primary email action');

source=replaceExact(source,
`              <button onClick={emailOfficer}>Email Short Summary</button>`,
`              <button onClick={shareReportFile}>Share DOT HTML Package</button>`,
'local fallback share');

source=replaceExact(source,
`              <button onClick={copyShortSummary}>Copy Email Text</button>\n            </div>`,
`              <button onClick={copyShortSummary}>Copy Email Text</button>\n            </div>\n            {secureOfficerShareV11028 ? <div className="dot-officer-email-ready-v11028"><b>Secure link ready</b><span>{secureOfficerShareV11028.log_count || 0}/8 cloud log dates · expires {new Date(secureOfficerShareV11028.expires_at).toLocaleString()}</span><div><a href={secureOfficerShareV11028.mailto}>Open email again</a><button type="button" onClick={() => navigator.clipboard?.writeText(secureOfficerShareV11028.url).then(() => setStatus('Secure officer link copied.')).catch(() => setStatus('Select and copy the secure link manually.'))}>Copy secure link</button></div></div> : null}\n            <small className="dot-officer-email-note-v11028">Road Ready email share · Manual RODS · private 4-hour inspection link · not FMCSA eRODS.</small>`,
'email fallback controls');

source=replaceExact(source,
`          <div className="dot-officer-head">\n            <div>\n              <b>Roadside Package</b>\n              <span>Logs + saved documents</span>\n            </div>\n            <button onClick={() => setStage('report')}>Report</button>\n          </div>`,
`          <div className="dot-officer-head">\n            <div>\n              <b>Roadside Package</b>\n              <span>Logs + saved documents</span>\n            </div>\n            <button onClick={() => setStage('report')}>Report</button>\n          </div>\n          <section className="dot-officer-email-v11028" aria-label="Email roadside package">\n            <div><b>Email this package</b><span>Officer enters email · secure link expires in about 4 hours</span></div>\n            <div className="dot-officer-email-row-v11028">\n              <input type="email" autoComplete="email" inputMode="email" value={officerEmail} onChange={e => setOfficerEmail(e.target.value)} placeholder="Officer email" aria-label="Officer email in officer view" />\n              <button type="button" disabled={officerEmailBusyV11028 || !validOfficerEmailV11028(officerEmail)} onClick={emailOfficer}>{officerEmailBusyV11028 ? 'Preparing…' : 'Email logs'}</button>\n            </div>\n            <small>Road Ready manual RODS share · not FMCSA eRODS.</small>\n          </section>`,
'officer view email entry');

fs.writeFileSync(dotPath,source);

const cssPath='source/src/styles.css';
let css=fs.readFileSync(cssPath,'utf8');
if(!css.includes('DOT_OFFICER_EMAIL_V11028')) css += `
/* DOT_OFFICER_EMAIL_V11028 */
.dot-officer-email-v11028{margin:10px 12px;padding:12px;border:1px solid #d8e1ee;border-radius:16px;background:#fff;display:grid;gap:9px;box-shadow:0 2px 8px rgba(20,32,51,.04)}
.dot-officer-email-v11028>div:first-child{display:grid;gap:2px}.dot-officer-email-v11028 b{font-size:15px;color:#172033}.dot-officer-email-v11028 span,.dot-officer-email-v11028 small{font-size:11.5px;color:#68758a;font-weight:700;line-height:1.3}
.dot-officer-email-row-v11028{display:grid;grid-template-columns:minmax(0,1fr) 92px;gap:8px}.dot-officer-email-row-v11028 input,.dot-mode-card input[aria-label="Officer email"]{min-width:0;min-height:44px;border:1px solid #cbd5e1;border-radius:12px;padding:0 11px;font-size:16px;background:#fff;color:#172033;-webkit-text-fill-color:#172033}
.dot-officer-email-row-v11028 button{min-height:44px;border:0;border-radius:12px;background:#215fd5;color:#fff;font-weight:900}.dot-officer-email-row-v11028 button:disabled,.dot-html-share-primary:disabled{opacity:.46}
.dot-officer-email-ready-v11028{margin-top:9px;padding:10px;border-radius:13px;background:#eef8f3;border:1px solid #c8e7d7;display:grid;gap:4px}.dot-officer-email-ready-v11028>b{font-size:13px}.dot-officer-email-ready-v11028>span{font-size:11.5px;color:#4b685a}.dot-officer-email-ready-v11028>div{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}.dot-officer-email-ready-v11028 a,.dot-officer-email-ready-v11028 button{min-height:34px;border:0;border-radius:10px;background:#fff;color:#215fd5;padding:0 10px;display:inline-flex;align-items:center;font-size:12px;font-weight:900;text-decoration:none}
.dot-officer-email-note-v11028{display:block;margin-top:8px;color:#667085;font-size:11px;line-height:1.3}
`;
fs.writeFileSync(cssPath,css);

const VERSION='110.2.8',BUILD='v110208-officer-email-share';
for(const path of ['release-version.json','public/app-version.json']){
  const meta=JSON.parse(fs.readFileSync(path,'utf8'));
  Object.assign(meta,{version:VERSION,build:BUILD,force:false,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,label:'Fast Logbook + officer email share',notes:['DOT Inspection Mode lets the officer enter an email address and prepares a private eight-day inspection link.','The link is generated by the isolated Owner Operator cloud, expires in about four hours, and can be revoked from Private Cloud.','Road Ready labels this as manual RODS sharing and never presents it as an FMCSA eRODS transfer.']});
  fs.writeFileSync(path,JSON.stringify(meta,null,2)+'\n');
}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let s=fs.readFileSync(path,'utf8');
  s=s.replace(new RegExp(`(const ${name}_VERSION = )['\"][^'\"]+['\"]`),`$1'${VERSION}'`).replace(new RegExp(`(const ${name}_BUILD = )['\"][^'\"]+['\"]`),`$1'${BUILD}'`);
  fs.writeFileSync(path,s);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx']){
  let s=fs.readFileSync(path,'utf8');
  s=s.replace(/App v110\.2\.7/g,`App v${VERSION}`).replace(/APP V110\.2\.7/g,`APP V${VERSION}`);
  fs.writeFileSync(path,s);
}
const lockPath='module-locks.v1.json';
const locks=JSON.parse(fs.readFileSync(lockPath,'utf8'));locks.release=VERSION;fs.writeFileSync(lockPath,JSON.stringify(locks,null,2)+'\n');
console.log('PASS — 110.2.8 private officer email sharing finalized');
