import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '100.3.0';
const RELEASED_AT = '2026-07-15T12:30:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v100.3 missing ${label}`);
  return content.replace(before, after);
}
function appendOnce(content, marker, addition) {
  return content.includes(marker) ? content : `${content.trimEnd()}\n\n${addition.trim()}\n`;
}

// Tighten location evidence so an empty event city cannot auto-complete a stop.
const guidePath = 'source/src/modules/loads/loadGuideV103.js';
let guideSource = read(guidePath);
guideSource = guideSource.replace(
  "  const cityOk = !city || eventCity.includes(city) || city.includes(eventCity);",
  "  const cityOk = !city || (!!eventCity && (eventCity.includes(city) || city.includes(eventCity)));"
);
write(guidePath, guideSource);

// Preserve structured multi-stop data through the review form and business store.
const scanPath = 'source/src/modules/scan/SmartScanSheetV100.jsx';
let scan = read(scanPath);
if (!scan.includes('stops:Array.isArray(f.stops)')) {
  scan = replaceOnce(
    scan,
    "    stopCount:Number(f.stopCount || 0),",
    "    stopCount:Number(f.stopCount || 0),\n    deliveryCount:Number(f.deliveryCount || 0),\n    stops:Array.isArray(f.stops) ? f.stops : [],\n    driverRequirements:f.driverRequirements || {},",
    'structured Rate Con stops'
  );
}
if (!scan.includes('stops:Array.isArray(fields.stops)')) {
  scan = replaceOnce(
    scan,
    "routeSummary:String(fields.routeSummary || '').trim(), stopCount:number(fields.stopCount), pieces:number(fields.totalPieces), weight:number(fields.weight), trackingProvider:String(fields.trackingProvider || '').trim(),",
    "routeSummary:String(fields.routeSummary || '').trim(), stopCount:number(fields.stopCount), deliveryCount:number(fields.deliveryCount), stops:Array.isArray(fields.stops) ? fields.stops : [], pieces:number(fields.totalPieces), weight:number(fields.weight), trackingProvider:String(fields.trackingProvider || '').trim(),",
    'saved structured Rate Con stops'
  );
}
write(scanPath, scan);

// Upgrade the document listener so a Rate Con creates a persistent driver guide
// and planned route without creating any duty-status events.
const appPath = 'source/src/app/App.jsx';
let app = read(appPath);
app = replaceOnce(
  app,
  "import { applySmartDocumentLinkV100, SMART_DOCUMENT_LINK_EVENT } from '../modules/scan/smartDocumentLinkV100.js';",
  "import { applyLoadGuideActionV103, applySmartDocumentLinkV103, LOAD_GUIDE_ACTION_EVENT_V103, SMART_DOCUMENT_LINK_EVENT } from '../modules/loads/loadGuideV103.js';",
  'App driver guide import'
);
app = app.replace(/applySmartDocumentLinkV100\(/g, 'applySmartDocumentLinkV103(');
if (!app.includes('function onLoadGuideAction(event)')) {
  app = replaceOnce(
    app,
    `    window.addEventListener(SMART_DOCUMENT_LINK_EVENT, onSmartDocumentLink);
    return () => window.removeEventListener(SMART_DOCUMENT_LINK_EVENT, onSmartDocumentLink);`,
    `    function onLoadGuideAction(event) {
      const detail = event?.detail || {};
      if (!detail.action) return;
      if (detail.action === 'open_status') {
        setState(current => {
          const next = applyLoadGuideActionV103(current, detail);
          const step = detail.step || {};
          const today = localDayKey();
          return {
            ...next,
            view:'day',
            activeDay:today,
            selectedEventId:null,
            selectMode:false,
            selectedIds:[],
            sheet:{
              type:'status',
              prefill:{
                status:step.status || 'ON',
                reason:step.reason || '',
                city:step.city || next.currentLocation?.city || '',
                state:step.state || next.currentLocation?.state || '',
                loadNo:step.loadNo || next.loadInfo?.loadNo || next.loadInfo?.shippingDocs || '',
                destination:step.destination || next.loadInfo?.deliveryCity && [next.loadInfo?.deliveryCity, next.loadInfo?.deliveryState].filter(Boolean).join(', ') || '',
                notes:[step.title, step.detail].filter(Boolean).join(' · '),
              },
            },
            roadGuardTabRequest:{ tab:'log', at:Date.now(), source:'driver-load-guide-v103' },
          };
        });
        return;
      }
      if (detail.action === 'open_log') {
        setState(current => ({ ...applyLoadGuideActionV103(current, detail), view:'day', activeDay:localDayKey(), sheet:null, roadGuardTabRequest:{ tab:'log', at:Date.now(), source:'driver-load-guide-v103' } }));
        return;
      }
      setState(current => applyLoadGuideActionV103(current, detail));
    }
    window.addEventListener(SMART_DOCUMENT_LINK_EVENT, onSmartDocumentLink);
    window.addEventListener(LOAD_GUIDE_ACTION_EVENT_V103, onLoadGuideAction);
    return () => {
      window.removeEventListener(SMART_DOCUMENT_LINK_EVENT, onSmartDocumentLink);
      window.removeEventListener(LOAD_GUIDE_ACTION_EVENT_V103, onLoadGuideAction);
    };`,
    'App driver guide action listener'
  );
}
write(appPath, app);

// Prefill the existing status workflow from a guide step. The driver still
// confirms the actual status/time/location before a RODS event is saved.
const statusPath = 'source/src/modules/status/StatusWorkflowSheet.jsx';
let status = read(statusPath);
if (!status.includes('const guidePrefill = state.sheet?.prefill')) {
  status = replaceOnce(
    status,
    `export default function StatusWorkflowSheet({ state, onClose, onApplyStatus, onStartDriving }) {
  const [status, setStatus] = useState(state.currentStatus || 'OFF');
  const [city, setCity] = useState(state.currentLocation?.city || 'Chicago');
  const [st, setSt] = useState(state.currentLocation?.state || 'IL');
  const [locationText, setLocationText] = useState(locationString(state.currentLocation?.city || 'Chicago', state.currentLocation?.state || 'IL'));
  const [selectedReasons, setSelectedReasons] = useState([reasonList(state.currentStatus || 'OFF')[0]]);`,
    `export default function StatusWorkflowSheet({ state, onClose, onApplyStatus, onStartDriving }) {
  const guidePrefill = state.sheet?.prefill || {};
  const initialStatus = ['OFF','SB','D','ON'].includes(String(guidePrefill.status || '').toUpperCase()) ? String(guidePrefill.status).toUpperCase() : (state.currentStatus || 'OFF');
  const initialReason = guidePrefill.reason || reasonList(initialStatus)[0];
  const initialCity = guidePrefill.city || state.currentLocation?.city || 'Chicago';
  const initialState = guidePrefill.state || state.currentLocation?.state || 'IL';
  const [status, setStatus] = useState(initialStatus);
  const [city, setCity] = useState(initialCity);
  const [st, setSt] = useState(initialState);
  const [locationText, setLocationText] = useState(locationString(initialCity, initialState));
  const [selectedReasons, setSelectedReasons] = useState([initialReason]);`,
    'status guide prefill base'
  );
  status = status.replace("  const [notes, setNotes] = useState('');", "  const [notes, setNotes] = useState(guidePrefill.notes || '');");
  status = status.replace("  const [shippingDocs, setShippingDocs] = useState('');", "  const [shippingDocs, setShippingDocs] = useState(guidePrefill.loadNo || '');");
  status = status.replace("  const [destination, setDestination] = useState('');", "  const [destination, setDestination] = useState(guidePrefill.destination || '');");
  status = status.replace("  const previousLoadKind = useRef('');", "  const previousLoadKind = useRef(loadReasonKind(initialStatus, [initialReason]));");
}
write(statusPath, status);

// Add the compact guide to Home and a dedicated full-screen mission view.
const homePath = 'source/src/modules/home/HomeScreen.jsx';
let home = read(homePath);
home = replaceOnce(
  home,
  "import OwnerOpBusinessScreen from '../business/OwnerOpBusinessScreen.jsx';",
  "import OwnerOpBusinessScreen from '../business/OwnerOpBusinessScreen.jsx';\nimport DriverLoadGuideV103 from '../loads/DriverLoadGuideV103.jsx';",
  'Home guide import'
);
if (!home.includes("const [guideOpen, setGuideOpen]")) {
  home = replaceOnce(
    home,
    "  const [businessSection, setBusinessSection] = useState('');\n  const [showAllLogs, setShowAllLogs] = useState(false);",
    "  const [businessSection, setBusinessSection] = useState('');\n  const [guideOpen, setGuideOpen] = useState(false);\n  const [showAllLogs, setShowAllLogs] = useState(false);",
    'Home guide state'
  );
}
if (!home.includes('mode="screen"')) {
  home = replaceOnce(
    home,
    "  if (businessSection) {",
    `  if (guideOpen) {
    return <DriverLoadGuideV103 state={state} mode="screen" onBack={() => setGuideOpen(false)} onOpenScan={() => { setGuideOpen(false); setBusinessSection('loads'); }} />;
  }

  if (businessSection) {`,
    'Home guide screen'
  );
}
if (!home.includes('mode="compact"')) {
  home = replaceOnce(
    home,
    `        </section>

        <section className={activeLoad ? 'command-load-card' : 'command-load-card empty'}>`,
    `        </section>

        <DriverLoadGuideV103 state={state} mode="compact" onOpen={() => setGuideOpen(true)} onOpenScan={() => setBusinessSection('loads')} />

        <section className={activeLoad ? 'command-load-card' : 'command-load-card empty'}>`,
    'Home compact guide card'
  );
}
write(homePath, home);

// Append the dedicated responsive design to the command center stylesheet.
const commandCssPath = 'source/src/command-center.css';
let commandCss = read(commandCssPath);
commandCss = appendOnce(commandCss, '/* v100.3 Driver Load Mission Guide */', read('source/src/driver-guide-v103.css'));
write(commandCssPath, commandCss);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v100.3-driver-load-mission-guide',
  releasedAt:RELEASED_AT,
  notes:[
    'Creates a persistent Driver Load Guide whenever a verified Rate Confirmation is saved.',
    'Shows the next pickup/delivery action on Home with tap-through progress and a full-screen mission checklist.',
    'Builds planned multi-stop route legs, active-load details and Logbook form data from the imported Rate Con without creating duty-status events.',
    'Opens the existing status workflow prefilled with the correct pickup/delivery location, load number, destination and reason; the driver confirms the real time before saving.',
    'Auto-completes guide steps from real Logbook events and linked BOL/POD documents, while manual checklist items remain explicit driver confirmations.',
    'Recognizes tracking, license, hi-vis, trailer cleanliness, pre-cool, seal-record, detention-time, OS&D and paperwork requirements from broker instructions.',
    'Preserves PDF.js Rate Con reading, Pro Document Inbox, multi-event movement, HOS, DOT, fuel and maintenance data.'
  ],
  label:'v100.3 Driver Load Mission Guide',
  updatedAt:RELEASED_AT
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const verifyApp = read(appPath);
const verifyHome = read(homePath);
const verifyStatus = read(statusPath);
const verifyScan = read(scanPath);
const verifyGuide = read(guidePath);
if (!verifyApp.includes('applySmartDocumentLinkV103') || !verifyApp.includes('LOAD_GUIDE_ACTION_EVENT_V103') || !verifyApp.includes("action === 'open_status'")) throw new Error('v100.3 App guide integration failed');
if (!verifyHome.includes('DriverLoadGuideV103') || !verifyHome.includes('mode="compact"') || !verifyHome.includes('mode="screen"')) throw new Error('v100.3 Home guide integration failed');
if (!verifyStatus.includes('guidePrefill') || !verifyStatus.includes('initialReason')) throw new Error('v100.3 status prefill failed');
if (!verifyScan.includes('stops:Array.isArray(f.stops)') || !verifyScan.includes('stops:Array.isArray(fields.stops)')) throw new Error('v100.3 structured stop persistence failed');
if (!verifyGuide.includes('buildDriverLoadGuideV103') || !verifyGuide.includes('rate_confirmation_guide_v103')) throw new Error('v100.3 guide engine failed');
console.log('v100.3 Driver Load Mission Guide materialized');
await import('./verify-driver-load-guide-v103.mjs');
