import fs from 'node:fs';
function replaceOnce(text,from,to) { if(text.split(from).length!==2)throw Error('Editor final contract anchor changed: '+from.slice(0,100));return text.replace(from,to); }
const appPath='source/src/app/App.jsx';
let app=fs.readFileSync(appPath,'utf8');
if(!app.includes('EDITOR_INSPECTION_INTENT_V110')) {
  app=replaceOnce(app,`      setState(current => {
        const result = applyLogbookEditorEdit(current,command);
        if (!result.ok || !result.changed) return current;
        return markDayRecert(result.state,command.day);
      });`, `      // EDITOR_INSPECTION_INTENT_V110: retain the explicit pre-trip confirmation.
      const editedPreview = checked.state?.eventsByDay?.[command.day]?.find(event => event.id === id);
      const activityChanged = ['status','note','reasons'].some(key => Object.hasOwn(command.patch,key));
      const acceptedInspection = checked.changed && activityChanged
        ? maybeAcceptInspectionForEvent(state,command.day,editedPreview) : false;
      setState(current => {
        const result = applyLogbookEditorEdit(current,command);
        if (!result.ok || !result.changed) return current;
        const edited = result.state.eventsByDay[command.day].find(event => event.id === id);
        let next = withAcceptedPreTripInspection(result.state,command.day,edited,acceptedInspection);
        const linked = current.inspectionByDay?.[command.day]?.sourceEventId === id;
        if (linked && ['status','startMin','endMin','city','state'].some(key => Object.hasOwn(command.patch,key))) {
          next = reconcilePreTripInspections(next,[command.day]);
        }
        return markDayRecert(next,command.day);
      });`);
  fs.writeFileSync(appPath,app);
}
const editPath='source/src/modules/editor/EditEventSheet.jsx';
let edit=fs.readFileSync(editPath,'utf8');
edit=edit.replaceAll('timeLabel(preview.startMin, true)','timeLabel(preview.startMin)').replaceAll('timeLabel(preview.endMin, true)','timeLabel(preview.endMin)');
fs.writeFileSync(editPath,edit);
const cssPath='source/src/logbook-editor-v110.css';
let css=fs.readFileSync(cssPath,'utf8');
if(!css.includes('EDITOR_ACCESSIBLE_PICKED_V110'))css+=`
/* EDITOR_ACCESSIBLE_PICKED_V110 */
.editor-ui-v110 .reason-pills button, .editor-ui-v110 .reason-pills button *, .editor-ui-v110 .insert-reason-grid button, .editor-ui-v110 .insert-reason-grid button * { color:inherit !important; -webkit-text-fill-color:currentColor !important; }
.editor-ui-v110 .reason-pills button.picked { color:#075643 !important; -webkit-text-fill-color:#075643 !important; }
.editor-ui-v110 .midnight-end-v110 { padding:0 !important; min-height:24px !important; }
.editor-ui-v110 .midnight-end-v110 input { margin:0 !important; min-height:18px !important; max-height:18px !important; padding:0 !important; }
`;
if(!css.includes('EDITOR_SAFE_LAYER_V11021'))css+=`
/* EDITOR_SAFE_LAYER_V11021: clear the floating account button/menu (19000/19001)
   while keeping the authentication gate (20000) above the editor. */
.editor-ui-v110 { z-index:19002 !important; }
`;
fs.writeFileSync(cssPath,css);
// Blurring an unchanged location is read-only. Calling the manual-location
// callback would otherwise erase GPS coordinates before a note-only save.
const locationPath='source/src/modules/editor/components/EditorLocationFields.jsx';
let location=fs.readFileSync(locationPath,'utf8');
const guard='    if (parsed.city !== city || parsed.state !== state) onLocationChange(parsed.city, parsed.state);';
if(!location.includes(guard))location=replaceOnce(location,'    onLocationChange(parsed.city, parsed.state);',guard);
fs.writeFileSync(locationPath,location);

// RESTORED_GRABBERS_V11021: closed-event Edit keeps the old large START/END
// grabbers. Live Driving still passes no onEditTime, so its times stay locked.
const graphPath='source/src/modules/graph/LogGraphV110.jsx';
let graph=fs.readFileSync(graphPath,'utf8');
if(!graph.includes('RESTORED_GRABBERS_V11021')) {
  graph=replaceOnce(graph,'  const height = editable ? 355 : 305;','  // RESTORED_GRABBERS_V11021\n  const height = editable ? 410 : 305;');
  const oldStart="    {editable && ['start','end'].map((edge,i)=>{";
  const start=graph.indexOf(oldStart);
  const end=graph.indexOf("    })}\n  </svg>;",start);
  if(start<0||end<0)throw new Error('LogGraph handle block changed');
  const replacement=`    {editable && (()=>{
      const sx=selected.x1, ex=selected.x2, y=selected.y, c=TRACE_COLORS[selected.event.status];
      const chipY=326, chipW=190, chipH=60, pad=chipW/2+12;
      const close=Math.abs(ex-sx)<210;
      const startChip=Math.max(G.left+pad,Math.min(G.width-G.right-pad,close?sx-115:sx));
      const endChip=Math.max(G.left+pad,Math.min(G.width-G.right-pad,close?ex+115:ex));
      const handle=(edge,x,cx)=><g key={edge} className="graph-handle-v110 graph-handle-large-v110" data-handle-edge={edge} role="slider" tabIndex="0" aria-label={\`\${edge} time handle\`} aria-valuemin={edge==='start'?0:1} aria-valuemax={edge==='start'?1439:1440} aria-valuenow={selected.event[edge+'Min']} aria-valuetext={timeLabel(selected.event[edge+'Min'])} onPointerDown={e=>drag(e,edge)} onKeyDown={e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();onEditTime(edge,Math.max(edge==='start'?0:1,Math.min(edge==='start'?1439:1440,selected.event[edge+'Min']+(e.key==='ArrowLeft'?-1:1))));}}} style={{touchAction:'none',cursor:'ew-resize'}}>
        <circle cx={x} cy={y} r="32" fill={c} opacity=".14" pointerEvents="none" />
        <circle cx={x} cy={y} r="18" fill="#fff" stroke={c} strokeWidth="4" pointerEvents="none" />
        <circle cx={x} cy={y} r="7" fill={c} pointerEvents="none" />
        <circle cx={x} cy={y} r="64" fill="transparent" />
        <rect x={cx-chipW/2} y={chipY} width={chipW} height={chipH} rx="20" fill="#111827" stroke="#fff" strokeWidth="4" />
        <text x={cx} y={chipY+25} textAnchor="middle" fill="#fff" fontSize="19" fontWeight="700" pointerEvents="none">{edge.toUpperCase()}</text>
        <text x={cx} y={chipY+47} textAnchor="middle" fill="#fff" fontSize="18" fontWeight="600" pointerEvents="none">{timeLabel(selected.event[edge+'Min'])}</text>
        <rect x={cx-chipW/2-18} y={chipY-18} width={chipW+36} height={chipH+36} rx="28" fill="transparent" />
      </g>;
      return <g className="edit-handles-large-v110" aria-label="Drag Start and End to edit event time">
        <rect x={Math.min(sx,ex)} y={G.top} width={Math.max(3,Math.abs(ex-sx))} height={4*G.row} fill={c} opacity=".07" pointerEvents="none" />
        <line x1={sx} x2={sx} y1={G.top} y2={G.top+4*G.row} stroke={c} strokeWidth="3" opacity=".55" pointerEvents="none" />
        <line x1={ex} x2={ex} y1={G.top} y2={G.top+4*G.row} stroke={c} strokeWidth="3" opacity=".55" pointerEvents="none" />
        {handle('start',sx,startChip)}
        {handle('end',ex,endChip)}
      </g>;
    })()}
`;
  graph=graph.slice(0,start)+replacement+graph.slice(end+"    })}\n".length);
}
fs.writeFileSync(graphPath,graph);

// Follow-up release on top of the concurrently published, reviewed 110.2.0.
const VERSION='110.2.1',BUILD='v110201-logbook-followup';
for(const p of ['release-version.json','public/app-version.json']){
 const meta=JSON.parse(fs.readFileSync(p,'utf8'));
 fs.writeFileSync(p,JSON.stringify({...meta,version:VERSION,build:BUILD,force:false,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null},null,2)+'\n');
}
for(const [p,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
 let s=fs.readFileSync(p,'utf8');
 s=s.replace(new RegExp(`(const ${name}_VERSION = )['\"][^'\"]+['\"]`),`$1'${VERSION}'`).replace(new RegExp(`(const ${name}_BUILD = )['\"][^'\"]+['\"]`),`$1'${BUILD}'`);
 fs.writeFileSync(p,s);
}
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/App v110\.2\.0/g,'App v'+VERSION).replace(/APP V110\.2\.0/g,'APP V'+VERSION));
console.log('Final editor: explicit inspection acceptance, readable activity text, GPS preservation and restored time grabbers; '+VERSION);
