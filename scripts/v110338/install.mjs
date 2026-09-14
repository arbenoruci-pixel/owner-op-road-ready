import fs from 'node:fs';
import assert from 'node:assert/strict';
export function installReaderPacketsV110338(){
  const root='source/src/modules/scan/';
  for(const [source,target] of [['pageIdentity.js','ownedPageIdentityV110338.js'],['layoutGuard.js','documentLayoutGuardV110337.js'],['analysisAdapter.js','ownedReaderAdapter.js'],['ReaderPreview.jsx','OwnedReaderPreview.jsx']])fs.copyFileSync('scripts/owned-reader/'+source,root+target);
  fs.copyFileSync('packages/smart-reader-core/src/fieldGuards.js',root+'documentFieldGuardsV110336.js');
  const path=root+'documentIdentityV110334.js';
  let source=fs.readFileSync(path,'utf8');
  const before="  if(candidates.length>1)return {typeId:'other',confidence:0,status:'conflicting',reason:'Conflicting document headings on this page'};";
  const after="  if(!candidates.length){const extra=extraPageIdentity(s);if(extra)candidates.push(extra);}\n"+before;
  if(!source.includes(after)){
    assert.equal(source.split(before).length-1,1,'Additional page identity anchor');
    source="import {extraPageIdentity} from './ownedPageIdentityV110338.js';\n"+source.replace(before,after);
  }
  const mixedBefore="'Pages have conflicting document types. Check and separate the documents.'";
  const mixedAfter="pageTypes.some(p=>p.conflicting)?'A page has conflicting document types. Check its source.':'Different documents are included. Review each document below.'";
  if(!source.includes(mixedAfter)){
    assert.equal(source.split(mixedBefore).length-1,1,'Mixed packet message anchor');
    source=source.replace(mixedBefore,mixedAfter);
  }
  const patches=[
    ["conflicting:ids.length>1||evidence.some(e=>e.status==='conflicting'),evidence:","conflicting:ids.length>1||evidence.some(e=>e.status==='conflicting'),requiresTypeReview:evidence.length>0&&evidence.every(e=>e.requiresTypeReview||e.status==='needs_review'),evidence:"],
    ["if(types.length===1&&types[0]!=='other')return {typeId:types[0],confidence:.9,requiresTypeReview:false,pageTypes,reason:pageTypes.find(p=>p.typeId)?.evidence[0]};","if(types.length===1&&types[0]!=='other'){const requiresTypeReview=pageTypes.some(p=>p.requiresTypeReview);return {typeId:types[0],confidence:requiresTypeReview?.49:.9,requiresTypeReview,pageTypes,reason:pageTypes.find(p=>p.typeId)?.evidence[0]};}"]
  ];
  for(const [before,after] of patches)if(!source.includes(after)){
    assert.equal(source.split(before).length-1,1,'Structural identity review anchor');source=source.replace(before,after);
  }
  fs.writeFileSync(path,source);
}
