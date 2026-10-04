import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const read = path => fs.readFileSync(path,'utf8');
function patch(path, before, after) {
  const source = read(path);
  if(source.includes(after)) return;
  if(source.split(before).length !== 2) throw Error('Form team anchor changed: '+path);
  fs.writeFileSync(path,source.replace(before,()=>after));
}
fs.copyFileSync('scripts/v110448/formTeam.js','source/src/core/team/formTeamV110448.js');
const app='source/src/app/App.jsx';
patch(app,"import TeamDriverBar from '../modules/logbook/TeamDriverBar.jsx';", "import TeamDriverBar from '../modules/logbook/TeamDriverBar.jsx';\nimport {registerFormTeamDrivers} from '../core/team/formTeamV110448.js';");
patch(app,'      next = applyDayFormEdit(s, next, payload, s.activeDay);', '      next = applyDayFormEdit(s, next, payload, s.activeDay);\n      if (payload.coDrivers !== undefined) next = registerFormTeamDrivers(next, payload.coDrivers, s.activeDay);');
const source=read(app), before='<TeamDriverBar\n        state={state}', after='<TeamDriverBar\n        state={readLogbookDayState(state, state.activeDay)}';
if(!source.includes(after)) {
  if(source.split(before).length!==3) throw Error('Expected both team driver bars');
  fs.writeFileSync(app,source.replaceAll(before,after));
}
const bar='source/src/modules/logbook/TeamDriverBar.jsx';
patch(bar,"import { teamDriverSummary } from '../../core/team/teamLogbook.js';", "import { formTeamDriverSummary as teamDriverSummary } from '../../core/team/formTeamV110448.js';");
patch(bar,'  const active = summary.activeDriver;', '  const active = summary.activeDriver;\n  const memberIds = summary.drivers.map(driver => driver.id).join("|");\n  React.useEffect(() => setOpen(false), [summary.activeDriverId, memberIds]);');
patch(bar,'  return (\n    <div className="team-driver-shell">', '  if (summary.drivers.length < 2) return null;\n\n  return (\n    <div className="team-driver-shell">');
// Team membership is edited in the Form; the header only switches its members.
let text=read(bar);
text=text.replace("  const [name, setName] = useState('');\n",'');
const functionStart=text.indexOf('  function addDriver() {'), functionEnd=text.indexOf('  if (summary.drivers.length',functionStart);
if(functionStart>=0) text=text.slice(0,functionStart)+text.slice(functionEnd);
const addStart=text.indexOf('          <div className="team-driver-add">'),addEnd=text.indexOf('          <p>Each driver',addStart);
if(addStart>=0 && addEnd>addStart) text=text.slice(0,addStart)+text.slice(addEnd);
fs.writeFileSync(bar,text);
const VERSION='110.4.48', BUILD='v110448-form-team-switch';
for(const path of ['release-version.json','public/app-version.json']) {
  const v=JSON.parse(read(path));Object.assign(v,{version:VERSION,build:BUILD,label:'v110.4.48 Form team switching',sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Show driver switching only for co-drivers included in the selected Form.','Retain saved logbooks when a co-driver is removed and reuse them when added again.']});fs.writeFileSync(path,JSON.stringify(v,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){const v=JSON.parse(read(path));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(v,null,2)+'\n');}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(path);for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(path,s);}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replaceAll('v110.4.47','v'+VERSION).replaceAll('V110.4.47','V'+VERSION));
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,read(path).replaceAll("'110.4.47'","'"+VERSION+"'").replaceAll("'v110447-team-pickup-guards'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
execFileSync(process.execPath,['scripts/v110448/form-team.test.mjs'],{stdio:'inherit'});
console.log('PASS — Form membership controls driver switching');
await import('./finalize-load-history-v110449.mjs');
