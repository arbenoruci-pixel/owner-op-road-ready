import fs from 'node:fs';
import path from 'node:path';

const roots = ['source/src'];
const needles = ['DOCUMENT VAULT','original files saved','Search load, broker','All types','Proof of Delivery','Open Documents'];
function walk(dir, out=[]) {
  for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const full = path.join(dir,entry.name);
    if (entry.isDirectory()) walk(full,out);
    else if (/\.(jsx|js|tsx|ts)$/.test(entry.name)) out.push(full);
  }
  return out;
}
for (const root of roots) {
  for (const file of walk(root)) {
    const text = fs.readFileSync(file,'utf8');
    if (needles.some(n => text.includes(n))) {
      console.log(`V10969_TARGET ${file}`);
      const lines = text.split('\n');
      lines.forEach((line,i)=>{ if (needles.some(n=>line.includes(n))) console.log(`${i+1}: ${line.slice(0,260)}`); });
    }
  }
}
