import fs from 'node:fs';
import assert from 'node:assert/strict';

const VERSION='110.3.53';
const BUILD='v110353-cycle-week-export';
const read=path=>fs.readFileSync(path,'utf8');
function patch(path,before,after,label){
  let source=read(path);
  if(source.includes(after))return;
  assert.equal(source.split(before).length-1,1,label||path);
  fs.writeFileSync(path,source.replace(before,after));
}

fs.copyFileSync('scripts/v110353/cycleWeekExport.js','source/src/modules/backup/cycleWeekExport.js');
const screen='source/src/modules/backup/BackupLogsScreen.jsx';
patch(screen,
  "} from './fullBackupV105.js';",
  "} from './fullBackupV105.js';\nimport { buildCycleWeekExport, cycleWeekFileName } from './cycleWeekExport.js';",
  'Weekly export import anchor');

const exportFn=`  async function exportCycleWeek() {
    setBusy(true);
    setStatus('Finding the latest completed 34-hour reset and building one cycle week…');
    try {
      const payload = buildCycleWeekExport(state, { appVersion:CURRENT_APP_VERSION });
      const filename = cycleWeekFileName(payload);
      const result = await shareOrDownloadJson(payload, filename);
      if (result === 'cancelled') {
        setStatus('One-week export cancelled. Your data was not changed.');
        return;
      }
      const start = payload.window.startDay;
      const end = payload.window.endDay;
      const resetText = payload.window.resetDetected ? '34h reset detected' : 'no 34h reset found; latest 7 recorded days used';
      setStatus(\`One-week export ready: \${start} → \${end} · \${resetText}\`);
    } catch (error) {
      setStatus(error?.message || 'One-week export failed');
    } finally {
      setBusy(false);
    }
  }

`;
const fnAnchor='  async function importFile(file) {';
if(!read(screen).includes('async function exportCycleWeek()')){
  patch(screen,fnAnchor,exportFn+fnAnchor,'Weekly export function anchor');
}

const buttonBefore='<button type="button" className="backup-secondary" onClick={exportBackup} disabled={busy}>2 · Export readable all-data JSON</button>';
const buttonAfter=`<button type="button" className="backup-secondary" onClick={exportBackup} disabled={busy}>2 · Export readable all-data JSON</button>
          <button type="button" className="backup-primary" onClick={exportCycleWeek} disabled={busy}>3 · Export one week from 34h reset</button>
          <p>This weekly file starts at the latest completed 34-hour OFF/SB reset and covers exactly 7×24 hours. If no completed reset is found, it clearly falls back to the latest 7 recorded log days.</p>`;
patch(screen,buttonBefore,buttonAfter,'Weekly export button anchor');

const now=new Date().toISOString();
for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(read(path));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.53 One-week export from 34h reset',releasedAt:now,updatedAt:now,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Add a readable one-week diagnostic export.','Start the export window at the latest completed 34-hour OFF/SB restart and cover exactly seven 24-hour periods.','Include loadInfo and route-bucket diagnostics so stuck load data can be analyzed without exporting the full history.']});
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){
  const value=JSON.parse(read(path));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let source=read(path);
  for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]]){
    const pattern=new RegExp(`const ${name}_${key}\\s*=\\s*['\"][^'\"]+['\"];?`);
    assert.ok(pattern.test(source),`Release marker ${path} ${key}`);
    source=source.replace(pattern,`const ${name}_${key} = '${value}';`);
  }
  fs.writeFileSync(path,source);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx']){
  fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
}
const test='scripts/test-duty-graph-continuity.mjs';
const before="assert.equal(meta.version,'110.3.52');assert.equal(meta.build,'v110352-day-load-cleanup');";
const after=`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`;
let testSource=read(test);
if(!testSource.includes(after)){
  assert.equal(testSource.split(before).length-1,1,'Weekly release test anchor');
  fs.writeFileSync(test,testSource.replace(before,after));
}
console.log('PASS — v110.3.53 one-week export from latest completed 34h reset installed');
