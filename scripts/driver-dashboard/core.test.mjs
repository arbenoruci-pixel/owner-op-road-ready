import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const d=fs.readFileSync('scripts/driver-dashboard/DriverDashboard.jsx','utf8');
const css=fs.readFileSync('scripts/driver-dashboard/driverDashboard.css','utf8');
test('active page uses existing saved guided mission and never invents completion',()=>{
 assert.ok(d.includes('<AdaptiveHomeV1038'));
 assert.ok(d.includes('onOpenGuide={onGuide}'));
 assert.ok(!d.includes('dispatchLoadGuideActionV103'));
 assert.ok(d.includes('activeLoad?'));
});
test('home shortcuts map to existing app actions',()=>{
 for(const key of ['onOpenLogbook','onWallet','onScan','load_documents','documents','onDot','setMissionOpen(true)','maintenance'])assert.ok(d.includes(key),key);
 assert.ok(d.includes('businessLoadRows')&&d.includes('operationalCandidateContext'));
});
test('recent loads group by week, collapse, and do not hardcode example data',()=>{
 assert.ok(d.includes('<details'));
 assert.ok(d.includes('onClick={()=>setOpen(v=>!v)}'));
 assert.ok(d.includes('grossMoney(grossValue(r))'));
 assert.ok(!d.includes('1741530')&&!d.includes('132574457'));
});
test('new UI is scoped to Home and Active Load',()=>{
 assert.ok(css.includes('.rr-driver-home'));
 assert.ok(css.includes('.rr-driver-mission'));
 assert.ok(css.includes("url('/driver-dashboard/highway-sunset.webp')"));
 assert.ok(fs.statSync('public/driver-dashboard/highway-sunset.webp').size<150000);
});

