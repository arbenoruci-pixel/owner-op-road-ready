import fs from 'node:fs';
import assert from 'node:assert/strict';
const scan='source/src/modules/scan/';
const reader=scan+'imageReaderV110323.js';
function patch(path,before,after){
  const source=fs.readFileSync(path,'utf8');if(source.includes(after))return;
  assert.equal(source.split(before).length-1,1,'Reader recovery anchor: '+path+' '+before.slice(0,70));
  fs.writeFileSync(path,source.replace(before,after));
}
fs.copyFileSync('scripts/v110383/webOcr.js',scan+'webOcr.js');
// Scope the ranking cache to this reading. Every pass is evaluated once;
// changed photos, new OCR observations and explicit rereads get fresh results.
patch(reader,'  const bestPages=',`  const retryRanks=new WeakMap();
  const retryRank=pass=>{if(!retryRanks.has(pass))retryRanks.set(pass,Number(needsReadingRetry([pass])));return retryRanks.get(pass);};
  const bestPages=`);
patch(reader,'Number(needsReadingRetry([a]))-Number(needsReadingRetry([b]))','retryRank(a)-retryRank(b)');
for(const browser of ['scripts/browser-native-pdf-v110363.mjs','scripts/v110373/browser-reader-evidence.mjs']){
  fs.writeFileSync(browser,fs.readFileSync(browser,'utf8').replaceAll("'0.3.19'","'0.3.20'"));
}
console.log('PASS — bounded damaged-label recovery and completed OCR reuse installed');
