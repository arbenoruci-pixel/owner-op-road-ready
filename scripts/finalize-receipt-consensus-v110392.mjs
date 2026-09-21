import fs from 'node:fs';
import assert from 'node:assert/strict';
const VERSION = '110.3.92', BUILD = 'v110392-lumper-receipt-consensus';
const read = path => fs.readFileSync(path, 'utf8');
assert.ok(['0.3.26','0.3.27'].includes(JSON.parse(read('packages/smart-reader-core/package.json')).version));
const identityPath='source/src/modules/scan/documentIdentityV110334.js';
let identity=read(identityPath);
const beforeImport="import {extraPageIdentity,attachmentRelationship,alignRateContinuationPages} from './ownedPageIdentityV110338.js';";
const afterImport="import {extraPageIdentity,attachmentRelationship,alignRateContinuationPages,hasMatchingReceiptIdentity} from './ownedPageIdentityV110338.js';";
if(!identity.includes(afterImport)){
  assert.equal(identity.split(beforeImport).length,2,'Receipt filing identity import');
  identity=identity.replace(beforeImport,afterImport);
}
const beforeVote='    const evidence=page.reads.map(inspectPageIdentity).filter(Boolean),ids=[...new Set(evidence.map(item=>item.typeId))];';
const afterVote=beforeVote+"\n    if(hasMatchingReceiptIdentity(analysis,page.page,ids))return {page:page.page,supporting:false,typeId:'lumper_receipt',conflicting:false,requiresTypeReview:false,evidence:['Matching receipt number and unloading structure across source readings']};";
if(!identity.includes(afterVote)){
  assert.equal(identity.split(beforeVote).length,2,'Receipt filing identity votes');
  identity=identity.replace(beforeVote,afterVote);
}
fs.writeFileSync(identityPath,identity);
fs.copyFileSync('scripts/owned-reader/pageIdentity.js','source/src/modules/scan/ownedPageIdentityV110338.js');
  const stamp = new Date().toISOString();
  for (const path of ['release-version.json', 'public/app-version.json']) {
    const value = JSON.parse(read(path));
    Object.assign(value, { version:VERSION, build:BUILD, force:false,
      label:'v110.3.92 Lumper receipt recognition', releasedAt:stamp, updatedAt:stamp,
      sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null,
      notes:['Recognize matching generic and lumper receipt readings as one receipt.',
        'Read clearly aligned receipt columns when two source readings agree.',
        'Keep conflicting amounts and uncertain source evidence under review.'] });
    fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
  }
  for (const path of ['package.json', 'package-lock.json']) {
    const value = JSON.parse(read(path)); value.version = VERSION;
    if (value.packages?.['']) value.packages[''].version = VERSION;
    fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
  }
  for (const [path, name] of [['source/src/core/update/appUpdate.js', 'FALLBACK_APP'], ['public/sw.js', 'OWNER_OP_SW']]) {
    let value = read(path);
    for (const [key, replacement] of [['VERSION', VERSION], ['BUILD', BUILD]]) {
      const pattern = new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`, 'g');
      assert.equal([...value.matchAll(pattern)].length, 1, path + ' release marker');
      value = value.replace(pattern, `const ${name}_${key} = '${replacement}';`);
    }
    fs.writeFileSync(path, value);
  }
  for (const path of ['source/src/modules/home/HomeScreen.jsx', 'source/src/shared/ui/ToolsSheet.jsx']) {
    fs.writeFileSync(path, read(path).replace(/App v\d+\.\d+\.\d+/g, 'App v' + VERSION).replace(/APP V\d+\.\d+\.\d+/g, 'APP V' + VERSION));
  }
  for (const path of ['scripts/test-duty-graph-continuity.mjs', 'scripts/test-editor-grips-v110355.mjs', 'scripts/verify-log-integrity-v1051.mjs', 'scripts/test-document-continuity-integration-v110375.mjs']) {
    fs.writeFileSync(path, read(path).replaceAll("'110.3.91'", "'" + VERSION + "'").replaceAll("'v110391-dot-day-continuity'", "'" + BUILD + "'"));
  }
  const locks = JSON.parse(read('module-locks.v1.json'));
  locks.release = VERSION;
  fs.writeFileSync('module-locks.v1.json', JSON.stringify(locks, null, 2) + '\n');

for(const path of ['scripts/browser-native-pdf-v110363.mjs','scripts/v110373/browser-reader-evidence.mjs','scripts/v110382/browser-bol.mjs','scripts/v110384/browser-rows.mjs','scripts/browser-ratecon-structure-v110388.mjs']){
  fs.writeFileSync(path,read(path).replaceAll("'0.3.25'","'0.3.26'"));
}
console.log('PASS — 110.3.92 receipt recognition, row evidence and PWA release identity');
