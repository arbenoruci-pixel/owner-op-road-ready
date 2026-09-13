import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = file => fs.readFileSync(file, 'utf8');
function patch(file, before, after) {
  const source = read(file);
  if (source.includes(after)) return;
  assert.equal(source.split(before).length - 1, 1, `Load identity anchor: ${file}`);
  fs.writeFileSync(file, source.replace(before, after));
}
function addImport(file, statement) {
  const source = read(file);
  if (source.includes(statement)) return;
  const directive = source.match(/^(['"])use client\1;\r?\n/)?.[0] || '';
  fs.writeFileSync(file, directive + statement + '\n' + source.slice(directive.length));
}
const scan = 'source/src/modules/scan/';
for (const name of ['legacyContractOriginals','recoverLegacyContractOriginals']) fs.copyFileSync(`scripts/v110327/${name}.js`,`${scan}${name}V110327.js`);
const ui=scan+'SmartScanSheetV105.jsx';
addImport(ui,"import {recoverLegacyContractOriginalsV110327} from './recoverLegacyContractOriginalsV110327.js';");
patch(ui,"  const store = useMemo(() => migrateBusinessStoreV105(readBusinessStore(), state), [state, stage]);",`  const [businessRevisionV110327,setBusinessRevisionV110327] = useState(0);
  useEffect(() => {
    const refresh = () => setBusinessRevisionV110327(value => value + 1);
    window.addEventListener('owner-op-business-updated',refresh);
    recoverLegacyContractOriginalsV110327().catch(() => {});
    return () => window.removeEventListener('owner-op-business-updated',refresh);
  },[]);
  const store = useMemo(() => migrateBusinessStoreV105(readBusinessStore(), state), [state, stage, businessRevisionV110327]);`);
const resume=scan+'savedScanResumeV110318.js';
addImport(resume,"import {savedDocumentConflictV110326} from '../loads/loadIdentityV110326.js';");
patch(resume,"  const type = truckDocumentTypeMetaV1040(typeId);", "  if (typeId === 'rate_confirmation' && (!text || savedDocumentConflictV110326({...record,type:typeId,extracted:fields}))) return null;\n  const type = truckDocumentTypeMetaV1040(typeId);");
const identity='source/src/modules/loads/loadIdentityV110326.js';
patch(identity,"  if (brokers.size === 1) return {...candidate, broker:proofs[0].broker};",`  if (brokers.size === 1) {
    const recovered = (store.loads || []).find(load => loadRef(load) === loadRef(candidate) && load.legacySourceRepairV110327 && proofs.some(doc => doc.id === sourceDocumentId(load)));
    return {...candidate,...(recovered ? {origin:recovered.origin,destination:recovered.destination,stops:recovered.stops,aliases:[{kind:'load_number',value:candidate.loadNo,source:'original_contract'}],routeLegs:[],pickupDate:recovered.pickupDate,deliveryDate:recovered.deliveryDate} : {}),broker:proofs[0].broker};
  }`);
const VERSION='110.3.27', BUILD='v110327-legacy-contract-originals';
for(const file of ['release-version.json','public/app-version.json']) {
  const data=JSON.parse(read(file));
  Object.assign(data,{version:VERSION,build:BUILD,force:false,label:'v110.3.27 Original contract recovery',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['New loads keep their own broker, rate, equipment and route.','Contract scans use the broker and load number on the source document.','Stored broker corrections require matching source-document evidence.']});
  fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
}
for(const file of ['package.json','package-lock.json']) {
  const data=JSON.parse(read(file));data.version=VERSION;if(data.packages?.[''])data.packages[''].version=VERSION;
  fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
}
for(const [file,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]) {
  let source=read(file);
  for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]])source=source.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['\"][^'\"]+['\"];?`),`const ${name}_${key} = '${value}';`);
  fs.writeFileSync(file,source);
}
for(const file of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(file,read(file).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.26');assert.equal(meta.build,'v110326-isolated-load-broker-identity');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — load identity isolation and source-backed broker correction installed');
