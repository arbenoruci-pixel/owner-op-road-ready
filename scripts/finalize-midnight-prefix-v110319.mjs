import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
function patch(file,before,after){const s=read(file);if(s.includes(after))return;assert.equal(s.split(before).length-1,1,'Midnight prefix 110.3.19 anchor: '+file);fs.writeFileSync(file,s.replace(before,after));}

// A manually chosen End belongs to that row. The independently known status
// before the first change still covers midnight, without writing a new event.
const duty='source/src/modules/logbook/dutyViewV110212.js';
patch('source/src/core/timeline/knownMidnightCarry.js',
 '    || !recorded(previous) || !CARRYABLE.has(previous.status)',
 '    || !recorded(previous) || previous.paperLogEndV110315 || !CARRYABLE.has(previous.status)');
patch(duty,'  if(exactEvents.some(e=>e.paperLogEndV110315))return exactEvents;','  // Resolve the known midnight prefix before preserving manual End boundaries.');
patch(duty,'  const exactWithCarry=carry?[carry,...exactEvents]:exactEvents;','  const exactWithCarry=carry?[carry,...exactEvents]:exactEvents;\n  if(exactEvents.some(e=>e.paperLogEndV110315))return exactWithCarry;');
const display='source/src/core/timeline/displayTimeline.js';
patch(display,"import { nowMin }", "import { knownMidnightCarry, previousRecordedDuty } from './knownMidnightCarry.js';\nimport { nowMin }");
patch(display,'  if(raw.some(e=>e.paperLogEndV110315))return raw;',`  if(raw.some(e=>e.paperLogEndV110315)){
    const carry=knownMidnightCarry(raw,previousRecordedDuty(eventsByDay,day));
    return carry?[carry,...raw]:raw;
  }`);

// The mount effect must initialize from the same live projection as the form.
// Resetting to the one-minute storage sentinel makes an untouched End dirty.
const edit='source/src/modules/editor/EditEventSheet.jsx';
patch(edit,'    const next = formStateFromEvent(event);','    const next = formStateFromEvent(projectedV110.find(e=>e.id===event.id) || event);');
patch(edit,'  const editorExactEventsV11034=(previewStateV11023?.eventsByDay?.[dayV110]||[]).filter(row=>!row?.displayOnly&&!row?.syntheticCoverage&&!row?.carriedFromPreviousDay);','  const editorExactEventsV11034=previewEvents;');

// Structured activity choices and an explicit shipping reference are driver
// input. Legacy text cleanup must retain them when the saved day is reopened.
patch('source/src/modules/documents/documentFoundationV105.js',
 "      const originalNote = textV105(event?.note || '');",
 "      if(structuredPretripReasonV105(event) && (event.reasons||[]).some(reason=>/delivery|unloading/i.test(textV105(reason))))return event;\n      const originalNote = textV105(event?.note || '');");
patch('source/src/modules/logbook/logIntegrityV1051.js',
 "  if (pickup && loadNo && textV1051(next.bol) === loadNo && !textV1051(next.shippingDocumentId)) next.bol = '';",
 "  if (pickup && loadNo && next.loadDetailsExplicit !== true && textV1051(next.bol) === loadNo && !textV1051(next.shippingDocumentId)) next.bol = '';" );

const VERSION='110.3.19',BUILD='v110319-midnight-prefix-after-edit';
for(const file of ['release-version.json','public/app-version.json']){const d=JSON.parse(read(file));Object.assign(d,{version:VERSION,build:BUILD,force:false,label:'v110.3.19 Midnight continuity after Edit',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Editing details keeps the current event running until its End is explicitly changed.','The known midnight SB/OFF/ON prefix remains visible after Edit, status changes and reopening.','Manual event boundaries and genuine gaps remain visible.']});fs.writeFileSync(file,JSON.stringify(d,null,2)+'\n');}
for(const file of ['package.json','package-lock.json']){const d=JSON.parse(read(file));d.version=VERSION;if(d.packages?.[''])d.packages[''].version=VERSION;fs.writeFileSync(file,JSON.stringify(d,null,2)+'\n');}
for(const [file,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(file);for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(file,s);}
for(const file of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(file,read(file).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.18');assert.equal(meta.build,'v110318-smart-scan-load-recovery');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — 110.3.19 keeps known midnight continuity after Edit and leaves untouched live End open');
