import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '98.2.0';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, search, replacement, label) {
  if (content.includes(replacement)) return content;
  if (search instanceof RegExp) {
    if (!search.test(content)) throw new Error(`v98.2 missing ${label}`);
    return content.replace(search, replacement);
  }
  if (!content.includes(search)) throw new Error(`v98.2 missing ${label}`);
  return content.replace(search, replacement);
}

const homePath = 'source/src/modules/home/HomeScreen.jsx';
let home = read(homePath);

home = replaceOnce(
  home,
  "import OwnerOpBusinessScreen from '../business/OwnerOpBusinessScreen.jsx';\nimport { BUSINESS_STORE_EVENT, businessSummary, readBusinessStore } from '../business/businessStore.js';",
  "import OwnerOpBusinessScreen from '../business/OwnerOpBusinessScreen.jsx';\nimport SettlementCenter from '../business/SettlementCenter.jsx';\nimport MoneyTaxCenter from '../business/MoneyTaxCenter.jsx';\nimport OwnerOpSetupScreen from '../setup/OwnerOpSetupScreen.jsx';\nimport SmartScanSheet from '../scan/SmartScanSheet.jsx';\nimport { OPERATOR_PROFILE_EVENT, modeLabel, moduleEnabled, readOperatorProfile } from '../setup/operatorProfile.js';\nimport { BUSINESS_STORE_EVENT, businessSummary, readBusinessStore } from '../business/businessStore.js';",
  'Home imports'
);

home = replaceOnce(
  home,
  "  const [businessSection, setBusinessSection] = useState('');\n  const [showAllLogs, setShowAllLogs] = useState(false);",
  "  const [businessSection, setBusinessSection] = useState('');\n  const [showAllLogs, setShowAllLogs] = useState(false);\n  const [operatorProfile, setOperatorProfile] = useState(() => readOperatorProfile());\n  const [profileReady, setProfileReady] = useState(false);\n  const [setupOpen, setSetupOpen] = useState(false);\n  const [scanOpen, setScanOpen] = useState(false);\n\n  useEffect(() => {\n    const current = readOperatorProfile();\n    setOperatorProfile(current);\n    setSetupOpen(!current.setupComplete);\n    setProfileReady(true);\n    function refresh(event) {\n      const next = event?.detail || readOperatorProfile();\n      setOperatorProfile(next);\n      setProfileReady(true);\n    }\n    window.addEventListener(OPERATOR_PROFILE_EVENT, refresh);\n    window.addEventListener('storage', refresh);\n    return () => {\n      window.removeEventListener(OPERATOR_PROFILE_EVENT, refresh);\n      window.removeEventListener('storage', refresh);\n    };\n  }, []);",
  'Home profile state'
);

home = replaceOnce(
  home,
  "  if (businessSection) {\n    return (\n      <OwnerOpBusinessScreen\n        state={state}\n        section={businessSection}\n        onBack={() => setBusinessSection('')}\n        onOpenLog={() => onOpenDay?.(today)}\n      />\n    );\n  }",
  "  if (!profileReady) {\n    return <section className=\"screen setup-screen\"><main className=\"smart-scan-analyzing\"><span className=\"smart-scan-pulse\"><Icon name=\"truck\" size={34} /></span><h1>Preparing Road Ready</h1><p>Loading your owner-op setup…</p></main></section>;\n  }\n\n  if (setupOpen || !operatorProfile.setupComplete) {\n    return (\n      <OwnerOpSetupScreen\n        initialProfile={operatorProfile}\n        onCancel={operatorProfile.setupComplete ? () => setSetupOpen(false) : undefined}\n        onComplete={profile => { setOperatorProfile(profile); setSetupOpen(false); }}\n      />\n    );\n  }\n\n  if (scanOpen) {\n    return (\n      <SmartScanSheet\n        state={state}\n        profile={operatorProfile}\n        onClose={() => setScanOpen(false)}\n        onOpenBusiness={section => { setScanOpen(false); setBusinessSection(section); }}\n      />\n    );\n  }\n\n  if (businessSection === 'settlements') {\n    return <SettlementCenter profile={operatorProfile} onBack={() => setBusinessSection('')} onScan={() => setScanOpen(true)} />;\n  }\n\n  if (businessSection === 'money') {\n    return <MoneyTaxCenter onBack={() => setBusinessSection('')} onScan={() => setScanOpen(true)} onOpenExpenses={() => setBusinessSection('expenses')} />;\n  }\n\n  if (businessSection) {\n    return (\n      <OwnerOpBusinessScreen\n        state={state}\n        section={businessSection}\n        onBack={() => setBusinessSection('')}\n        onOpenLog={moduleEnabled(operatorProfile, 'logbook') ? () => onOpenDay?.(today) : undefined}\n      />\n    );\n  }\n\n  const logbookEnabled = moduleEnabled(operatorProfile, 'logbook');\n  const profileCompany = operatorProfile.companyName || operatorProfile.carrierName || 'Owner-operator business';",
  'Home modular screens'
);

home = replaceOnce(
  home,
  /  let nextStep = \{[\s\S]*?\n  \};\n\n  if \(unsigned > 0\)/,
  "  let nextStep = logbookEnabled ? {\n    eyebrow:'Next driver step',\n    title:'Update your duty status',\n    detail:'Keep the log current before the next move.',\n    actionLabel:'Change status',\n    action:() => onOpenStatus?.(),\n    tone:'status',\n  } : {\n    eyebrow:'Next business step',\n    title:activeLoad ? `Continue load ${activeLoad.loadNo || ''}`.trim() : 'Scan your first document',\n    detail:activeLoad ? 'Keep load documents, expenses and payment together.' : 'Start with a rate con, fuel receipt, settlement, repair bill or wallet document.',\n    actionLabel:activeLoad ? 'Open load' : 'Open Smart Scan',\n    action:() => activeLoad ? setBusinessSection('loads') : setScanOpen(true),\n    tone:'business',\n  };\n\n  if (logbookEnabled && unsigned > 0)",
  'Home next step'
);

home = home
  .replace("  } else if (activeLoad && /pickup|loading/i.test(reason) && activeLoad.docs.length === 0) {", "  } else if (logbookEnabled && activeLoad && /pickup|loading/i.test(reason) && activeLoad.docs.length === 0) {")
  .replace("  } else if (activeLoad && /delivery|unloading/i.test(reason)) {", "  } else if (logbookEnabled && activeLoad && /delivery|unloading/i.test(reason)) {")
  .replace("  } else if (summary.status === 'D') {", "  } else if (logbookEnabled && summary.status === 'D') {")
  .replace("      action:() => onOpenStatus?.(),\n      tone:'load',\n    };\n  } else {", "      action:() => logbookEnabled ? onOpenStatus?.() : setBusinessSection('loads'),\n      tone:'load',\n    };\n  } else {");

home = home
  .replace("  if (unsigned > 0) attention.push({", "  if (logbookEnabled && unsigned > 0) attention.push({")
  .replace("  if (activeLoad && activeLoad.docs.length === 0) attention.push({ title:'Active load has no BOL', detail:'Add the shipping reference before DOT review.', action:() => onOpenDay?.(today) });", "  if (activeLoad && activeLoad.docs.length === 0) attention.push({ title:'Active load has no BOL', detail:'Add the shipping reference before roadside or billing review.', action:() => logbookEnabled ? onOpenDay?.(today) : setScanOpen(true) });")
  .replace("  if (business.missingFuelReceipts > 0) attention.push({ title:`${business.missingFuelReceipts} fuel receipt${business.missingFuelReceipts === 1 ? '' : 's'} missing`, detail:'Add receipt proof before IFTA review.', action:() => setBusinessSection('fuel') });", "  if (business.missingFuelReceipts > 0) attention.push({ title:`${business.missingFuelReceipts} fuel receipt${business.missingFuelReceipts === 1 ? '' : 's'} missing`, detail:'Add receipt proof before IFTA review.', action:() => setBusinessSection('fuel') });\n  if (operatorProfile.mode === 'leased_on' && business.settlementDifference < -1) attention.push({ title:`Possible settlement short pay ${money(Math.abs(business.settlementDifference))}`, detail:'Compare expected percentage pay with the carrier statement.', action:() => setBusinessSection('settlements') });");

home = replaceOnce(
  home,
  /  const modules = \[[\s\S]*?\n  \];/,
  "  const moduleCards = [\n    { id:'logbook', icon:'log', title:'Logbook', detail:`${summary.label} · ${unsigned ? `${unsigned} unsigned` : 'up to date'}`, metric:'Open', tone:'blue', onClick:() => onOpenDay?.(today) },\n    { id:'dot', icon:'shield', title:'DOT Mode', detail:`${activeLoad?.docs.length || 0} active BOL${activeLoad?.docs.length === 1 ? '' : 's'}`, metric:'Ready', tone:'green', onClick:() => onOpenDot?.() },\n    { id:'wallet', icon:'wallet', title:'Digital Wallet', detail:walletCard.detail || 'Driver, truck and company documents', metric:walletCard.status === 'ok' ? 'Valid' : 'Review', tone:'violet', onClick:() => onOpenWallet?.() },\n    { id:'loads', icon:'load', title:'Loads & Documents', detail:`${business.activeLoads} active · ${business.readyToInvoice} to invoice`, metric:money(business.unpaid), tone:'indigo', onClick:() => setBusinessSection('loads') },\n    { id:'settlements', icon:'receipt', title:'Lease & Settlements', detail:`${business.settlementCount || 0} statements · expected vs actual`, metric:business.settlementDifference ? money(business.settlementDifference) : 'Audit', tone:'violet', onClick:() => setBusinessSection('settlements') },\n    { id:'fuel', icon:'fuel', title:'Fuel & IFTA', detail:`${business.fuelGallons.toFixed(1)} gal this week`, metric:money(business.fuelCost), tone:'amber', onClick:() => setBusinessSection('fuel') },\n    { id:'money', icon:'chart', title:'Money & Taxes', detail:`${money(business.estimatedTaxReserve)} suggested reserve`, metric:money(business.estimatedNet), tone:'teal', onClick:() => setBusinessSection('money') },\n    { id:'maintenance', icon:'wrench', title:'Maintenance', detail:'Repairs and service schedule', metric:money(business.maintenanceCost), tone:'slate', onClick:() => setBusinessSection('maintenance') },\n    { id:'expenses', icon:'receipt', title:'Expenses', detail:'Tolls, parking, lumper and operating costs', metric:money(business.otherExpenses), tone:'rose', onClick:() => setBusinessSection('expenses') },\n    { id:'performance', icon:'chart', title:'Performance', detail:`${business.totalMiles.toLocaleString()} total miles`, metric:money2(business.netPerMile), tone:'teal', onClick:() => setBusinessSection('performance') },\n  ];\n  const modules = moduleCards.filter(module => moduleEnabled(operatorProfile, module.id));",
  'Home module cards'
);

home = home
  .replace("<div><b>Road Ready</b><em>Owner-Op Command Center</em></div>", "<div><b>Road Ready</b><em>{modeLabel(operatorProfile.mode)}</em></div>")
  .replace("<button type=\"button\" className=\"command-scan-btn\" onClick={() => setBusinessSection('loads')}><Icon name=\"scan\" size={19} /><span>Scan</span></button>", "<button type=\"button\" className=\"command-scan-btn\" onClick={() => setScanOpen(true)}><Icon name=\"scan\" size={19} /><span>Scan</span></button>");

home = replaceOnce(
  home,
  /        <section className="command-ready-card">[\s\S]*?        <\/section>\n\n        <section className=\{`command-next-card/,
  "        {logbookEnabled ? (\n          <section className=\"command-ready-card\">\n            <div className=\"command-ready-top\">\n              <span className=\"command-ready-pill\"><i /> Road ready</span>\n              <button type=\"button\" onClick={onOpenTrailer}>{summary.vehicle}</button>\n            </div>\n            <button type=\"button\" className=\"command-current-status\" onClick={onOpenStatus}>\n              <span className={`command-status-badge ${summary.status}`}>{SHORT[summary.status] || summary.status}</span>\n              <span><b>{summary.label}</b><em>{summary.location}</em></span>\n              <Icon name=\"chevron\" size={18} />\n            </button>\n          </section>\n        ) : (\n          <section className=\"command-ready-card business-profile\">\n            <div className=\"command-business-profile-top\">\n              <div><span>Owner-Op Hub</span><b>{profileCompany}</b><em>{operatorProfile.truckNumber || 'Business setup active'}</em></div>\n              <button type=\"button\" onClick={() => setSetupOpen(true)}>Edit setup</button>\n            </div>\n            <div className=\"command-business-profile-bottom\">\n              <span><b>{operatorProfile.modules.length} modules</b><em>Personalized Home</em></span>\n              <span><b>{operatorProfile.mode === 'leased_on' ? `${operatorProfile.driverSharePercent}% share` : 'Business mode'}</b><em>{operatorProfile.mode === 'leased_on' ? 'Settlement tracking' : 'Logbook optional'}</em></span>\n            </div>\n          </section>\n        )}\n\n        <section className={`command-next-card",
  'Home profile card'
);

home = home.replace(
  "                <button type=\"button\" onClick={() => onOpenDay?.(today)}>Open load</button>",
  "                <button type=\"button\" onClick={() => logbookEnabled ? onOpenDay?.(today) : setBusinessSection('loads')}>Open load</button>"
);

home = replaceOnce(
  home,
  "        <section className=\"command-hos-card\">\n          <div className=\"command-section-title\"><span>Hours of service</span><button type=\"button\" onClick={() => onOpenDay?.(today)}>Open log</button></div>\n          <HosCompactClocks state={state} />\n        </section>",
  "        {logbookEnabled ? (\n          <section className=\"command-hos-card\">\n            <div className=\"command-section-title\"><span>Hours of service</span><button type=\"button\" onClick={() => onOpenDay?.(today)}>Open log</button></div>\n            <HosCompactClocks state={state} />\n          </section>\n        ) : null}",
  'Home HOS module'
);

home = home.replace(
  "<div className=\"command-all-clear\"><span>✓</span><div><b>Everything looks good</b><em>Logs, documents and business tasks are caught up.</em></div></div>",
  "<div className=\"command-all-clear\"><span>✓</span><div><b>Everything looks good</b><em>{logbookEnabled ? 'Logs, documents and business tasks are caught up.' : 'Documents and business tasks are caught up.'}</em></div></div>"
);

home = replaceOnce(
  home,
  "        <section className=\"command-recent-section\">\n          <div className=\"command-section-title\"><span>Recent logs</span><button type=\"button\" onClick={() => setShowAllLogs(value => !value)}>{showAllLogs ? 'Show less' : 'All 8 days'}</button></div>\n          <div className=\"command-log-list\">\n            {logDays.map(day => <RecentLogRow key={day} state={state} day={day} today={today} onOpen={onOpenDay} />)}\n          </div>\n        </section>",
  "        {logbookEnabled ? (\n          <section className=\"command-recent-section\">\n            <div className=\"command-section-title\"><span>Recent logs</span><button type=\"button\" onClick={() => setShowAllLogs(value => !value)}>{showAllLogs ? 'Show less' : 'All 8 days'}</button></div>\n            <div className=\"command-log-list\">\n              {logDays.map(day => <RecentLogRow key={day} state={state} day={day} today={today} onOpen={onOpenDay} />)}\n            </div>\n          </section>\n        ) : null}",
  'Home recent logs'
);

home = replaceOnce(
  home,
  /      <nav className="command-bottom-nav" aria-label="Primary navigation">[\s\S]*?      <\/nav>/,
  "      {logbookEnabled ? (\n        <nav className=\"command-bottom-nav\" aria-label=\"Primary navigation\">\n          <button type=\"button\" className=\"active\"><Icon name=\"home\" /><span>Home</span></button>\n          <button type=\"button\" onClick={() => onOpenDay?.(today)}><Icon name=\"log\" /><span>Logbook</span></button>\n          <button type=\"button\" className=\"drive\" onClick={() => (onOpenDrive ? onOpenDrive() : onOpenStatus?.())}><span><Icon name=\"truck\" /></span><em>Drive</em></button>\n          <button type=\"button\" onClick={() => setBusinessSection('loads')}><Icon name=\"load\" /><span>Loads</span></button>\n          <button type=\"button\" onClick={() => setSetupOpen(true)}><Icon name=\"more\" /><span>More</span></button>\n        </nav>\n      ) : (\n        <nav className=\"command-bottom-nav business-only\" aria-label=\"Primary navigation\">\n          <button type=\"button\" className=\"active\"><Icon name=\"home\" /><span>Home</span></button>\n          <button type=\"button\" onClick={() => setBusinessSection('loads')}><Icon name=\"load\" /><span>Loads</span></button>\n          <button type=\"button\" className=\"drive\" onClick={() => setScanOpen(true)}><span><Icon name=\"scan\" /></span><em>Scan</em></button>\n          <button type=\"button\" onClick={() => operatorProfile.mode === 'leased_on' ? setBusinessSection('settlements') : onOpenWallet?.()}><Icon name={operatorProfile.mode === 'leased_on' ? 'receipt' : 'wallet'} /><span>{operatorProfile.mode === 'leased_on' ? 'Pay' : 'Wallet'}</span></button>\n          <button type=\"button\" onClick={() => setSetupOpen(true)}><Icon name=\"more\" /><span>More</span></button>\n        </nav>\n      )}",
  'Home bottom navigation'
);

home = home.replace(
  "export default function HomeScreen({",
  "// v98.2-modular-owner-op-home\nexport default function HomeScreen({"
);
write(homePath, home);

const businessPath = 'source/src/modules/business/OwnerOpBusinessScreen.jsx';
let business = read(businessPath);
business = business.replace(
  '<button type="button" className="business-log-link" onClick={onOpenLog}>Log</button>',
  '{onOpenLog ? <button type="button" className="business-log-link" onClick={onOpenLog}>Log</button> : <span />}'
);
write(businessPath, business);

const graphPath = 'source/src/modules/graph/LogGraph.jsx';
let graph = read(graphPath);
graph = graph
  .replace(/D:'#[0-9a-fA-F]{6}'/, "D:'#00c98d'")
  .replace(/const HOUR_GRID_W = [0-9.]+;/, 'const HOUR_GRID_W = 0.64;')
  .replace(/const QUARTER_GRID_W = [0-9.]+;/, 'const QUARTER_GRID_W = 0.3;')
  .replace(/const HOUR_GRID_OPACITY = [0-9.]+;/, 'const HOUR_GRID_OPACITY = 0.8;')
  .replace(/const QUARTER_GRID_OPACITY = [0-9.]+;/, 'const QUARTER_GRID_OPACITY = 0.58;');
graph = graph.replace(
  /\s*<line\b(?=[^>]*x1=\{x\})(?=[^>]*x2=\{x\})(?=[^>]*stroke="#ffffff")(?=[^>]*VERTICAL_LINE_W)[^>]*\/>/g,
  ''
);
graph = graph.replace(
  /<line\b(?=[^>]*x1=\{(?:x|transition\.)[^>]*)(?=[^>]*stroke=\{CONNECTOR_COLOR\})[^>]*\/>/g,
  '<line x1={transition.to.status === \'D\' ? x - LINE_W * 0.06 : transition.from.status === \'D\' ? x + LINE_W * 0.06 : x} x2={transition.to.status === \'D\' ? x - LINE_W * 0.06 : transition.from.status === \'D\' ? x + LINE_W * 0.06 : x} y1={Math.min(y1, y2) - LINE_W * 0.47} y2={Math.max(y1, y2) + LINE_W * 0.47} stroke={CONNECTOR_COLOR} strokeWidth={VERTICAL_LINE_W} strokeLinecap="square" shapeRendering="geometricPrecision" />'
);
write(graphPath, graph);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);

write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v98.2-modular-setup-smart-scan',
  releasedAt:'2026-07-14T03:00:00.000Z',
  notes:[
    'Adds a first-run owner-operator setup that personalizes Home for leased-on, own-authority, business-only, driver, or small-fleet use.',
    'Makes Road Ready Logbook, DOT Mode, and Drive Mode optional modules instead of the base of the product.',
    'Adds Smart Scan with camera capture, native/mobile OCR bridge support, on-device text detection when available, document classification, review, offline storage, and business routing.',
    'Adds leased percentage setup, settlement audit, Money & Taxes, and profile-aware navigation while preserving log, HOS, route, signature, and DOT data.',
  ],
  label:'v98.2 Modular Setup + Smart Scan',
  updatedAt:'2026-07-14T03:00:00.000Z'
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const verifyHome = read(homePath);
if (!verifyHome.includes('v98.2-modular-owner-op-home') || !verifyHome.includes('OwnerOpSetupScreen') || !verifyHome.includes('SmartScanSheet') || !verifyHome.includes("businessSection === 'settlements'")) {
  throw new Error('v98.2 Home verification failed');
}
if (!read('source/src/modules/scan/SmartScanSheet.jsx').includes('capture="environment"') || !read('source/src/modules/setup/OwnerOpSetupScreen.jsx').includes('Leased-on owner-operator')) {
  throw new Error('v98.2 setup/scan verification failed');
}
console.log('v98.2 modular owner-op setup and smart scan materialized');
