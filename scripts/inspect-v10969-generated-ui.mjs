import fs from 'node:fs';
const path='source/src/modules/owneros/OwnerOperatorOSV102.jsx';
const text=fs.readFileSync(path,'utf8');
const index=text.indexOf("{tab==='documents'");
console.log('V10969_GENERATED_START');
console.log(text.slice(Math.max(0,index-300),index+900));
console.log('V10969_GENERATED_END');
