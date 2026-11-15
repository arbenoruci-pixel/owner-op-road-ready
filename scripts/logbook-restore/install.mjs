import fs from 'node:fs';
import assert from 'node:assert/strict';
const root='scripts/logbook-restore/',lib='lib/owner-op-cloud/',ui='source/src/modules/cloud/';
fs.writeFileSync(lib+'authorizedLogbookRecoveryCore.js',fs.readFileSync(root+'core.js','utf8').replace('../v110455/accountCore.js','./accountCoreV110455.js').replace('../v110451/recordsCore.js','./recordsCoreV110451.js'));
fs.copyFileSync(root+'runtime.js',lib+'authorizedLogbookRecovery.js');
fs.copyFileSync(root+'RecoveryAgent.jsx',ui+'AuthorizedLogbookRecoveryAgent.jsx');
const file=ui+'RecordSyncAgentV110451.jsx';
let s=fs.readFileSync(file,'utf8');
if(!s.includes("import AuthorizedLogbookRecoveryAgent")){
 s=s.replace("'use client';","'use client';\nimport AuthorizedLogbookRecoveryAgent from './AuthorizedLogbookRecoveryAgent.jsx';");
 const before=' return status.pending?';assert.equal(s.split(before).length,2);
 s=s.replace(before,' return <><AuthorizedLogbookRecoveryAgent/>{status.pending?').replace('>:null;','>:null}</>;');
 fs.writeFileSync(file,s);
}
console.log('PASS — authorized phone recovery installed; existing logbook and inspection controls unchanged');
