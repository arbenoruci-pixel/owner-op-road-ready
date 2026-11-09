import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir='source/src/modules/home/';
fs.copyFileSync('scripts/driver-dashboard/DriverDashboard.jsx',dir+'DriverDashboard.jsx');
fs.copyFileSync('scripts/driver-dashboard/driverDashboard.css',dir+'driverDashboard.css');
const file=dir+'HomeScreen.jsx';
let code=fs.readFileSync(file,'utf8');
if(code.includes("import DriverDashboard from './DriverDashboard.jsx';")){console.log('PASS — driver dashboard already installed');process.exit(0);}
const top="import GrossBoard from '../owneros/GrossBoard.jsx';";
assert.equal(code.split(top).length,2,'Expected compact Home import');
code=code.replace(top,"import DriverDashboard from './DriverDashboard.jsx';\n"+top);
const opening='  return (\n    <section className="screen command-home-screen phone-home-v435 rr-business-shell rr-home-dark">';
const at=code.lastIndexOf(opening),end=code.lastIndexOf('\n  );\n}');
assert.ok(at>0&&end>at,'Home return bounds');
const render=[
 '  return <DriverDashboard',
 '    state={state} summary={summary} businessStore={businessStore} business={business} activeLoad={activeLoad}',
 '    operatorProfile={operatorProfile} unsigned={unsigned} logbookEnabled={logbookEnabled}',
 '    savedScan={pendingSavedLoadScanV110312(state,businessStore)}',
 '    savedScanBusy={savedScanBusy} savedScanMessage={savedScanMessage}',
 '    onContinueSavedScan={continueSavedScanV110312}',
 '    onSettings={()=>setSetupOpen(true)}',
 '    onStatus={onOpenStatus} onTrailer={onOpenTrailer} onOpenUnsigned={onOpenUnsigned}',
 '    onLog={()=>onOpenDay?.(today)} onOpenLogbook={onOpenLogbook}',
 '    onOpenShipment={reference=>onOpenDay?.(shipmentLogDay(state,reference,today))}',
 '    onDot={onOpenDot} onWallet={onOpenWallet} onDrive={()=>onOpenDrive?onOpenDrive():onOpenStatus?.()}',
 '    onScan={(type,context)=>{if(context){setLoadAttachment(context);return;}setScanPreferredType(type||"auto");setScanOpen(true);}}',
 '    onGuide={id=>setGuideOpen(id||true)} onOpenBackup={onOpenBackup} onSection={setBusinessSection}',
 '  />;'
].join('\n');
code=code.slice(0,at)+render+'\n}\n';
fs.writeFileSync(file,code);
console.log('PASS — read-only Home presentation and functional Active Load page installed');

