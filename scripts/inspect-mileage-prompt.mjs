import fs from 'node:fs';
const path='source/src/app/road-ready-client.jsx';
const text=fs.readFileSync(path,'utf8');
for (const needle of ['Enter total miles for this driving','Speed guide for this leg','Location estimate','Total driving miles missing']) {
  const index=text.indexOf(needle);
  console.log(`\n=== ${needle} @ ${index} ===`);
  if(index>=0) console.log(text.slice(Math.max(0,index-2200),Math.min(text.length,index+4200)));
}
