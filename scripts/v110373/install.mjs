import fs from 'node:fs';
import assert from 'node:assert/strict';
const path='source/src/modules/scan/OwnedReaderPreview.jsx';
function patch(before,after){const s=fs.readFileSync(path,'utf8');if(s.includes(after))return;assert.equal(s.split(before).length-1,1,'Reader evidence UI anchor: '+before.slice(0,80));fs.writeFileSync(path,s.replace(before,after));}
patch("import {clearestEvidence,clearestCandidate} from '../../../../packages/smart-reader-core/src/reviewEvidence.js';", "import {clearestEvidence,clearestCandidate} from '../../../../packages/smart-reader-core/src/reviewEvidence.js';\nimport {referenceDiscrepancies} from '../../../../packages/smart-reader-core/src/referenceDiscrepancies.js';");
patch('JSON.stringify(result,null,2)', 'JSON.stringify({...result,referenceWarnings:referenceDiscrepancies(result)},null,2)');
patch('  const queue=reviewQueue(result);', '  const queue=reviewQueue(result);\n  const referenceWarnings=referenceDiscrepancies(result);');
patch('      {group.boundaryReview?<p>Check whether these pages belong together.</p>:null}', `      {group.boundaryReview?<p>Check whether these pages belong together.</p>:null}
      {referenceWarnings.filter(w=>w.groupId===group.id).map((warning,i)=><div key={i} role="alert" className="reader-reference-warning-v373"><p>{warning.message}</p><p><b>{warning.value}</b> versus <b>{warning.expected}</b></p>{warning.status==='confirmed_difference'?<p>You confirmed the different source reference. These documents remain separate.</p>:null}<button type="button" onClick={()=>openItem({groupId:group.id,key:warning.key})}>Check document reference</button></div>)}`);
patch('Object.entries(group.fields).map(([key,field])', 'Object.entries(group.fields).filter(([,field])=>!field.displayWhenFound||field.candidates.length||field.correction).map(([key,field])');
patch('{candidate.rawValue} · Page {e.pageNumber}', "{candidate.continuationKind==='address'&&candidate.value?candidate.value:candidate.rawValue} · Page {e.pageNumber}");
patch("{selection.candidate.continuationKind==='party_block'?'Additional company line:':'Adjacent company suffix:'}", "{selection.candidate.continuationKind==='address'?'Address continuation:':selection.candidate.continuationKind==='party_block'?'Additional company line:':'Adjacent company suffix:'}");
const css='source/src/command-center.css',style='\n/* READER_REFERENCE_WARNING_V110373 */\n.reader-reference-warning-v373{padding:12px;border:1px solid currentColor;border-radius:10px;margin:12px 0;overflow-wrap:anywhere}.reader-reference-warning-v373 button{min-height:44px}\n';
if(!fs.readFileSync(css,'utf8').includes('READER_REFERENCE_WARNING_V110373'))fs.appendFileSync(css,style);
console.log('PASS — Reader shows full addresses, source-backed clauses and explicit reference mismatch review');
const legacyBrowser='scripts/browser-native-pdf-v110363.mjs';
fs.writeFileSync(legacyBrowser,fs.readFileSync(legacyBrowser,'utf8').replaceAll("assert.equal(result.engineVersion,'0.3.17')","assert.equal(result.engineVersion,'0.3.18')"));
