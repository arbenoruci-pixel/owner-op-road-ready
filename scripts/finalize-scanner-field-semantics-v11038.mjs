import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
function patch(path,before,after){const s=read(path);if(s.includes(after))return;assert.equal(s.split(before).length-1,1,`110.3.8 anchor: ${path}: ${before.slice(0,100)}`);fs.writeFileSync(path,s.replace(before,after));}
const root='source/src/modules/scan/';
fs.copyFileSync('scripts/v11038/documentFieldSemanticsV11038.js',root+'documentFieldSemanticsV11038.js');
fs.copyFileSync('scripts/v11038/ScanEvidenceReviewV11038.jsx',root+'ScanEvidenceReviewV11036.jsx');
patch(root+'engines/documentEngineContractV1.js',"  const text = cleanTextV1([...textParts, ...fieldLines].join('\\n'));", "  const text = cleanTextV1(textParts.join('\\n')); // Parsed guesses stay in fields; they are never OCR evidence.");
const router=root+'engines/isolatedDocumentRouterV10959.js';
patch(router,"import { truckDocumentTypeMetaV1040 }", "import { qualifyDocumentFieldsV11038 } from '../documentFieldSemanticsV11038.js';\nimport { truckDocumentTypeMetaV1040 }");
patch(router,'export function reanalyzeTruckDocumentTypeIsolatedV10959(', 'function reanalyzeTruckDocumentTypeIsolatedBaseV11038(');
patch(router,'export async function analyzeTruckDocumentIsolatedV10959(file,options={}){return enforceStructuralBolV11034(await analyzeTruckDocumentIsolatedBaseV11034(file,options));}', `export async function analyzeTruckDocumentIsolatedV10959(file,options={}){return qualifyDocumentFieldsV11038(enforceStructuralBolV11034(await analyzeTruckDocumentIsolatedBaseV11034(file,options)));}
export function reanalyzeTruckDocumentTypeIsolatedV10959(analysis,typeId,context){return qualifyDocumentFieldsV11038(reanalyzeTruckDocumentTypeIsolatedBaseV11038(analysis,typeId,context));}`);
const qualifier=root+'DocumentEvidenceV11036.js';
patch(qualifier,"import { currentLiveBolContextV11035 }", "import { qualifyDocumentFieldsV11038 } from './documentFieldSemanticsV11038.js';\nimport { currentLiveBolContextV11035 }");
patch(qualifier,'  return {...result,\n    ...(changed?', '  return qualifyDocumentFieldsV11038({...result,\n    ...(changed?');
patch(qualifier,"    evidenceReviewV11036:{...review,text:undefined,fields:undefined,suggestedLoad:suggestion?{loadNo:suggestion.loadNo,day:suggestion.day,source:'active_pickup'}:null},\n  };", "    evidenceReviewV11036:{...review,text:undefined,fields:undefined,suggestedLoad:suggestion?{loadNo:suggestion.loadNo,day:suggestion.day,source:'active_pickup'}:null},\n  });");
const sheet=root+'SmartScanSheetV105.jsx';
patch(sheet,"import { qualifyScanResultV11036 }", "import { documentFieldRowsV11038 } from './documentFieldSemanticsV11038.js';\nimport { qualifyScanResultV11036 }");
const start=read(sheet).indexOf('function extractedRows(result = {}) {'),end=read(sheet).indexOf('\nfunction fieldLabel(',start);
if(!read(sheet).includes('return documentFieldRowsV11038(result);')){assert.ok(start>=0&&end>start);fs.writeFileSync(sheet,read(sheet).slice(0,start)+'function extractedRows(result = {}) { return documentFieldRowsV11038(result); }\n'+read(sheet).slice(end));}
patch(sheet,'extractedRows(analysis).map(([key, value]) => <span key={key}><b>{fieldLabel(key)}</b><em>{String(value)}</em></span>)','extractedRows(analysis).map(({key,label,value}) => <span key={key}><b>{label}</b><em>{value}</em></span>)');
patch(sheet,'<ConfirmCard label="Filed to" value={saved.record.canonicalLoadNo ? `Load ${saved.record.canonicalLoadNo}` : \'Needs Review\'} detail={saved.record.stopSequence ? `Stop ${saved.record.stopSequence} · ${saved.record.stopCompany || saved.record.stopLocation}` : saved.record.broker || \'Document Vault\'} tone="good"/>','<ConfirmCard label="Filed to" value={saved.record.canonicalLoadNo ? `Load ${saved.record.canonicalLoadNo}` : \'Needs Review\'} detail={!saved.record.canonicalLoadNo ? \'Choose a load folder after reviewing the document.\' : saved.record.stopSequence ? `Stop ${saved.record.stopSequence} · ${saved.record.stopCompany || saved.record.stopLocation}` : saved.record.broker || \'Load folder\'} tone={saved.record.canonicalLoadNo ? \'good\' : \'review\'}/>');
patch(sheet,'/> Save document</>',"/> {requiresLoad && (!selectedLoadNo || !documentDate) ? 'Save for review' : 'Save document'}</>");
const storage=root+'rateConSaveStabilityV10964.js';
patch(storage,"    'loadAssignmentStatusV11037','type','title'", "    'trailerNo','sealNo','proNumber','shipper','consignee','weightUnit','freightCharges','codAmount','loadAssignmentStatusV11037','type','title'");
const business='source/src/modules/business/businessStore.js';
patch(business,"    'loadNo','orderNo','legNo','bolNo'", "    'trailerNo','sealNo','proNumber','shipper','consignee','weightUnit','freightCharges','codAmount','loadNo','orderNo','legNo','bolNo'");
const css='source/src/command-center.css';if(!read(css).includes('/* scan-field-semantics-11038 */'))fs.appendFileSync(css,'\n/* scan-field-semantics-11038 */\n'+read('scripts/v11038/scanFieldReviewV11038.css'));
const VERSION='110.3.8',BUILD='v110308-labeled-shipping-fields';
patch('scripts/test-smart-scanner-v11036.mjs',"assert.equal(r.evidenceReviewV11036.evidence.bolNo.source,'unverified');", "assert.equal(r.fields.bolNo,undefined);assert.equal(r.evidenceReviewV11036.evidence.bolNo,undefined);");
patch('scripts/test-scanner-load-link-v11037.mjs','console.log(`${count} scanner assignment checks passed, including production sheet save/reopen handlers`);', `await test('BOL semantic fields survive the production UI and storage without false payment data',async()=>{
  resetStore();const ui=mount();await ui.scan({type:{id:'bol',label:'Bill of Lading'},confidence:.96,needsReview:true,text:'BILL OF LADING\\nBOL NO: 82004117\\nTRAILER: TR998877\\nSHIP FROM\\nSample Door Company\\nSHIP TO\\nSample Millwork\\nTOTAL WEIGHT: 26,787.42 LB\\nFOB SHIPPING POINT',fields:{loadNo:'82004117',bolNo:'82004117',poNumber:'INT',total:26787.42,gross:26787.42,documentTextLength:7722,needsFieldReview:true}});
  const details=ui.all().find(n=>n.type==='button'&&Array.isArray(n.props.children)&&n.props.children.some(c=>c?.props?.children==='Extracted details'));details.props.onClick();ui.render();
  assert.ok(ui.text().includes('BOL number'));assert.ok(!ui.text().includes('NEEDS FIELD REVIEW'));assert.ok(!ui.text().includes('Gross pay'));
  await ui.save();const raw=__scanIO.saved.at(-1).extracted,record=readBusinessStore().documents[0];
  assert.equal(raw.bolNo,'82004117');assert.equal(raw.trailerNo,'TR998877');assert.equal(raw.weight,26787.42);assert.equal(raw.total,undefined);assert.equal(raw.gross,undefined);assert.equal(raw.poNumber,undefined);
  assert.equal(record.extracted.bolNo,'82004117');assert.equal(record.extracted.trailerNo,'TR998877');assert.equal(record.documentDate,'');assert.equal(record.canonicalLoadNo,'');
});
console.log(\`\${count} scanner assignment checks passed, including production sheet save/reopen handlers\`);`);
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.7');assert.equal(meta.build,'v110307-evidence-only-load-link');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
for(const path of ['package.json','package-lock.json']){const data=JSON.parse(read(path));data.version=VERSION;if(data.packages?.[''])data.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(data,null,2)+'\n');}
for(const path of ['release-version.json','public/app-version.json']){const data=JSON.parse(read(path));Object.assign(data,{version:VERSION,build:BUILD,force:false,label:'v110.3.8 Shipping Document Fields',notes:['BOL, PO and load references use their own printed labels.','Weights and unverified amounts are excluded from payment fields on shipping documents.','Document evidence uses labeled excerpts and a readable phone layout.']});fs.writeFileSync(path,JSON.stringify(data,null,2)+'\n');}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']])fs.writeFileSync(path,read(path).replace(new RegExp(`(const ${name}_VERSION = )['\"][^'\"]+['\"]`),`$1'${VERSION}'`).replace(new RegExp(`(const ${name}_BUILD = )['\"][^'\"]+['\"]`),`$1'${BUILD}'`));
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,`App v${VERSION}`).replace(/APP V\d+\.\d+\.\d+/g,`APP V${VERSION}`));
console.log('PASS — labeled shipping fields and review 110.3.8 installed');
