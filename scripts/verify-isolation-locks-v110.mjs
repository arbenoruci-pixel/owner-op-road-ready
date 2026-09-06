import fs from 'node:fs';
import crypto from 'node:crypto';
const locks=JSON.parse(fs.readFileSync('module-locks.v1.json','utf8'));
const failures=[];
for(const [file,sha] of Object.entries(locks.files)) {
 const actual=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 if(actual!==sha)failures.push(file);
}
if(failures.length)throw new Error('Stable module changed without a reviewed contract/lock revision: '+failures.join(', '));
const modules='source/src/modules';
const visit=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?visit(dir+'/'+e.name):[dir+'/'+e.name]);
for(const file of visit(modules).filter(f=>/\.[cm]?[jt]sx?$/.test(f))) {
 if(file.includes('/logbook/'))continue;
 const code=fs.readFileSync(file,'utf8');
 const imports=[...code.matchAll(/(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m=>m[1]||m[2]);
 for(const target of imports){
  if(target.includes('/logbook/')&&!target.endsWith('/public-api.js')) {
   const entry=file+' -> '+target;
   if(!locks.legacyReadImports.includes(entry))throw new Error('Private Logbook import: '+entry);
  }
 }
}
console.log('PASS — '+Object.keys(locks.files).length+' runtime file locks and Logbook import boundary verified');
