import fs from 'node:fs';
import assert from 'node:assert/strict';
const target='source/src/modules/reliability-preview';fs.mkdirSync(target,{recursive:true});
for(const name of ['fixtures.js','storage.js','ReviewSandbox.jsx','review.css'])fs.copyFileSync('scripts/reliability-preview/'+name,target+'/'+name);
fs.mkdirSync('app/reliability-preview',{recursive:true});
fs.writeFileSync('app/reliability-preview/page.jsx',`import {notFound} from 'next/navigation';
import ReviewSandbox from '../../source/src/modules/reliability-preview/ReviewSandbox.jsx';
export const dynamic='force-dynamic';
export const metadata={title:'Road Ready · Reliability review',robots:{index:false,follow:false}};
export default function ReliabilityPreview(){if(process.env.VERCEL_ENV==='production')notFound();return <ReviewSandbox/>;}
`);
// Existing authenticated production entrypoint and access controls stay intact.
// A Vercel preview opens the sample route before any account component mounts.
const entry='app/page.jsx';let text=fs.readFileSync(entry,'utf8');
if(!text.includes('RELIABILITY_SAMPLE_PREVIEW_ENTRY')){
  const before='export default function Page() {';assert.equal(text.split(before).length,2);
  text="import {redirect} from 'next/navigation';\n"+text.replace(before,before+"\n  // RELIABILITY_SAMPLE_PREVIEW_ENTRY\n  if(process.env.VERCEL_ENV==='preview')redirect('/reliability-preview');");fs.writeFileSync(entry,text);
}
console.log('PASS isolated sample preview installed; production preview route disabled');
