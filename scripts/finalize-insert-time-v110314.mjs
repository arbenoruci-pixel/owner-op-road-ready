import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = path => fs.readFileSync(path, 'utf8');
const path = 'source/src/modules/editor/InsertEditEventSheet.jsx';
let source = read(path);
function replace(before, after) {
  assert.equal(source.split(before).length - 1, 1, `110.3.14 Insert anchor changed: ${before.slice(0, 90)}`);
  source = source.replace(before, after);
}
function block(start, next, replacement) {
  const from = source.indexOf(start), to = source.indexOf(next, from);
  assert.ok(from >= 0 && to > from, `110.3.14 Insert block missing: ${start}`);
  source = source.slice(0, from) + replacement + source.slice(to);
}
fs.copyFileSync('scripts/v110314/insertTimeV110314.js', 'source/src/modules/editor/insertTimeV110314.js');
if (!source.includes('INSERT_TIME_CHOICES_V110314')) {
  source = "// INSERT_TIME_CHOICES_V110314\nimport { insertDayLimitV110314, initialInsertRangeV110314, quickInsertRangeV110314, durationInsertRangeV110314, insertBoundaryV110314 } from './insertTimeV110314.js';\n" + source;
  replace('  const defaultStart = defaults.startMin ?? safeDefaultStart(events,clockV110.minute);',
    `  const insertLimitV110314 = insertDayLimitV110314(logbookContext, clockV110);
  const initialRangeV110314 = initialInsertRangeV110314(insertLimitV110314, defaults.startMin, defaults.endMin);
  const defaultStart = initialRangeV110314.startMin;`);
  replace('    endMin: Math.min(1440, defaultStart + 15),', '    endMin: initialRangeV110314.endMin,');
  replace('      startMin: start,\n      endMin: Math.min(1440, start + 15),',
    '      ...initialInsertRangeV110314(insertLimitV110314, start),');
  replace('      startMin,\n      endMin: Math.min(1440, startMin + 15),',
    '      ...initialInsertRangeV110314(insertLimitV110314, startMin),');
  replace("    if (!current) return;\n\n    let s = mode === 'insert' ? current.startMin : fromInput(form.start);",
    `    if (!current) return;
    if (mode === 'insert') {
      const range = insertBoundaryV110314(current, edge, minute, insertLimitV110314);
      const next = { ...current, ...range };
      setInsertDraftEvent(next); setForm(eventToForm(next));
      return;
    }

    let s = mode === 'insert' ? current.startMin : fromInput(form.start);`);
  block('  function quick(minAgo) {', '\n  function setFullDay(', `  function quick(minAgo) {
    const range = quickInsertRangeV110314(insertLimitV110314, minAgo);
    updateForm({ start: toInput(range.startMin), end: toInput(range.endMin) });
  }

  function changeInsertTimeV110314(edge, value) {
    const minute = fromInput(value);
    if (mode !== 'insert' || !Number.isFinite(minute)) { updateForm({ [edge]: value }); return; }
    const range = insertBoundaryV110314({ startMin: fromInput(form.start), endMin: fromInput(form.end) }, edge, minute, insertLimitV110314, true);
    updateForm({ start: toInput(range.startMin), end: toInput(range.endMin) });
  }
`);
  block('  function setDuration(minutes) {', '\n  function splitPreviewText()', `  function setDuration(minutes) {
    const range = durationInsertRangeV110314(insertLimitV110314, fromInput(form.start), minutes);
    updateForm({ start: toInput(range.startMin), end: toInput(range.endMin) });
  }
`);
  replace("  const rangeErrorV110 = editorRangeError(fromInput(form.start),fromInput(form.end));",
    "  const rangeErrorV110 = mode === 'insert' && insertLimitV110314 < 1 ? 'There is no elapsed time on this log day yet.' : editorRangeError(fromInput(form.start),fromInput(form.end));");
  replace('              onStartChange={(v) => updateForm({ start: v })}\n              onEndChange={(v) => updateForm({ end: v })}',
    `              allowMidnightInput
              maxMinute={mode === 'insert' ? insertLimitV110314 : 1440}
              onStartChange={(v) => changeInsertTimeV110314('start', v)}
              onEndChange={(v) => changeInsertTimeV110314('end', v)}`);
  // The old overlap-based initializer points into the future by design. Remove
  // it so a subsequent UI path cannot accidentally resurrect that behavior.
  const from = source.indexOf('// v95.55: the old default'), to = source.indexOf('export default function AddStatusSheet', from);
  assert.ok(from >= 0 && to > from); source = source.slice(0, from) + source.slice(to);
  fs.writeFileSync(path, source);
}
const timePath = 'source/src/modules/editor/components/EditorTimeControlsV110.jsx';
let time = read(timePath);
if (!time.includes('maxMinute=1440')) {
  assert.ok(time.includes("live=false,timeZone=''"));
  time = time.replace("live=false,timeZone=''", "live=false,timeZone='',maxMinute=1440");
  time = time.replace("Math.min(edge==='start'?1439:1440,value+d)", "Math.min(edge==='start'?Math.min(1439,maxMinute-1):maxMinute,value+d)");
  time = time.replace('aria-label="Start time" type="time" step="60"', 'aria-label="Start time" type="time" step="60" max={editorTimeInput(Math.max(0,Math.min(1439,maxMinute-1)))}');
  time = time.replace('aria-label="End time" type="time" step="60"', 'aria-label="End time" type="time" step="60" max={maxMinute<1440?editorTimeInput(maxMinute):undefined}');
  time = time.replace('<label className="midnight-end-v110">', '{maxMinute===1440 && <label className="midnight-end-v110">').replace(' />End at 24:00</label>', ' />End at 24:00</label>}');
}
if (!time.includes('allowMidnightInput=false')) {
  time = time.replace('maxMinute=1440', 'maxMinute=1440,allowMidnightInput=false').replace("disabled={end==='24:00'}", "disabled={end==='24:00' && !allowMidnightInput}");
}
fs.writeFileSync(timePath, time);
const VERSION = '110.3.14', BUILD = 'v110314-valid-insert-time-controls';
for (const file of ['release-version.json', 'public/app-version.json']) {
  const data = JSON.parse(read(file));
  Object.assign(data, {version:VERSION,build:BUILD,force:false,label:'v110.3.14 Valid Insert time controls',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
    notes:['Insert opens with an elapsed interval ending at Now.','Time fields, graph handles, quick choices and duration presets stay within the log day’s elapsed time.','Current OFF/SB/ON resumes after the inserted interval.']});
  fs.writeFileSync(file, JSON.stringify(data,null,2)+'\n');
}
for (const file of ['package.json','package-lock.json']) {const data=JSON.parse(read(file));data.version=VERSION;if(data.packages?.[''])data.packages[''].version=VERSION;fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');}
for(const [file,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]) {let text=read(file);for(const [suffix,value] of [['VERSION',VERSION],['BUILD',BUILD]])text=text.replace(new RegExp(`const ${name}_${suffix}\\s*=\\s*['\"][^'\"]+['\"];?`),`const ${name}_${suffix} = '${value}';`);fs.writeFileSync(file,text);}
for(const file of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(file,read(file).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
const graphTest = 'scripts/test-duty-graph-continuity.mjs';
const old = "assert.equal(meta.version,'110.3.13');assert.equal(meta.build,'v110313-elapsed-manual-insert');";
const next = `assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`;
assert.ok(read(graphTest).includes(old)||read(graphTest).includes(next));fs.writeFileSync(graphTest,read(graphTest).replace(old,next));
console.log('PASS — Insert initialization, fields, shortcuts and graph time controls 110.3.14 applied');
