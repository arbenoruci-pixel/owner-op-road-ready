import fs from 'node:fs';
import assert from 'node:assert/strict';
const VERSION='110.3.94',BUILD='v110394-bol-form-reading';
const read=path=>fs.readFileSync(path,'utf8');
assert.equal(JSON.parse(read('packages/smart-reader-core/package.json')).version,'0.3.28');
function patch(path,before,after){const text=read(path);if(text.includes(after))return;assert.equal(text.split(before).length,2,path+' BOL form anchor');fs.writeFileSync(path,text.replace(before,after));}
patch('source/src/modules/scan/OwnedReaderPreview.jsx',
  "selection.candidate.continuationKind==='address'?'Address continuation:'",
  "selection.candidate.continuationKind==='weight_unit'?'Weight unit:':selection.candidate.continuationKind==='address'?'Address continuation:'");
patch('source/src/modules/scan/documentFieldSemanticsV11038.js',
  "weight:'Total weight',weightUnit:'Weight unit',totalPieces:'Total pieces',",
  "weight:'Total weight',weightUnit:'Weight unit',totalPieces:'Total pieces',netWeight:'Net weight',tareWeight:'Tare weight',totalUnits:'Total units',temperature:'Temperature setting instruction',");
patch('source/src/modules/scan/rateConSaveStabilityV10964.js',
  "'commodity','weight','totalPieces','pieces',",
  "'commodity','weight','netWeight','tareWeight','totalUnits','temperature','totalPieces','pieces',");
const stamp=new Date().toISOString();
for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(read(path));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.94 BOL form reading',releasedAt:stamp,updatedAt:stamp,
    sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
    notes:['Recognize short-form BOL consignment rows and separate total-weight units.',
      'Resolve repeated Ibs weight readings with exact source evidence.',
      'Keep B/8 identifier disagreements available for review.',
      'Preserve old confirmations and flag company form labels before filing.']});
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){
  const value=JSON.parse(read(path));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const [path,name]of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let value=read(path);
  for(const [key,replacement]of [['VERSION',VERSION],['BUILD',BUILD]]){
    const pattern=new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`,'g');
    assert.equal([...value.matchAll(pattern)].length,1,path+' release marker');
    value=value.replace(pattern,`const ${name}_${key} = '${replacement}';`);
  }
  fs.writeFileSync(path,value);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx']){
  fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
}
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs']){
  fs.writeFileSync(path,read(path).replaceAll("'110.3.93'","'"+VERSION+"'").replaceAll("'v110393-bol-source-evidence'","'"+BUILD+"'"));
}
for(const path of ['scripts/browser-native-pdf-v110363.mjs','scripts/v110373/browser-reader-evidence.mjs','scripts/v110382/browser-bol.mjs','scripts/v110384/browser-rows.mjs','scripts/browser-ratecon-structure-v110388.mjs']){
  fs.writeFileSync(path,read(path).replaceAll("'0.3.27'","'0.3.28'"));
}
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;
fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — 110.3.94 BOL form reading and PWA release identity');
