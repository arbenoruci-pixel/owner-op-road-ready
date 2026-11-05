import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const required = {
  source: ['AGENTS.md', 'docs/DOT_WORKFLOW_LOCK.md', 'scripts/verify-dot-workflow-lock.mjs',
    'scripts/inspection-package/InspectionWizard.jsx', 'scripts/inspection-package/core.js',
    'scripts/inspection-package/client.js', 'scripts/inspection-package/wallet.js',
    'scripts/inspection-package/install.mjs', 'scripts/inspection-package/flow.test.mjs',
    'scripts/inspection-signed/core.js', 'scripts/inspection-signed/readiness.js',
    'scripts/inspection-snapshot/core.js', 'scripts/inspection-wizard/wizard.css',
    'supabase/functions/owner-op-cloud-v1/index.ts'],
  runtime: ['source/src/modules/dot/InspectionWizard.jsx', 'source/src/modules/dot/inspectionWizard.css',
    'source/src/modules/dot/inspectionReadiness.js', 'source/src/modules/dot/inspectionEmail.js',
    'source/src/modules/dot/DotMode.jsx', 'source/src/modules/cloud/Inspector.jsx',
    'lib/owner-op-cloud/inspectionSnapshot.js', 'lib/owner-op-cloud/inspectionShare.js',
    'lib/owner-op-cloud/inspectionWallet.js', 'lib/owner-op-cloud/core.js',
    'source/src/core/wallet/dotWallet.js', 'source/src/modules/logbook/certificationV110.js']
};

export function verifyDotWorkflowLock({root=process.cwd(), phase='source'}={}) {
  if(!Object.hasOwn(required,phase))throw Error('Unknown DOT lock phase: '+phase);
  const lock=JSON.parse(fs.readFileSync(path.join(root,'dot-workflow-lock.v1.json'),'utf8'));
  if(lock.schemaVersion!==1 || !/^\d+\.\d+\.\d+$/.test(lock.baselineRelease) || !/^[a-f0-9]{40}$/.test(lock.baselineCommit))throw Error('Invalid DOT lock baseline');
  for(const section of Object.keys(required)) {
    const files=lock[section];
    if(!files || Array.isArray(files) || required[section].some(file=>!Object.hasOwn(files,file)))throw Error('Incomplete DOT '+section+' lock; retain the approved protected scope');
    for(const [file,hash] of Object.entries(files)) {
      if(path.isAbsolute(file) || file.split(/[\\/]/).includes('..') || !/^[a-f0-9]{64}$/.test(hash))throw Error('Invalid DOT lock entry: '+file);
    }
  }
  const failures=[];
  for(const [file,expected] of Object.entries(lock[phase])) {
    try {
      const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
      if(actual!==expected)failures.push(file+' (changed)');
    } catch(error) {
      if(error.code!=='ENOENT')throw error;
      failures.push(file+' (missing)');
    }
  }
  if(failures.length)throw Error('DOT workflow is locked at the user-approved baseline. Obtain Arben\'s agreement for the specific change and follow docs/DOT_WORKFLOW_LOCK.md.\n'+failures.join('\n'));
  return Object.keys(lock[phase]).length;
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const phase=process.argv[2]||'source';
  if(process.argv.length>3)throw Error('DOT lock verification accepts only source or runtime; there is no unlock mode');
  console.log('PASS — '+verifyDotWorkflowLock({phase})+' approved DOT '+phase+' files unchanged');
}
