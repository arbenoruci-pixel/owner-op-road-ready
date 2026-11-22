import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = 'source/src/modules/home/';
for (const file of ['TodayDashboard.jsx', 'TodayNav.jsx', 'stopKind.js', 'todayStop.js', 'today.css']) {
  fs.copyFileSync('scripts/driver-dashboard/' + file, home + file);
}
function patch(file, original, change) {
  const code = fs.readFileSync(home + file, 'utf8');
  if (code.includes(change)) return;
  assert.equal(code.split(original).length, 2, file + ' Today integration anchor ' + original);
  fs.writeFileSync(home + file, code.replace(original, () => change));
}
patch('DriverDashboard.jsx', 'function LoadHistory(', 'export function LoadHistory(');
patch('DriverDashboard.jsx', 'function MissionScreen(', 'export function MissionScreen(');
patch('DriverDashboard.jsx', "{currentLoad.guide?<button type=\"button\" onClick={()=>onSection('load_documents')}>Open load folder</button>:null}", "<button type=\"button\" onClick={()=>{requestLoadFolder(currentLoad.identity==='reference'?'shipment:'+currentLoad.shipmentReference:currentLoad.canonicalLoadNo);onSection('load_documents');}}>Open load folder</button>");
patch('AdaptiveHomeV1038.jsx',
  "className=\"primary\" onClick={()=>onSection('load_documents')}>Open load folder</button>",
  "className=\"primary\" onClick={()=>onSection('load_documents')}>Browse load folders</button>");
patch('HomeScreen.jsx', "import DriverDashboard from './DriverDashboard.jsx';", "import DriverDashboard from './TodayDashboard.jsx';");
patch('HomeScreen.jsx', "const [businessSection, setBusinessSection] = useState(()=>state.homeSection||'');",
  "const [businessSection, setBusinessSection] = useState(()=>state.homeSection||'');\n  const [todayTab, setTodayTab] = useState('today');");
patch('HomeScreen.jsx', 'return <DriverDashboard\n', 'return <DriverDashboard tab={todayTab} onTab={setTodayTab}\n');
patch('HomeScreen.jsx', '<OwnerOperatorOSV102\n', `<OwnerOperatorOSV102
        driverNav={{
          onToday: () => { setTodayTab('today'); setBusinessSection(''); },
          onMore: () => { setTodayTab('more'); setBusinessSection(''); },
          onLog: moduleEnabled(operatorProfile, 'logbook') ? (onOpenLogbook || (() => onOpenDay?.(today))) : undefined,
        }}
`);
console.log('Installed driver Today, More and four-tab navigation');
