import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

// The v110378 installers intentionally reject later application generations.
// Preserve their exact pre-review inputs for the isolated installer fixtures;
// behavioral tests continue to import and exercise the final application.
const fixturePath='.release/reliability-duty-legacy.json';
const expected={
  'app/layout.jsx':'2f91e2f48f26658653edbc4db1faa73ecf29064105a217d32ef3fc7f67ef4935',
  'module-locks.v1.json':'ab952faf5fdd25fe7333a7ec2c3ee3ef68e5b734179ae1db0c5388b6ff02b8e3',
  'scripts/browser-editor-grips-v110355.mjs':'628b287ac434b64d2188cc9b5c2cef8ab8a771c5d047c95fc758a1b756a81d82',
  'scripts/browser-insert-interaction-v110316.mjs':'8df970e3063841a3970c8660d5814a95bdb2e2897efc4de4c7ae4b78d7b954fa',
  'scripts/browser-midnight-prefix-v110319.mjs':'5eb7361628c9932d081e813b29f9c7a6022ef300ba498a5f42414f289af03096',
  'scripts/browser-modern-editor-v11027.mjs':'de3b88d0929b034f97971129462a179e74d167bc2f26fc750cc94688ece963f0',
  'scripts/browser-motive-override-v11023.mjs':'33c3c8677dc36ff567fd1bc4331eafa274d98d52c0e12924d4ed1491c7c016c6',
  'source/src/core/integrity/logbookIntegrityV107.js':'54c83e9c2e5d9fd1a57f5f2587ae84a3b4408d28eec6e9424326493999e14e58',
  'source/src/core/integrity/pickupGuideIdentity.js':'700556f401345079095a8926d32b9a0dcae7b0dae752fab0179fead0fd8a363b',
  'source/src/core/routes/editedPickupReferencesV110378.js':'68c77294d27aef63fe400df76cf1ed2ca4330cc147ebc8488d475447994ee067',
  'source/src/modules/editor/EditEventSheet.jsx':'949eb89afba70c6463f702083c7fcb9e9b18625af994ed5e1e4c4f275d0d5af0',
  'source/src/modules/editor/components/EditorLocationFields.jsx':'34f5c6293df45ca72425e283fda34a7d02efc207d9e8a32d5fc16224eaca1058',
  'source/src/modules/logbook/DayLogScreen.jsx':'ca8577bc89e632085c180038875524caee4eaf02b458af2b28e35973b83e6629',
  'source/src/modules/logbook/eventEditingV110.js':'0df17e2433c360da033ba1d0cb8d2e3b888727caa48af14ca72e4eabcfc9811b',
  'source/src/modules/status/StatusWorkflowSheet.jsx':'bcdd61fe6438c83dcadcad1d67358eeb30bc63a4d27ae9de33aa13815792c362',
  'source/src/shared/duty/DutyForm.jsx':'f685f85503672acc18a8d7bbca2fa5a4757171c8f8fc96f486b1ce129579266a',
  'source/src/shared/duty/DutyLocation.jsx':'6af5f7715fd09296b867ecc8106e5b71f45d63c08445e6bae6728239cd9e6b38',
  'source/src/shared/duty/DutySelection.jsx':'dc983a41f058d4fec13ee159bca6be07132be93a298927ad3f411bdd3c91c21a',
  'source/src/shared/duty/dutyActivities.js':'52d42cc0c190cfc3a3fe0f8105cf882d3ed38dfa3a5b7d1a8ad6f21b4277dbb7',
  'source/src/shared/duty/dutyForm.css':'e1400b74e43f75cc1b799747c3ef1ba2dd9164ed7b34e676147083a38e32b23c',
};
const hash=text=>createHash('sha256').update(text).digest('hex');

function validateFixture(fixture) {
  assert.equal(fixture.format,'road-ready-legacy-duty-test-fixture');
  assert.equal(fixture.version,1);
  assert.deepEqual(Object.keys(fixture.files).sort(),Object.keys(expected).sort(),'Legacy fixture target set changed');
  for(const [file,digest]of Object.entries(expected)) {
    assert.equal(typeof fixture.files[file],'string','Legacy fixture source missing: '+file);
    assert.equal(hash(fixture.files[file]),digest,'Legacy fixture checksum mismatch: '+file);
  }
  return fixture.files;
}

export function readLegacyDutyFixture(root=process.cwd()) {
  return validateFixture(JSON.parse(fs.readFileSync(path.join(root,fixturePath),'utf8')));
}

export function captureLegacyDutyFixture(root=process.cwd()) {
  const fixture={format:'road-ready-legacy-duty-test-fixture',version:1,
    files:Object.fromEntries(Object.keys(expected).map(file=>[file,fs.readFileSync(path.join(root,file),'utf8')]))};
  validateFixture(fixture);
  const destination=path.join(root,fixturePath),text=JSON.stringify(fixture)+'\n';
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  if(fs.existsSync(destination)&&fs.readFileSync(destination,'utf8')===text)return {files:Object.keys(expected).length,changed:false};
  const temporary=destination+'.tmp';
  try {fs.writeFileSync(temporary,text);fs.renameSync(temporary,destination);}
  finally {if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
  return {files:Object.keys(expected).length,changed:true};
}

const target='scripts/v110378/test-review-regressions.mjs';
const marker="import {readLegacyDutyFixture} from '../reliability-release/legacy-duty-tests.mjs';\n";
const before="  for(const file of targets){fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.copyFileSync(file,path.join(dir,file));}";
const after="  const sources=readLegacyDutyFixture(process.cwd());\n  assert.deepEqual([...targets].sort(),Object.keys(sources).sort(),'Installer fixture uses its exact captured generation');\n  for(const file of targets){fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),sources[file]);}";
const originalHash='6904bf2e9d063a5acd06962b57b1882b194cb820d3c8fa994f76f9b4f912b079';

export function installLegacyDutyTests(root=process.cwd()) {
  const release=JSON.parse(fs.readFileSync(path.join(root,'release-version.json'),'utf8'));
  assert.equal(release.version,'110.4.78');assert.equal(release.reviewBuild,true);assert.equal(release.force,false);
  readLegacyDutyFixture(root);
  const file=path.join(root,target),source=fs.readFileSync(file,'utf8');
  if(source.startsWith(marker)) {
    assert.equal(source.split(after).length,2,'Legacy fixture adapter changed');
    const original=source.slice(marker.length).replace(after,before);
    assert.equal(hash(original),originalHash,'Legacy regression assertions changed');
    return {changed:false};
  }
  assert.equal(hash(source),originalHash,'Unexpected legacy regression test');
  assert.equal(source.split(before).length,2,'Legacy fixture copy anchor changed');
  const output=marker+source.replace(before,after);
  fs.writeFileSync(file,output);
  return {changed:true};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=installLegacyDutyTests(process.argv[2]||process.cwd());
  console.log(`PASS legacy duty installer fixture: ${result.changed?'adapted':'unchanged'}; exact stage inputs and all six regression assertions retained`);
}
