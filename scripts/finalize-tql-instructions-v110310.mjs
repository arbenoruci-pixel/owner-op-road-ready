import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
function patch(p,before,after){const s=read(p);if(s.includes(after))return;assert.equal(s.split(before).length-1,1,`110.3.10 anchor ${p}: ${before.slice(0,70)}`);fs.writeFileSync(p,s.replace(before,after));}
const root='source/src/modules/scan/';
for(const name of ['loadDocumentEvidenceV110310.js','loadRiskReviewV110310.js','pdfFallbackQualityV110310.js'])fs.copyFileSync('scripts/v110310/'+name,root+name);
const router=root+'engines/isolatedDocumentRouterV10959.js';
patch(router,"import { preserveDocumentDecisionV11039 }", "import { qualifyLoadDocumentV110310 } from '../loadDocumentEvidenceV110310.js';\nimport { preserveDocumentDecisionV11039 }");
patch(router,'return qualifyRateConReferenceV11039(qualifyDocumentFieldsV11038(preserveDocumentDecisionV11039(result,enforceStructuralBolV11034)));','return qualifyLoadDocumentV110310(qualifyRateConReferenceV11039(qualifyDocumentFieldsV11038(preserveDocumentDecisionV11039(result,enforceStructuralBolV11034))));');
// Run after the common evidence stage as well, including manual type changes.
const review=root+'DocumentEvidenceV11036.js';
patch(review,"import { qualifyDocumentFieldsV11038 }", "import { qualifyLoadDocumentV110310 } from './loadDocumentEvidenceV110310.js';\nimport { qualifyDocumentFieldsV11038 }");
patch(review,'return qualifyDocumentFieldsV11038({...result,','return qualifyLoadDocumentV110310(qualifyDocumentFieldsV11038({...result,');
patch(review,'  });\n}', '  }));\n}');
const pdf=root+'pdfTextV102.js';
patch(pdf,"import { isPdfFileV100", "import { readablePdfFallbackV110310 } from './pdfFallbackQualityV110310.js';\nimport { isPdfFileV100");
patch(pdf,'const fallback = await readPdfTextV100(file, { onProgress:(value, text) => onProgress(.2 + value * .72, text) });','const fallback = readablePdfFallbackV110310(await readPdfTextV100(file, { onProgress:(value, text) => onProgress(.2 + value * .72, text) }));');
const risk=root+'rateConRiskReviewV10970.js';
patch(risk,"export const RATE_CON_RISK_REVIEW_VERSION", "import { extendLoadRiskReviewV110310 } from './loadRiskReviewV110310.js';\nexport const RATE_CON_RISK_REVIEW_VERSION");
patch(risk,'export function analyzeRateConRiskV10970(input={}) {','function analyzeRateConRiskBaseV110310(input={}) {');
if(!read(risk).includes('export function analyzeRateConRiskV10970'))fs.appendFileSync(risk,'\nexport function analyzeRateConRiskV10970(input={}) { return extendLoadRiskReviewV110310(analyzeRateConRiskBaseV110310(input),input); }\n');
const sheet=root+'SmartScanSheetV105.jsx';
patch(sheet,"selectedType === 'rate_confirmation' ? analyzeRateConRiskV10970", "['rate_confirmation','load_tender'].includes(selectedType) ? analyzeRateConRiskV10970");
patch(sheet,"{selectedType === 'rate_confirmation' && riskReview ?", "{['rate_confirmation','load_tender'].includes(selectedType) && riskReview ?");
patch(sheet,"riskReview.blocking ? 'Financial and compliance risks found' : 'No critical deductions detected'", "riskReview.items.length ? 'Load requirements and possible charges' : 'No matching risk clauses found in readable text'");
patch(sheet,'Every extracted page was checked for inspections, deductions, chargebacks, tracking, required apps, payment fees and departure restrictions.','Checks use readable document text. Review the original pages for additional terms, charges and requirements.');
patch(sheet,'No critical risk language was detected. Review the original before accepting the load.','No matching clauses were found in the readable text. Review all original pages before accepting the load.');
patch(sheet,'<span>3 · Document date</span>',"<span>3 · {analysis?.fields?.filingDateSource === 'pickup_date' ? 'Filing date (pickup)' : 'Document date'}</span>");
patch(sheet,'{!documentDate ? <em>Reader did not verify the date.</em> : null}',"{!documentDate ? <em>Reader did not verify the date.</em> : analysis?.fields?.filingDateSource === 'pickup_date' ? <em>Pickup date used for filing. This sheet has no separate issue date.</em> : null}");
patch(root+'truckDocumentCatalogV1040.js',"t('load_tender','Load Tender','Tender'", "t('load_tender','Load Tender / Instructions','Instructions'");
const assignment=root+'scanLoadAssignmentV11037.js';
patch(assignment,"ranked?.brokerIdentityConflict ? 'Broker identity conflicts. Choose the correct folder.' :", "ranked?.brokerIdentityConflict ? `Broker identity conflicts: document ${options.fields?.broker || 'broker'}; folder ${ranked.broker || 'broker'}. Choose the correct folder.` :");
const VERSION='110.3.10',BUILD='v110310-tql-instructions';
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.9');assert.equal(meta.build,'v110309-smart-scan-routing');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
for(const p of ['package.json','package-lock.json']){const d=JSON.parse(read(p));d.version=VERSION;if(d.packages?.[''])d.packages[''].version=VERSION;fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');}
for(const p of ['release-version.json','public/app-version.json']){const d=JSON.parse(read(p));Object.assign(d,{version:VERSION,build:BUILD,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,force:false,label:'v110.3.10 TQL instructions',notes:['Driver information sheets retain broker, reference and pickup filing date.','Only labeled carrier pay enters payment fields.','Tracking, detention and possible fee clauses appear in review.']});fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');}
for(const [p,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']])fs.writeFileSync(p,read(p).replace(new RegExp(`(const ${name}_VERSION = )['\"][^'\"]+['\"]`),`$1'${VERSION}'`).replace(new RegExp(`(const ${name}_BUILD = )['\"][^'\"]+['\"]`),`$1'${BUILD}'`));
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(p,read(p).replace(/App v\d+\.\d+\.\d+/g,`App v${VERSION}`).replace(/APP V\d+\.\d+\.\d+/g,`APP V${VERSION}`));
console.log('PASS — TQL instructions, payment evidence and risk review 110.3.10 installed');
