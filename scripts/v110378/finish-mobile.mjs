import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const planned=[];
function fix(file,before,after,transform){
 const source=fs.readFileSync(file,'utf8');
 if(hash(source)===after)return;
 assert.equal(hash(source),before,'Unexpected pre-mobile runtime: '+file);
 const output=transform(source);
 assert.equal(hash(output),after,'Unexpected mobile result: '+file);
 planned.push({file,output});
}
function replace(source,before,after){
 assert.equal(source.split(before).length-1,1,'Mobile correction anchor: '+before.slice(0,100));
 return source.replace(before,after);
}
fix('source/src/shared/duty/DutyForm.jsx','0fbdbd4d6950b67c81b5d95af7bcf66f6db4cf5759fb0daf0b840625fe5601d2','f685f85503672acc18a8d7bbca2fa5a4757171c8f8fc96f486b1ce129579266a',source=>{
 source=replace(source,'onClose,onDelete,time,selection','onClose,onDelete,graph,time,selection');
 return replace(source,'    </header>\n    <div className="dd-body','    </header>\n    {graph?<div className="dd-graph-block" data-duty-section="timeline">{graph}</div>:null}\n    <div className="dd-body');
});
fix('source/src/modules/editor/EditEventSheet.jsx','8ee66cdc3b0280f7e5e601e58ce06d23572ed59d9d2c898d327a6c86699d3e07','892b1ac71073cecf2755ba871a4af02940922e9931130b504acc4b8066fbe0a0',source=>{
 source=replace(source,'    time={<>      <EditorGraphPanel','    graph={<EditorGraphPanel');
 return replace(source,'      />        <div className="selected-duration-live">','      />}\n    time={<><div className="selected-duration-live">');
});
fix('scripts/browser-midnight-prefix-v110319.mjs','3e727fbab7b001c9bc96fbdc46c64de91eb8a5f399c3fee6a20c25d7513e8043','983449ff39dec1f6152b2008163b4280bc87153a3b7522a062b6b07b23d65433',source=>replace(source,
 "page.getByPlaceholder('BOL or load reference',{exact:true})",
 "page.getByLabel('Load / order #',{exact:true})"));
fix('scripts/browser-motive-override-v11023.mjs','730bf98edb13eaa7559b477de059cc6ab6cefc8969b683af8d6eba7379d09d0c','41c5666ba455109d41021a6133e0fcd8f4fb95ed70325c5a00b5ff19dff94fe0',source=>replace(source,
 'assert.equal(paired.logbookEditHistoryByDay[day].length,1);',
 "assert.equal(paired.logbookEditHistoryByDay[day].length,2,'time edit and subsequent metadata edit each have an audit');assert.deepEqual(paired.logbookEditHistoryByDay[day][0],saved.logbookEditHistoryByDay[day][0]);assert.deepEqual(paired.logbookEditHistoryByDay[day][1].beforeEvents,saved.eventsByDay[day]);assert.deepEqual(paired.logbookEditHistoryByDay[day][1].afterEvents,paired.eventsByDay[day]);"));
fix('source/src/shared/duty/dutyForm.css','83203f119988887d825648c511e79416ee28e9548c6ddcf48bc1ce43ff936385','0765e6e3cbc26ad04291494d276061d4170a4540b4b213731682cd8b7d27c27a',source=>{
 source=source.replaceAll('html body .dd-root.driver-duty-form','html body .dd-root');
 source=source.replaceAll('html body .dd-root','html body .dd-root.driver-duty-form.dd-root.dd-root');
 source=source.replaceAll('background:transparent!important;padding:0!important;border:0!important}','background:white!important;padding:0!important;border:0!important}');
 source=replace(source,' .dd-body .dd-time-block{margin:0 -12px!important;width:calc(100% + 24px);max-width:100vw;padding:0!important;border:0!important;border-radius:0!important;overflow:visible}',
 ' .dd-body .dd-time-block{margin:0!important;width:100%!important;max-width:100%!important;padding:10px!important;overflow:visible}');
 return source+`
/* Keep the real timeline pinned while inputs scroll, as in the recorded editor.
   The repeated root class intentionally outranks legacy opt-in editor skins. */
html body .dd-root.driver-duty-form.dd-root.dd-root .dd-graph-block{flex:0 0 auto!important;min-width:0!important;width:100%!important;max-width:100%!important;margin:0!important;padding:0!important;background:#fff!important}
html body .dd-root.driver-duty-form.dd-root.dd-root .dd-graph-block .compact-graph-panel-v111:not(.graph-focus-v111){width:100%!important;max-width:100%!important;margin:0!important;padding:0!important}
html body .dd-root.driver-duty-form.dd-root.dd-root .dd-graph-block .editor-graph-card{width:100%!important;max-width:100%!important;margin:0!important;padding:0!important;border:0!important}
html body .dd-root.driver-duty-form.dd-root.dd-root .dd-graph-block svg.log-graph{display:block!important;width:100%!important;max-width:100%!important;margin:0!important}
html body .dd-root.driver-duty-form.dd-root.dd-root .dd-body{width:100%!important;max-width:100%!important;min-width:0!important;min-height:0!important}
html body .dd-root.driver-duty-form.dd-root.dd-root .dd-body>*,html body .dd-root.driver-duty-form.dd-root.dd-root .dd-selection,html body .dd-root.driver-duty-form.dd-root.dd-root .dd-field,html body .dd-root.driver-duty-form.dd-root.dd-root .dd-fields{width:100%!important;max-width:100%!important;min-width:0!important}
html body .dd-root.driver-duty-form.dd-root.dd-root .dd-fields label,html body .dd-root.driver-duty-form.dd-root.dd-root .driver-load-grid label{display:grid!important;min-width:0!important;max-width:100%!important;overflow-wrap:anywhere}
html body .dd-root.driver-duty-form.dd-root.dd-root input:not([type=checkbox]),html body .dd-root.driver-duty-form.dd-root.dd-root textarea{width:100%!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important}
html body .dd-root.driver-duty-form.dd-root.dd-root .modern-time-strip-v11027{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;width:100%!important;min-width:0!important;gap:12px!important}
html body .dd-root.driver-duty-form.dd-root.dd-root .modern-time-cell-v11027{width:100%!important;min-width:0!important;max-width:100%!important}
html body .dd-root.driver-duty-form.dd-root.dd-root .dd-time-block .modern-time-section-v11027,html body .dd-root.driver-duty-form.dd-root.dd-root .dd-time-block .start-time-section{border:0!important;padding:0!important;margin:0!important;border-radius:0!important}
html body .dd-root.driver-duty-form.dd-root.dd-root .dd-time-block .selected-duration-live{border:0!important;border-radius:0!important;background:white!important;margin:0 0 8px!important;min-height:0!important;padding:0!important;font-size:12px!important}
html body .dd-root.driver-duty-form.dd-root.dd-root .dd-header small{overflow:visible!important;text-overflow:clip!important;font-size:11px!important}
html body .dd-root.driver-duty-form.dd-root.dd-root .dd-activity-grid button{min-width:0!important;display:flex!important;justify-content:center!important;align-items:center!important}
html body .dd-root.driver-duty-form.dd-root.dd-root .quick-activities-v11023::before,html body .dd-root.driver-duty-form.dd-root.dd-root .quick-activities-v11023::after,html body .dd-root.driver-duty-form.dd-root.dd-root .dd-activity-grid button::before,html body .dd-root.driver-duty-form.dd-root.dd-root .dd-activity-grid button::after{content:none!important;display:none!important}
html body .dd-root.driver-duty-form.dd-root.dd-root .dd-footer .cancel-main,html body .dd-root.driver-duty-form.dd-root.dd-root .dd-footer .save-main,html body .dd-root.driver-duty-form.dd-root.dd-root .dd-footer .status-save{display:block!important;-webkit-text-fill-color:currentColor!important;min-width:0!important;transition:none!important}
html body .dd-root.driver-duty-form.dd-root.dd-root .dd-footer .save-main,html body .dd-root.driver-duty-form.dd-root.dd-root .dd-footer .status-save{width:100%!important}
html body .dd-root.driver-duty-form.dd-root.dd-root .dd-footer button:disabled{opacity:1!important;background:#dce7ef!important;color:#42566d!important;border-color:#cbd8e5!important;-webkit-text-fill-color:#42566d!important}
`;
});
// Validate every exact input and output before writing any runtime file.
for(const {file,output}of planned)fs.writeFileSync(file,output);
console.log('PASS — unified mobile layout isolated from legacy skins; full-width timeline stays pinned and metadata audits remain explicit');
