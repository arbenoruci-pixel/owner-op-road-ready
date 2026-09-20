import fs from 'node:fs';
import assert from 'node:assert/strict';
const ui='source/src/modules/scan/OwnedReaderPreview.jsx';
function patch(before,after){const source=fs.readFileSync(ui,'utf8');if(source.includes(after))return;assert.equal(source.split(before).length-1,1,'Weight flow anchor: '+before.slice(0,70));fs.writeFileSync(ui,source.replace(before,after));}
fs.copyFileSync('scripts/v110387/MeasurementReview.jsx','source/src/modules/scan/MeasurementReviewV110387.jsx');
patch("import MeasurementReview,{WeightUnitChoices} from './MeasurementReviewV110386.jsx';", "import MeasurementReview,{WeightUnitChoices} from './MeasurementReviewV110387.jsx';\nimport {reviewSteps} from '../../../../packages/smart-reader-core/src/reviewSteps.js';");
patch("  function sourceFor(group){return sourceOptions(group)[0]||null;}",`  function sourceFor(group){return sourceOptions(group)[0]||null;}
  function steps(current=result,seen=new Set()){
    return reviewSteps(current,{visited:seen,canGroup:proposal=>proposal.entries.every(entry=>Boolean(sources[entry.evidence.sourceImageId]))});
  }
  function viewWeightSource(groupId,key){
    openItem({groupId,key},result,true);setSelection(value=>({...value,returnToWeights:groupId}));
  }`);
patch("    const group=current.documents.find(g=>g.id===item.groupId),field=group.fields[item.key];",`    const group=current.documents.find(g=>g.id===item.groupId),field=group.fields[item.key];
    if(item.kind==='weights'){
      setSelection({groupId:group.id,weightGroup:true,keys:item.keys||['netWeight','tareWeight','weight']});setDraft('');setError('');return;
    }`);
patch("    const item=reviewQueue(next).find(q=>!visited.current.has(q.groupId+':'+q.key));", "    const item=steps(next,visited.current)[0];");
patch("  function skip(){visited.current.add(selection.groupId+':'+selection.key);advanceReview(result);}",`  function skip(){
    for(const key of selection.weightGroup?selection.keys:[selection.key])visited.current.add(selection.groupId+':'+key);
    advanceReview(result);
  }`);
patch("  function closeSource(){if(saving)return;retryGeneration.current++;setBusy(false);setSelection(null);setComplete(false);}",`  function closeSource(){
    if(saving)return;
    if(selection?.returnToWeights&&steps().some(item=>item.kind==='weights'&&item.groupId===selection.returnToWeights)){
      openItem({kind:'weights',groupId:selection.returnToWeights},result,true);return;
    }
    retryGeneration.current++;setBusy(false);setSelection(null);setComplete(false);
  }`);
patch("    update(next);setError('');\n  }\n  function download()", "    if(!selection?.weightGroup)visited.current.clear();\n    update(next);setError('');advanceReview(next);\n  }\n  function download()");
patch("  const queue=reviewQueue(result);", "  const queue=reviewQueue(result),reviewActions=steps();");
patch('<div className="owned-reader-recovery"><b>{queue.length} items to check</b><button type="button" disabled={!queue.length||busy} onClick={()=>openItem(queue[0])}>Fix next reading</button></div>', '<div className="owned-reader-recovery"><b>{queue.length} items to check{reviewActions.length<queue.length?` · ${reviewActions.length} review ${reviewActions.length===1?\'step\':\'steps\'}`:\'\'}</b><button type="button" disabled={!reviewActions.length||busy||saving} onClick={()=>openItem(reviewActions[0])}>Fix next reading</button></div>\n    {!queue.length&&result.documents.some(g=>g.fields.weight?.correction?.confirmationMethod===\'measurement_group\')?<p role="status" className="reader-weight-complete">Weights confirmed.{onSaveReading?\' Your confirmed values are ready to save.\':\' Save the document to keep this reading.\'}</p>:null}');
patch('      {selection?<>',`      {selection?.weightGroup?<>
        <header className="reader-review-header"><div><small>Three weights · one unit</small><h3 tabIndex={-1}>Shipment weights</h3></div><button type="button" aria-label="Close source" disabled={saving} onClick={closeSource}>Close</button></header>
        <div className="reader-weight-modal">
          <MeasurementReview key={result.documentId+':'+result.reviewRevision+':'+selection.groupId} group={result.documents.find(g=>g.id===selection.groupId)} sources={sources} disabled={busy||saving} onSource={key=>viewWeightSource(selection.groupId,key)} onConfirm={(unit,signature)=>confirmWeights(selection.groupId,unit,signature)}/>
          <button type="button" className="reader-review-skip" disabled={busy||saving} onClick={skip}>Skip weights for now</button>
        </div>
      </>:selection?<>`);
patch('onClick={closeSource}>Close</button></header>\n      {selection.evidence?', "onClick={closeSource}>{selection.returnToWeights?'Back to weights':'Close'}</button></header>\n      {selection.evidence?");
patch('onClick={()=>openItem(queue[0])}>Review remaining</button>', 'onClick={()=>openItem(reviewActions[0])}>Review remaining</button>');
const css='source/src/command-center.css',marker='/* WEIGHT_REVIEW_FLOW_V110387 */';
if(!fs.readFileSync(css,'utf8').includes(marker))fs.appendFileSync(css,'\n'+marker+'\n'+fs.readFileSync('scripts/v110387/measurementReview.css','utf8'));
console.log('PASS — main review groups weights, keeps source navigation and advances to save');
