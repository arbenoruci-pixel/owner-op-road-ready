import fs from 'node:fs';
import assert from 'node:assert/strict';
function patch(file,before,after){const src=fs.readFileSync(file,'utf8');if(src.includes(after))return;assert.equal(src.split(before).length,2,file+' / '+before);fs.writeFileSync(file,src.replace(before,()=>after));}
fs.copyFileSync('scripts/shipment-closeouts/core.js','source/src/modules/loads/shipmentCompletionReviews.js');
fs.copyFileSync('scripts/shipment-closeouts/client.js','lib/owner-op-cloud/shipmentCompletionReviews.js');
const app='source/src/app/App.jsx';
patch(app,"import HomeScreen from", "import {useShipmentCompletionReviews} from '../../../lib/owner-op-cloud/shipmentCompletionReviews.js';\nimport HomeScreen from");
patch(app,'  const [state, setState] = useState(defaultInitialState);',`  const [savedState, setState] = useState(defaultInitialState);
  const shipmentReviews=useShipmentCompletionReviews();
  const state=useMemo(()=>({...savedState,shipmentCompletionReviewsV1:shipmentReviews}),[savedState,shipmentReviews]);`);
const filing='source/src/modules/scan/shipmentFiling.js';
patch(filing,"import {libraryScanCandidates}","import {shipmentCompletionReview} from '../loads/shipmentCompletionReviews.js';\nimport {libraryScanCandidates}");
patch(filing,'(pickup|pick up|loading|hooked?)','(pickup|pick(?:ed)? up|loading|hook(?:ed)?)');
patch(filing,"  const ref=refs(event)[0];", "  if(event.noLoadDeclared===true)continue;\n  const ref=[event.pickedUpLoadNo,event.loadNo,event.shippingDocs,event.bol].map(number).find(Boolean);");
patch(filing,"/\\b(delivery|unloading|delivered)\\b/i.test(activity(e.event))&&refs(e.event).some(r=>key(r)===key(ref))", "(key(e.event.deliveredLoadNo)?key(e.event.deliveredLoadNo)===key(ref):/\\b(delivery|unloading|delivered|drop|dropped|unhook)\\b/i.test(activity(e.event))&&[e.event.loadNo,e.event.shippingDocs,e.event.bol].some(r=>key(r)===key(ref)))");
patch(filing,'  const completed=deliveries.length>0', '  const completionReview=shipmentCompletionReview(state,event,day);\n  const completed=Boolean(completionReview)||deliveries.length>0');
patch(filing,"status:completed?'completed':'open',active:!completed", "shipmentCompletionReview:completionReview,status:completed?'completed':'open',active:!completed");
const current='source/src/modules/loads/currentLoadV110473.js';
patch(current,"import {routeHistoryIndex}","import {shipmentCompletionReview} from './shipmentCompletionReviews.js';\nimport {routeHistoryIndex}");
patch(current," if(last?.kind==='pickup')return 'in_transit';", " if(last?.kind==='pickup')return shipmentCompletionReview(state,last.event,last.day,last.driverId)?'delivered':'in_transit';");
patch(current,"  if(!canonical)return {...raw,identity:'reference',shipmentReference:raw.loadNo,canonicalLoadNo:''};",`  if(!canonical){
   const latest=routeHistoryIndex(scoped).events.filter(({day,event})=>(day<at.day||day===at.day&&Number(event.startMin)<=at.minute)&&event.status==='ON'&&
    [event.loadNo,event.shippingDocs,event.bol,event.pickedUpLoadNo].some(value=>ref(value)===ref(raw.loadNo))&&/\\b(pickup|pick(?:ed)? up|loading|hook(?:ed)?)\\b/i.test([event.note,event.description,...list(event.reasons)].join(' '))&&!/\\bunloading\\b/i.test(event.note||'')).at(-1);
   if(latest&&shipmentCompletionReview(state,latest.event,latest.day,latest.driverId))return null;
   return {...raw,identity:'reference',shipmentReference:raw.loadNo,canonicalLoadNo:''};
  }`);
const picker='source/src/modules/scan/loadPickerV110472.js';
patch(picker,'const complete=operation?closed(operation):closed(candidate.operationalStatus)||closed(candidate.status);',"const complete=Boolean(candidate.shipmentCompletionReview)||(operation?closed(operation):closed(candidate.operationalStatus)||closed(candidate.status));");
console.log('PASS — explicit shipment completion confirmations project without rewriting duty records');
