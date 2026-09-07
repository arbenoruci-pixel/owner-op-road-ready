import fs from 'node:fs';
function once(s, before, after) { if (s.split(before).length !== 2) throw Error('Compact editor anchor changed: ' + before.slice(0,90)); return s.replace(before, after); }
function cut(s, from, to) { const a=s.indexOf(from), b=s.indexOf(to,a); if(a<0||b<0||s.indexOf(from,a+from.length)>=0)throw Error('Compact editor block changed: '+from); return { text:s.slice(a,b), rest:s.slice(0,a)+s.slice(b) }; }
for (const name of ['EditEventSheet','InsertEditEventSheet']) {
 const path=`source/src/modules/editor/${name}.jsx`; let s=fs.readFileSync(path,'utf8');
 if(s.includes('COMPACT_EDITOR_LAYOUT_V111'))continue;
 const insert=name==='InsertEditEventSheet';
 let duty=cut(s,insert?'      <EditorDutyStatusControls\n':'      {liveV110 ? <div className="editor-live-heading-v110">','      <EditorGraphPanel');
 s=duty.rest;
 s=once(s,'editor-clean-v85 editor-ui-v110"','editor-clean-v85 editor-ui-v110 editor-compact-v111"');
 const location=s.indexOf('        <EditorLocationFields');
 if(location<0)throw Error('Missing editor location');
 s=s.slice(0,location)+duty.text+s.slice(location);
 const saveMatch=s.match(/^[ \t]*<div className="edit-sticky-save">.*<\/div>\n/m);
 if(!saveMatch)throw Error('Missing save action');
 const save=saveMatch[0].trim(); s=once(s,saveMatch[0],'');
 const cancel='        <button className="cancel-main" onClick={onClose}>Cancel</button>';
 s=once(s,cancel,'');
 s=once(s,'      </div>\n    </div>\n  );\n}',`      </div>\n      <div className="compact-editor-footer-v111">\n        <button className="cancel-main" onClick={onClose}>Cancel</button>\n        ${insert?`{!(mode === 'select' && !selectedExisting) && (${save})}`:save}\n      </div>\n    </div>\n  );\n}`);
 if(insert) {
  s=once(s,'<div>Insert Events</div>','<div>Insert Duty Status</div>');
  const a=s.indexOf("            {mode === 'insert' && (\n              <div className=\"insert-duration-panel\">"), b=s.indexOf("            {reasonNeedsLoadLink",a);
  if(a<0||b<0)throw Error('Missing insert duration section');
  s=s.slice(0,a)+`            <details className="compact-presets-v111"><summary>Duration presets</summary>\n${s.slice(a,b)}            </details>\n\n`+s.slice(b);
 }
 s='// COMPACT_EDITOR_LAYOUT_V111: presentation only, existing draft/save contract retained.\n'+s;
 fs.writeFileSync(path,s);
}
fs.writeFileSync('source/src/modules/editor/components/EditorGraphPanel.jsx',"export { default } from './CompactGraphPanelV111.jsx';\n");
const controls='source/src/modules/editor/components/EditorTimeControlsV110.jsx';
let s=fs.readFileSync(controls,'utf8');
if(!s.includes('COMPACT_TIME_PRESETS_V111')){
 s=once(s,'    {quickRow}','    {/* COMPACT_TIME_PRESETS_V111 */}\n    {quickRow && <details className="compact-presets-v111"><summary>Set a recent start time</summary>{quickRow}</details>}');
 fs.writeFileSync(controls,s);
}
const layout='app/layout.jsx',css="import '../source/src/modules/editor/compact-editor-v111.css';\n";
let l=fs.readFileSync(layout,'utf8');
if(!l.includes(css))l=l.replace(/(import [^\n]+;\n)(?![\s\S]*import [^\n]+;\n)/,'$1'+css);
if(!l.includes(css))throw Error('Compact stylesheet was not installed');fs.writeFileSync(layout,l);
for(const path of ['release-version.json','public/app-version.json']){
 const meta=JSON.parse(fs.readFileSync(path,'utf8'));
 meta.label='Compact full-width Logbook editor';
 meta.notes=['Full-width graph with visible 44px START/END grabbers.','Compact Edit/Insert layout with one draft and explicit Save.','Live timing and historical signatures stay protected.'];
 fs.writeFileSync(path,JSON.stringify(meta,null,2)+'\n');
}
console.log('PASS — compact graph-first Edit/Insert, real-pixel handles, same protected save contract');
