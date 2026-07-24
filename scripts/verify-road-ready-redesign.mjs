import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const layout = fs.readFileSync('app/layout.jsx', 'utf8');
const css = fs.readFileSync('source/src/road-ready-2026.css', 'utf8');
assert.match(layout, /road-ready-2026\.css/, 'Road Ready visual system is not imported');
assert.match(layout, /themeColor:\s*'#071019'/, 'Native browser theme color is not synchronized');
for (const token of ['--rr-bg','--rr-surface','--rr-text','--rr-blue','--rr-green','--rr-safe-bottom']) assert.ok(css.includes(token), `Missing design token ${token}`);
for (const selector of ['.command-home-head','.command-ready-card','.command-next-card','.command-load-card','.command-module-grid','.logbook-screen','.business-screen','.bottom-nav']) assert.ok(css.includes(selector), `Missing redesigned surface ${selector}`);
assert.ok(css.includes('env(safe-area-inset-bottom)'), 'iPhone safe-area support is required');
assert.ok(css.includes('@media (min-width: 700px)'), 'Tablet layout is required');
assert.ok(css.includes('@media (max-width: 380px)'), 'Small-phone layout is required');
assert.ok(css.includes('prefers-reduced-motion'), 'Reduced-motion behavior is required');

const needles=['Enter total miles for this driving','Speed guide for this leg','Location estimate','Total driving miles missing'];
function walk(dir){
  for(const name of fs.readdirSync(dir)){
    const file=path.join(dir,name); const stat=fs.statSync(file);
    if(stat.isDirectory()){ if(!['node_modules','.next','.git'].includes(name)) walk(file); continue; }
    if(!/\.(js|jsx|mjs|ts|tsx)$/.test(name)) continue;
    const text=fs.readFileSync(file,'utf8');
    for(const needle of needles){
      const index=text.indexOf(needle);
      if(index>=0){
        console.log(`\n=== FOUND ${needle} IN ${file} @ ${index} ===`);
        console.log(text.slice(Math.max(0,index-2600),Math.min(text.length,index+5200)));
      }
    }
  }
}
walk('.');
console.log('Road Ready 2026 redesign verification passed.');
