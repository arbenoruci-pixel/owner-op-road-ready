import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = file => fs.readFileSync(file, 'utf8');
function patch(file, before, after) {
  const source = read(file);
  if (after ? source.includes(after) : !source.includes(before)) return;
  assert.equal(source.split(before).length - 1, 1, `Load-only mission anchor: ${file}`);
  fs.writeFileSync(file, source.replace(before, after));
}
const loads = 'source/src/modules/loads/';
fs.copyFileSync('scripts/v110325/resolveLoadGuide.js', loads + 'resolveLoadGuideV110325.js');
fs.copyFileSync('scripts/v110325/LoadRouteHelpers.jsx', loads + 'LoadRouteHelpersV110325.jsx');
for (const name of ['loadGuideV103.js', 'safeMissionModelV10966.js']) {
  const file = loads + name;
  patch(file, "import {resolveChecklistEvidenceV110321} from './checklistEvidenceV110321.js';",
    "import {resolveLoadGuideV110325 as resolveChecklistEvidenceV110321} from './resolveLoadGuideV110325.js';");
}
// Keep the selected 100% guide visible for its explicit Complete load action.
// Completed fallback guides still cannot replace another active selection.
patch(loads+'loadGuideV103.js', '    return !resolveDriverGuideV103(state, candidate).complete;',
  '    return candidate === state.loadGuidesById?.[state.activeLoadGuideId] || !resolveDriverGuideV103(state, candidate).complete;');

const mission = loads + 'SafeDriverMissionV10966.jsx';
const legacy = loads + 'DriverLoadGuideV103.jsx';
const home = 'source/src/modules/home/AdaptiveHomeV1038.jsx';
// Remove the status action from every guide surface, including the Home card.
for (const file of [mission, legacy, home]) {
  patch(file, "  if (step.kind === 'status') {\n    dispatchLoadGuideActionV103({ action:'open_status', guideId:guide.id, stepId:step.id, step });\n    return;\n  }\n", '');
}
patch(mission, "  if (step.kind === 'status') return step.status === 'D' ? 'Log Driving' : 'Open Logbook';\n", '');
patch(home, "  if (step.kind === 'status') return step.status === 'D' ? 'Start driving' : 'Log status';\n", '');
patch(legacy, "  if (step.kind === 'status') return { label:step.status === 'D' ? 'Log Driving' : 'Log now', icon:'log', tone:'log' };\n", '');
patch(legacy,
  '<section className="driver-guide-safe-v103"><Icon name="log" size={19}/><span><b>Logbook-safe</b><em>Checklist taps organize the load. Duty status changes only after you open Log now and confirm the real time and location.</em></span></section>',
  '<section className="driver-guide-safe-v103"><Icon name="check" size={19}/><span><b>Load requirements</b><em>Follow the pickup, delivery, tracking and paperwork requirements from your load documents.</em></span></section>');
patch(legacy, "disabled={step.kind === 'status' || step.kind === 'document'}", "disabled={step.kind === 'document'}");
patch(legacy, "progress.steps.some(s => s.id === 'depart_pickup' && s.complete)",
  "progress.steps.filter(s => s.phase === 'pickup').length > 0 && progress.steps.filter(s => s.phase === 'pickup').every(s => s.complete)");
// Navigation is a separate helper surface and has no completion action.
for (const file of [mission, legacy]) {
  const statement = "import LoadRouteHelpersV110325 from './LoadRouteHelpersV110325.jsx';\n";
  if (!read(file).includes(statement)) fs.writeFileSync(file, statement + read(file));
}
patch(mission, '    </main>', '      <LoadRouteHelpersV110325 steps={progress.navigationSteps}/>\n    </main>');
patch(legacy, '        <StopPlan progress={progress}/>', '        <StopPlan progress={progress}/>\n        <LoadRouteHelpersV110325 steps={progress.navigationSteps}/>');
patch(mission, "{current?.title || 'Pickup workflow complete'}", "{current?.title || (progress.complete ? 'Load requirements complete' : 'Review load requirements')}");
patch(mission,
  '{actionLabelV10966(current)}</button> : null}',
  `{actionLabelV10966(current)}</button> : progress.complete ? <button type="button" onClick={() => {dispatchLoadGuideActionV103({action:'complete_guide',guideId:guide.id});onBack?.();}} style={{width:'100%',border:0,borderRadius:18,padding:'17px 18px',background:'#159777',color:'#fff',fontSize:19,fontWeight:950}}>Complete load</button> : null}`);
patch(home,
  `disabled={!step} onClick={() => runStep(guide, step, onScan)}>{step ? actionLabel(step) : 'Load complete'}`,
  `disabled={!step && !(snapshot.total > 0 && snapshot.completed === snapshot.total)} onClick={() => step ? runStep(guide, step, onScan) : dispatchLoadGuideActionV103({action:'complete_guide',guideId:guide.id})}>{step ? actionLabel(step) : 'Complete load'}`);

const VERSION = '110.3.25', BUILD = 'v110325-mission-load-requirements-only';
for (const file of ['release-version.json', 'public/app-version.json']) {
  const data = JSON.parse(read(file));
  Object.assign(data, {version:VERSION, build:BUILD, force:false,
    label:'v110.3.25 Mission load requirements only',
    releasedAt:new Date().toISOString(), updatedAt:new Date().toISOString(),
    sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null,
    notes:['Mission progress uses driver confirmations and load documents.',
      'Routes are optional navigation helpers and never block completion.',
      'Removed Logbook actions and completion evidence from all guide screens.',
      'Production equipment materialization has regression coverage.']});
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
for (const file of ['package.json', 'package-lock.json']) {
  const data = JSON.parse(read(file));
  data.version = VERSION;
  if (data.packages?.['']) data.packages[''].version = VERSION;
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
for (const [file, name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'], ['public/sw.js','OWNER_OP_SW']]) {
  let source = read(file);
  for (const [key, value] of [['VERSION', VERSION], ['BUILD', BUILD]]) {
    source = source.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['\"][^'\"]+['\"];?`), `const ${name}_${key} = '${value}';`);
  }
  fs.writeFileSync(file, source);
}
for (const file of ['source/src/modules/home/HomeScreen.jsx', 'source/src/shared/ui/ToolsSheet.jsx']) {
  fs.writeFileSync(file, read(file).replace(/App v\d+\.\d+\.\d+/g, `App v${VERSION}`).replace(/APP V\d+\.\d+\.\d+/g, `APP V${VERSION}`));
}
patch('scripts/test-duty-graph-continuity.mjs', "assert.equal(meta.version,'110.3.24');assert.equal(meta.build,'v110324-trailer-intermodal-mode-separation');",
  `assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — Mission uses only load requirements, driver confirmations and documents');
