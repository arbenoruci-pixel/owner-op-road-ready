import fs from 'node:fs';
import assert from 'node:assert/strict';
import {PROFILES} from '../../packages/smart-reader-core/src/profiles.js';
const read=path=>fs.readFileSync(path,'utf8');
function patch(path,before,after){const source=read(path);if(source.includes(after))return;assert.equal(source.split(before).length-1,1,'Fullscreen reader anchor: '+path);fs.writeFileSync(path,source.replace(before,after));}
const scan='source/src/modules/scan/';
fs.copyFileSync('scripts/v110369/ReaderPreview.jsx',scan+'OwnedReaderPreview.jsx');
fs.copyFileSync('scripts/v110369/SourceFocus.jsx',scan+'OwnedReaderSourceFocusV110360.jsx');
const css='source/src/command-center.css',block=read('scripts/v110369/fullscreenReview.css');
if(!read(css).includes('FULLSCREEN_READING_V110369'))fs.appendFileSync(css,'\n'+block);
const reread='source/src/modules/owneros/SavedDocumentRereadV110347.jsx';
patch(reread,'async function save() {','async function save(value) {\n    const currentReview=value?.analysis===analysis?readingWithSuggestions(value):review;');
patch(reread,"if (saving.current || !review || review.analysis !== analysis) return;","if (saving.current || !currentReview || currentReview.analysis !== analysis) return;");
patch(reread,'baseline.current, review.summary','baseline.current, currentReview.summary');
patch(reread,"} catch (failure) { setStatus('review'); setError(`Reading was not saved. ${failure.message || ''}`.trim()); }", "} catch (failure) { setStatus('review'); setError(`Reading was not saved. ${failure.message || ''}`.trim()); if(value?.analysis===analysis)throw failure; }");
patch(reread,'signal={controller.current?.signal} defaultExpanded/>','signal={controller.current?.signal} defaultExpanded onSaveReading={save}/>');

const filing={
 bill_of_sale:['equipment','documents','other',['truck_wallet','business'],['vin']],
 meal_receipt:['business','expenses','other',['expenses','tax'],['date','merchant','total']],
 grocery_receipt:['business','expenses','other',['expenses','tax'],['date','merchant','total']],
 lodging_receipt:['business','expenses','other',['expenses','tax'],['date','merchant','total']],
 shower_receipt:['business','expenses','other',['expenses','tax'],['date','total']],
 laundry_receipt:['business','expenses','other',['expenses','tax'],['date','total']],
 rental_receipt:['equipment','expenses','other',['expenses','truck_wallet'],['date','total']],
 dvir:['equipment','documents','other',['truck_wallet','maintenance'],['date','unitNumber']],
 roadside_inspection:['equipment','documents','other',['truck_wallet','driver_wallet'],['date']],
 ucr_registration:['business','documents','other',['business','truck_wallet'],['dotNumber']],
 purchase_order:['load','documents','other',['load_folder','business'],['poNumber']],
 customs_invoice:['load','documents','other',['load_folder','business'],['invoiceNumber']],
 customs_entry:['load','documents','other',['load_folder','business'],['entryNumber']],
 hazmat_shipping_paper:['load','documents','other',['load_folder','logbook'],['unNumber']],
 certificate_of_origin:['load','documents','other',['load_folder','business'],[]],
 lumper_authorization:['load','documents','other',['load_folder','billing'],['loadNo']],
};
const rows=Object.entries(filing).map(([id,[family,target,backend,stacks,required]])=>{
 const profile=PROFILES.find(p=>p.id===id);assert.ok(profile,id);
 return `  t(${[id,profile.label,profile.label,family,target,backend,stacks].map(JSON.stringify).join(',')},[[${profile.heading},90]],{required:${JSON.stringify(required)},priority:45,linkable:${stacks.includes('logbook')}}),`;
});
patch(scan+'truckDocumentCatalogV1040.js',"  t('other','Other Document'",rows.join('\n')+"\n  t('other','Other Document'");
// A Bill of Sale may be filed with a trip, but its VIN, auction and seller
// addresses never establish a load number, pickup or delivery destination.
patch(scan+'documentLayoutGuardV110337.js','  const primary=owned.documents.filter',`  const billOfSale=owned.documents.length===1&&owned.documents[0].kind==='bill_of_sale';
  if(billOfSale){
    const fields={...result.fields},fieldEvidence={...result.fieldEvidence},fieldConfidence={...result.fieldConfidence};
    for(const key of ['loadNo','orderNo','bolNo','poNumber','shipmentId','matchedLoadNo','canonicalLoadNo','origin','destination','pickupCity','pickupState','deliveryCity','deliveryState','broker','brokerName','shipper','consignee']){delete fields[key];delete fieldEvidence[key];delete fieldConfidence[key];}
    fields.references=[];fields.poNumbers=[];
    result={...result,fields,fieldEvidence,fieldConfidence,matchedLoad:null,matchedLoadNo:'',routing:{...result.routing,autoFile:false},
      evidenceReviewV11036:{...result.evidenceReviewV11036,evidence:fieldEvidence,suggestedLoad:null}};
  }
  const primary=owned.documents.filter`);
const home='source/src/modules/home/AdaptiveHomeV1038.jsx';
fs.copyFileSync('scripts/v110369/currentHomeLoad.js','source/src/modules/home/currentHomeLoadV110369.js');
patch(home,"import React, { useMemo } from 'react';", "import React, { useMemo } from 'react';\nimport {currentHomeLoad,cleanRoutePlace} from './currentHomeLoadV110369.js';\nimport {localDayKey} from '../../shared/utils/date.js';\nimport {nowMin} from '../../shared/utils/time.js';");
patch(home,'function ActiveLoad({ state, summary, activeLoad, snapshot,','function ActiveLoad({ state, summary, activeLoad, currentLoad, snapshot,');
patch(home,"const loadNo = guide?.loadNo || guide?.orderNo || activeLoad?.loadNo || 'Active load';","const loadNo = currentLoad?.loadNo || guide?.loadNo || guide?.orderNo || activeLoad?.loadNo || 'Active load';");
patch(home,"{guide?.origin || activeLoad?.origin || 'Pickup'} → {guide?.destination || activeLoad?.destination || 'Final delivery'}", "{currentLoad?.origin || cleanRoutePlace(activeLoad?.origin) || 'Pickup location needed'} → {currentLoad?.destination || cleanRoutePlace(activeLoad?.destination) || 'Delivery location needed'}");
patch(home,'<strong>{snapshot.percent}%</strong></header>','{guide?<strong>{snapshot.percent}%</strong>:null}</header>\n        {guide?<>');
patch(home,'      </section>\n      {!(snapshot.bolPresent',`        </>:<div className="adaptive-mission-actions-v1038"><button type="button" className="primary" onClick={()=>onSection('loads')}>Open load</button><button type="button" onClick={()=>onScan?.('rate_confirmation')}>Scan Rate Con</button></div>}
      </section>
      {!(snapshot.bolPresent`);
patch(home,'  const guide = useMemo(() => getActiveLoadGuideV103(props.state), [props.state, checklistStore]);',`  const selectedGuide = useMemo(() => getActiveLoadGuideV103(props.state), [props.state, checklistStore]);
  const currentLoad = currentHomeLoad(props.state,selectedGuide,{day:localDayKey(),minute:nowMin()});
  const guide=currentLoad?.guide||null;
  const scopedLoad=currentLoad?{...(props.activeLoad?.guideId===guide?.id?props.activeLoad:{}),...currentLoad,docs:props.activeLoad?.guideId===guide?.id?props.activeLoad?.docs||[]:[]}:null;`);
patch(home,'missionSnapshotV1038(progress, props.activeLoad), [progress, props.activeLoad]','missionSnapshotV1038(progress, scopedLoad), [progress, scopedLoad]');
patch(home,"const mode = homeModeV1038(guide, props.activeLoad);","const mode = homeModeV1038(guide, scopedLoad);");
patch(home,'summary:props.summary, activeLoad:props.activeLoad,','summary:props.summary, activeLoad:scopedLoad, currentLoad,');

patch(home,'useMemo(() => resolveDriverGuideV103(props.state, guide, checklistStore),','useMemo(() => guide?resolveDriverGuideV103(props.state, guide, checklistStore):{guide:null,steps:[]},');
patch(home,'onClick={onGuide}>Full mission','onClick={()=>onGuide?.(guide.id)}>Full mission');
const homeScreen='source/src/modules/home/HomeScreen.jsx';
patch(homeScreen,'onOpenGuide={() => setGuideOpen(true)}','onOpenGuide={id => setGuideOpen(id || true)}');
patch(homeScreen,'<SafeDriverMissionV10966 state={state} onBack={() => setGuideOpen(false)}',"<SafeDriverMissionV10966 state={typeof guideOpen==='string'?{...state,activeLoadGuideId:guideOpen}:state} onBack={() => setGuideOpen(false)}");
