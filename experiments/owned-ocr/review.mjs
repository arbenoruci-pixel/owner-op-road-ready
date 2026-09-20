// Offline review artifact. No remote scripts, network calls, or application writes.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readDocument,resolveEvidence} from '../../packages/smart-reader-core/src/index.js';
import {applyFormat} from './format-memory.mjs';

const directory=path.resolve(process.argv[2]);
const input=JSON.parse(fs.readFileSync(path.join(directory,'input.json'),'utf8'));
const metadata=JSON.parse(fs.readFileSync(path.join(directory,'metadata.json'),'utf8'));
for(const asset of metadata.assets){
  if(!/^page-\d+\.png$/.test(asset.file))throw new Error('Review images must be local page PNG files');
  if(createHash('sha256').update(fs.readFileSync(path.join(directory,asset.file))).digest('hex')!==asset.sourceImageId)
    throw new Error('Source image changed; rebuild the review from the original document');
}
const result=readDocument(input);
result.formatSuggestions=[];
if(process.argv[3]){
  const selection=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
  if(!Array.isArray(selection.memories)||selection.memories.length>100)throw new Error('Supply at most 100 reviewed layout memories');
  result.formatSuggestions=selection.memories.flatMap(memory=>applyFormat(input,memory,selection));
}
const hasOwnedPixels=result.pages.some(p=>p.observations.some(o=>o.source.startsWith('owned-line-reader-')));
// The core's "supported" state concerns rule/evidence agreement. An uncalibrated
// recognizer must still be presented as review-required even if a regex matches.
if(hasOwnedPixels) for(const group of result.documents){
  for(const field of Object.values(group.fields)) if(field.status==='supported'){
    field.status='needs_review';
    field.issues=[...new Set([...field.issues,'owned_recognizer_uncalibrated'])];
  }
  group.requiresReview=true;group.canAutoFile=false;
}
for(const group of result.documents) for(const field of Object.values(group.fields))
  for(const candidate of field.candidates) for(const evidence of [...candidate.evidence,...(candidate.labelEvidence||[]),...(candidate.continuationEvidence||[])]){
    resolveEvidence(result,evidence);
    if(!metadata.assets.some(asset=>asset.pageId===evidence.pageId&&asset.sourceImageId===evidence.sourceImageId))
      throw new Error('Evidence has no matching original page image');
  }
fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify({...result,ownedReader:metadata},null,2)+'\n');
const serialized=JSON.stringify({result,metadata}).replace(/</g,'\\u003c');
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Road Ready · Reader review</title><style>
:root{font:16px system-ui,sans-serif;color:#172e30;background:#eef3f0}*{box-sizing:border-box}body{margin:0}
header{padding:24px 32px;background:#123e3d;color:white;display:flex;justify-content:space-between;gap:20px;align-items:center}
h1{font-size:24px;margin:0 0 6px}header p{margin:0;color:#d4e3de}.badge{border:1px solid #82a69b;padding:8px 12px;border-radius:20px;white-space:nowrap}
main{display:grid;grid-template-columns:minmax(290px,390px) 1fr;gap:24px;padding:24px;max-width:1600px;margin:auto}
aside{max-height:85vh;overflow:auto}.card{background:white;border:1px solid #dae4df;border-radius:12px;padding:16px;margin-bottom:12px}
h2{font-size:17px;margin:0 0 12px}.field{padding:12px 0;border-top:1px solid #edf0ed}.label{font-size:12px;text-transform:uppercase;color:#60746e;letter-spacing:.04em}
.value{display:block;font-size:17px;margin:5px 0;overflow-wrap:anywhere}.state{font-size:12px;color:#796424}
button,select{font:inherit;border:1px solid #bbcec5;border-radius:7px;padding:7px 10px;background:#f4f8f5;color:#174e41;cursor:pointer;margin-top:7px}
button:hover{background:#e1eee8}.viewer{background:white;padding:16px;border-radius:12px;align-self:start;min-width:0}.page{position:relative;margin-top:12px}
.page img{display:block;width:100%}.mark{position:absolute;border:3px solid #d47b18;background:#ffd06340;pointer-events:none;display:none}
#quote{padding:12px;background:#f0f5f0;border-radius:7px;min-height:42px;white-space:pre-wrap;overflow-wrap:anywhere}.note{font-size:13px;color:#64766f;line-height:1.5}
@media(max-width:760px){main{grid-template-columns:1fr;padding:12px;gap:12px}header{padding:20px;flex-wrap:wrap}aside{max-height:none}.viewer{order:-1}}
</style></head><body><header><div><h1>Road Ready / Reader</h1><p>Check every value against the original document.</p></div><span class="badge">Experimental · Review required</span></header>
<main><aside id="fields"></aside><section class="viewer"><label for="pages">Original page </label><select id="pages"></select><p id="quote">Choose a value to see its source.</p><div class="page"><img id="original" alt="Original document page"><div class="mark" id="mark"></div></div><p class="note">Nothing is saved to your logbook. Downloaded results remain unconfirmed. Check handwritten notes and any details printed inside images on the original page.</p><button id="download">Download review JSON</button></section></main>
<script type="application/json" id="data">${serialized}</script><script>
const {result,metadata}=JSON.parse(document.getElementById('data').textContent);
const select=document.getElementById('pages'),img=document.getElementById('original'),mark=document.getElementById('mark');
for(const asset of metadata.assets){const option=document.createElement('option');option.value=asset.pageId;option.textContent=asset.pageId.replace('-',' ');select.append(option);}
function show(pageId,evidence){const asset=metadata.assets.find(a=>a.pageId===pageId);if(!asset)return;select.value=pageId;img.src=asset.file;mark.style.display='none';if(evidence){document.getElementById('quote').textContent=evidence.quote;if(evidence.box&&evidence.sourceImageId===asset.sourceImageId){const b=evidence.box;Object.assign(mark.style,{display:'block',left:b.x*100+'%',top:b.y*100+'%',width:b.width*100+'%',height:b.height*100+'%'});}}}
select.onchange=()=>{document.getElementById('quote').textContent='Choose a value to see its source.';show(select.value);};
for(const group of result.documents){const card=document.createElement('section');card.className='card';const title=document.createElement('h2');title.textContent=group.kind.replaceAll('_',' ');card.append(title);
for(const [key,field] of Object.entries(group.fields)){const row=document.createElement('div');row.className='field';const label=document.createElement('div');label.className='label';label.textContent=field.label||key.replaceAll('_',' ');row.append(label);const value=document.createElement('strong');value.className='value';value.textContent=field.value==null?'Needs review':typeof field.value==='object'?JSON.stringify(field.value):String(field.value);row.append(value);const state=document.createElement('div');state.className='state';state.textContent=({supported:'Read from document',missing:'Not found',needs_review:'Check this value',confirmed:'Confirmed'})[field.status]||'Check this value';row.append(state);
for(const candidate of field.candidates.slice(0,5)){const evidence=candidate.evidence[0];if(!evidence)continue;const button=document.createElement('button');button.textContent=String(candidate.rawValue)+' · View source';button.onclick=()=>show(evidence.pageId,evidence);row.append(button);}card.append(row);}document.getElementById('fields').append(card);}
for(const [index,group] of result.documents.entries()){
if(Object.keys(group.fields).length)continue;
const card=document.getElementById('fields').children[index],notice=document.createElement('p');notice.className='note';notice.textContent='The document type was not identified. Review the extracted text below; it may contain mistakes.';card.append(notice);
for(const page of result.pages.filter(p=>group.pageIds.includes(p.id))){const observation=page.observations[0];for(const line of observation?.lines||[]){if(!line.text.trim())continue;const button=document.createElement('button');button.textContent=line.text;button.onclick=()=>show(page.id,{quote:line.text,box:line.box,sourceImageId:observation.sourceImageId});card.append(button);}}
}
if(!result.documents.length){document.getElementById('fields').textContent='No supported document type was identified. Inspect the original page.';}
if(result.formatSuggestions.length){const card=document.createElement('section');card.className='card';const title=document.createElement('h2');title.textContent='Suggestions from your saved format';card.append(title);for(const suggestion of result.formatSuggestions){const row=document.createElement('div');row.className='field';const label=document.createElement('div');label.className='label';label.textContent=suggestion.field+' · Needs review';const button=document.createElement('button');button.textContent=suggestion.rawValue+' · View source';button.onclick=()=>show(suggestion.pageId,suggestion.evidence);row.append(label,button);card.append(row);}document.getElementById('fields').prepend(card);}
document.getElementById('download').onclick=()=>{const blob=new Blob([JSON.stringify({...result,ownedReader:metadata},null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='owned-reader-review.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);};show(metadata.assets[0].pageId);
</script></body></html>`;
fs.writeFileSync(path.join(directory,'review.html'),html);
console.log(JSON.stringify({review:path.join(directory,'review.html'),pages:result.pages.length,documents:result.documents.length,automaticAcceptance:false}));
