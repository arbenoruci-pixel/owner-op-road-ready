import fs from 'node:fs';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
function run(command,args=[]){const result=spawnSync(command,args,{stdio:'inherit',shell:false});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);}
run('npm',['run','prebuild']);
const previous=fs.readFileSync('scripts/build-v10927.mjs','utf8');
const match=previous.match(/for\(const script of (\[[\s\S]*?\])\)run/);
if(!match)throw new Error('Could not read existing materializer sequence');
const scripts=vm.runInNewContext(match[1]);
const filtered=scripts.filter(name=>!['apply-v109718-actual-load-day-evidence.mjs','verify-v109718-actual-load-day-evidence.mjs','apply-v109719-open-exact-load-evidence.mjs','verify-v109719-open-exact-load-evidence.mjs'].includes(name));
filtered.push('apply-v109718b-actual-load-day-evidence.mjs','verify-v109718-actual-load-day-evidence.mjs','finalize-v109800-historical-evidence.mjs');
for(const script of filtered)run(process.execPath,[`scripts/${script}`]);
fs.rmSync('.next',{recursive:true,force:true});
run('npx',['next','build']);
