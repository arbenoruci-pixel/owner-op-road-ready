import fs from 'node:fs';
import assert from 'node:assert/strict';

const VERSION='110.3.4';
const BUILD='v110304-live-load-bol-editor';
const read=path=>fs.readFileSync(path,'utf8');
const write=(path,value)=>fs.writeFileSync(path,value);
function replaceExact(source,before,after,label){
  if(source.includes(after)) return source;
  const count=source.split(before).length-1;
  assert.equal(count,1,`110.3.4 anchor changed: ${label}; found ${count}`);
  return source.replace(before,after);
}

// Strong BOL structure wins after the isolated document engines have run.
{
  const path='source/src/modules/scan/engines/isolatedDocumentRouterV10959.js';
  let source=read(path);
  const importLine="import { truckDocumentTypeMetaV1040 } from '../truckDocumentCatalogV1040.js';\n";
  if(!source.includes(importLine)) source=importLine+source;
  if(!source.includes('enforceStructuralBolV11034')){
    if(source.includes('export async function analyzeTruckDocumentIsolatedV10959(')){
      source=source.replace('export async function analyzeTruckDocumentIsolatedV10959(','async function analyzeTruckDocumentIsolatedBaseV11034(');
    }else if(source.includes('export function analyzeTruckDocumentIsolatedV10959(')){
      source=source.replace('export function analyzeTruckDocumentIsolatedV10959(','function analyzeTruckDocumentIsolatedBaseV11034(');
    }else{
      throw new Error('110.3.4 isolated analyzer export missing');
    }
    source += [
      '',
      "function bolCleanV11034(value=''){return String(value||'').replace(/\\r/g,'').trim();}",
      "function bolDateV11034(text=''){const s=String(text);const m=s.match(/(?:^|\\n)\\s*DATE\\s*[:#-]?\\s*(\\d{1,2}[\\/-]\\d{1,2}[\\/-]\\d{2,4})/i)||s.match(/\\b(\\d{1,2}[\\/-]\\d{1,2}[\\/-]\\d{4})\\b/);return m?.[1]||'';}",
      "function bolPlaceV11034(text='',heading=''){const s=String(text);const i=s.toUpperCase().indexOf(String(heading).toUpperCase());if(i<0)return '';const block=s.slice(i,i+420);const m=block.match(/\\b([A-Z][A-Za-z .'-]{1,45},\\s*[A-Z]{2})(?:\\s+\\d{5})?\\b/i);return bolCleanV11034(m?.[1]||'');}",
      'export function enforceStructuralBolV11034(result={}){',
      "  const text=bolCleanV11034(result.text||result.rawText||result.ocrText||result.analysisText||'');",
      "  const compact=text.replace(/\\s+/g,' ');",
      "  const bolMatch=text.match(/\\bB[O0]L\\s*(?:N[O0]\\.?|NUMBER|#)\\s*[:#-]?\\s*([A-Z0-9-]{5,24})/i);",
      "  const bolNo=String(result.fields?.bolNo||bolMatch?.[1]||'').toUpperCase().replace(/[^A-Z0-9-]/g,'');",
      "  const shippingStructure=!!bolNo&&/\\bSHIP\\s+TO\\b/i.test(text)&&/\\bSHIP\\s+FROM\\b/i.test(text)&&/\\bCARRIER\\b/i.test(text);",
      '  if(!shippingStructure)return result;',
      '  const current=result.fields||{};',
      "  const trailer=bolCleanV11034((text.match(/\\bTRAILER\\s*[:#-]?\\s*([A-Z0-9-]{5,24})/i)||[])[1]||current.trailerNo||'').toUpperCase();",
      "  const carrier=bolCleanV11034((text.match(/(?:^|\\n)\\s*CARRIER\\s*[:#-]?\\s*([^\\n]{3,80})/i)||[])[1]||current.carrierName||current.carrier||'');",
      "  const totalWeight=Number(String((text.match(/TOTAL\\s+WEIGHT\\s*[:#-]?\\s*([0-9,]+(?:\\.[0-9]+)?)/i)||[])[1]||current.weight||'').replace(/,/g,''))||0;",
      "  const origin=current.origin||bolPlaceV11034(text,'SHIP FROM');",
      "  const destination=current.destination||bolPlaceV11034(text,'SHIP TO');",
      '  const date=current.documentDate||current.date||bolDateV11034(text);',
      "  const tql=/TOTAL\\s+QUALITY\\s+LOGISTICS|\\bTQL\\b/i.test(carrier+' '+compact);",
      "  const fields={...current,loadNo:bolNo,bolNo,documentDate:date,date,trailerNo:trailer||current.trailerNo||'',carrierName:carrier||current.carrierName||'',broker:tql?'Total Quality Logistics (TQL)':(current.broker||''),origin,destination,weight:totalWeight||Number(current.weight||0)};",
      "  const type=truckDocumentTypeMetaV1040('bol');",
      "  const missing=['loadNo','documentDate'].filter(key=>!fields[key]);",
      "  return {...result,type,detectedType:type,fields,confidence:Math.max(.96,Number(result.confidence||0)),needsReview:missing.length>0,method:String(result.method||'')+'+structural-bol-v11034',structuralBolV11034:true};",
      '}',
      'export async function analyzeTruckDocumentIsolatedV10959(file,options={}){return enforceStructuralBolV11034(await analyzeTruckDocumentIsolatedBaseV11034(file,options));}',
      ''
    ].join('\n');
  }
  write(path,source);
}

// Teach the isolated Rate Con engine that BOL NO + SHIP FROM/TO is BOL evidence.
{
  const path='source/src/modules/scan/engines/rateConfirmationEngineV1.js';
  let source=read(path);
  const before="const bolCore = /bill\\s+of\\s+lading|straight\\s+bill\\s+of\\s+lading/i.test(source) && /shipper/i.test(source) && /consignee/i.test(source) && !payTerms;";
  const after="const bolCore = (/(?:bill\\s+of\\s+lading|straight\\s+bill\\s+of\\s+lading|\\bB[O0]L\\s*(?:N[O0]\\.?|NUMBER|#))/i.test(source) && /(?:shipper|ship\\s+from)/i.test(source) && /(?:consignee|ship\\s+to)/i.test(source)) && !payTerms;";
  source=replaceExact(source,before,after,'Rate Con BOL evidence');
  write(path,source);
}

// Promote the latest active-day event carrying a load/BOL reference to a load candidate.
{
  const path='source/src/modules/documents/documentFoundationV105.js';
  let source=read(path);
  if(!source.includes('LIVE_LOAD_EVENT_CANDIDATE_V11034')){
    const marker=source.match(/\n\s*const info = state\.loadInfo \|\| \{\};/);
    assert.ok(marker,'110.3.4 loadInfo marker missing');
    const insert=`

  // LIVE_LOAD_EVENT_CANDIDATE_V11034
  const activeDayV11034=textV105(state.activeDay)||Object.keys(state.eventsByDay||{}).sort().at(-1)||'';
  const liveLoadEntryV11034=eventEntriesV105(state).filter(entry=>entry.day===activeDayV11034&&eventLoadRefsV105(entry.event).length).at(-1)||null;
  if(liveLoadEntryV11034){
    const event=liveLoadEntryV11034.event||{};
    const loadNo=eventLoadRefsV105(event)[0]||'';
    if(loadNo){
      const candidate=candidateSkeletonV105(loadNo);
      candidate.id=textV105(event.canonicalLoadId||'live_event_'+loadNo);
      candidate.active=true;candidate.status='open';candidate.sourceKinds=['live_duty_event'];
      candidate.updatedAt=liveLoadEntryV11034.at;candidate.latestActivityAt=liveLoadEntryV11034.at;
      if(isPickupEventV105(event))candidate.latestPickupAt=liveLoadEntryV11034.at;
      candidate.broker=normalizeCanonicalLoadNoV105(state.loadInfo?.loadNo||state.loadInfo?.shippingDocs)===loadNo?textV105(state.loadInfo?.broker):textV105(event.broker);
      candidate.origin=[textV105(event.city),stateCodeV105(event.state)].filter(Boolean).join(', ');
      candidate.destination=isDateLikePlaceV105(event.destination)?'':textV105(event.destination||[event.destinationCity,event.destinationState].filter(Boolean).join(', '));
      addAliasV105(candidate,'load_number',loadNo,'live_duty_event');
      addAliasV105(candidate,'bol_number',event.bol||event.shippingDocs,'live_duty_event');
      addAliasV105(candidate,'po_number',event.po,'live_duty_event');
      add(candidate);
    }
  }`;
    source=source.replace(marker[0],insert+marker[0]);
  }
  write(path,source);
}

// Fail closed in the visible scanner when broker identity rejected a numeric match.
// Also make type changes re-run load matching instead of preserving a stale folder.
{
  const path='source/src/modules/scan/SmartScanSheetV105.jsx';
  let source=read(path);
  if(!source.includes('safeSelectedLoadV11034')){
    const selectPattern=/^(\s*)setSelectedLoadNo\(loadNo\);/m;
    const match=source.match(selectPattern);
    assert.ok(match,'110.3.4 selected-load setter missing');
    source=source.replace(selectPattern,`${match[1]}const safeSelectedLoadV11034 = typeId === 'rate_confirmation' && !nextMatch.loadNo && /broker identity/i.test(String(nextMatch.reason || '')) ? '' : loadNo;\n${match[1]}setSelectedLoadNo(safeSelectedLoadV11034);`);
    source=source.replace(/setLinkToLogbook\(documentLinkableV1040\(typeId\) && Boolean\(loadNo\)\);/,"setLinkToLogbook(documentLinkableV1040(typeId) && Boolean(safeSelectedLoadV11034));");
  }
  source=source.replace(/\s*const keepLoad = selectedLoadNo;\s*applyResult\(result, keepLoad\);/,"\n    applyResult(result);");
  source=source.replace(/applyResult\(result, selectedLoadNo\);/,"applyResult(result);");
  write(path,source);
}

// Edit graph uses the same read-only midnight continuity as the main Log.
{
  const path='source/src/modules/editor/EditEventSheet.jsx';
  let source=read(path);
  const importLine="import { dutyViewEvents } from '../logbook/dutyViewV110212.js';\n";
  if(!source.includes(importLine)){
    const first=source.match(/^import[^\n]+\n/m)?.[0];
    assert.ok(first,'110.3.4 editor import anchor missing');
    source=source.replace(first,first+importLine);
  }
  if(!source.includes('editorGraphEventsV11034')){
    const previewLine="  const previewEvents = previewResultV11023.ok ? projectLogbookEvents(previewStateV11023,dayV110,clockV110.at) : projectedV110;";
    assert.ok(source.includes(previewLine),'110.3.4 editor preview anchor missing');
    source=source.replace(previewLine,previewLine+"\n  const editorExactEventsV11034=(previewStateV11023?.eventsByDay?.[dayV110]||[]).filter(row=>!row?.displayOnly&&!row?.syntheticCoverage&&!row?.carriedFromPreviousDay);\n  const editorGraphEventsV11034=dutyViewEvents(editorExactEventsV11034,previewEvents,{eventsByDay:previewStateV11023?.eventsByDay||state.eventsByDay||{},day:dayV110});");
    const eventProp=/events=\{previewEvents\}/;
    assert.ok(eventProp.test(source),'110.3.4 editor graph events prop missing');
    source=source.replace(eventProp,'events={editorGraphEventsV11034}');
    const selectStart='  function handleGraphSelect(nextId) {\n';
    assert.ok(source.includes(selectStart),'110.3.4 graph select handler missing');
    source=source.replace(selectStart,selectStart+"    const visibleV11034=editorGraphEventsV11034.find(row=>row.id===nextId);\n    if(visibleV11034?.displayOnly||visibleV11034?.syntheticCoverage||visibleV11034?.carriedFromPreviousDay)return;\n");
  }
  write(path,source);
}

for(const path of ['package.json','package-lock.json'])if(fs.existsSync(path)){
  const data=JSON.parse(read(path));data.version=VERSION;if(data.packages?.[''])data.packages[''].version=VERSION;write(path,JSON.stringify(data,null,2)+'\n');
}
const releasedAt=new Date().toISOString();
for(const path of ['release-version.json','public/app-version.json']){
  const meta=JSON.parse(read(path));Object.assign(meta,{version:VERSION,build:BUILD,force:true,releasedAt,updatedAt:releasedAt,label:'v110.3.4 Live Load BOL & Edit Graph',notes:['Photographed BOLs with BOL NO and SHIP TO/SHIP FROM structure are classified as Bill of Lading.','The current live duty event supplies current load identity so stale loadInfo cannot force an old folder.','Broker-rejected numeric matches stay rejected and changing type re-runs load matching.','Edit Duty Status shows the same read-only midnight continuity as the main Log.']});write(path,JSON.stringify(meta,null,2)+'\n');
}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let source=read(path);source=source.replace(new RegExp(`(const ${name}_VERSION = )['\"][^'\"]+['\"]`),`$1'${VERSION}'`).replace(new RegExp(`(const ${name}_BUILD = )['\"][^'\"]+['\"]`),`$1'${BUILD}'`);write(path,source);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])write(path,read(path).replace(/App v\d+\.\d+\.\d+/g,`App v${VERSION}`).replace(/APP V\d+\.\d+\.\d+/g,`APP V${VERSION}`));
console.log('PASS — 110.3.4 live-load BOL routing, safe folder matching and editor continuity applied');
