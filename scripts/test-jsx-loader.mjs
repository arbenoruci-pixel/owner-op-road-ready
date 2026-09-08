import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const babel=require('next/dist/compiled/babel/core');
const reactPreset=require.resolve('next/dist/compiled/babel/preset-react');
// Exercise the real React tree without a browser or any client storage writes.
export async function load(url,context,nextLoad){
  if(!url.endsWith('.jsx'))return nextLoad(url,context);
  let source=await fs.readFile(new URL(url),'utf8');
  // Reproduce the pre-fix graph input in isolation for the regression baseline.
  if(process.env.TEST_BASELINE_GRAPH==='1' && url.endsWith('/logbook/DayLogScreen.jsx')){
    source=source.replace('events={eventListEvents}','events={bulkPreviewEvents}');
  }
  const result=babel.transformSync(source,{filename:new URL(url).pathname,babelrc:false,configFile:false,presets:[reactPreset]});
  return {format:'module',source:result.code,shortCircuit:true};
}
