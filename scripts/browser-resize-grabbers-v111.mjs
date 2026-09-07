// Deterministic delayed-ResizeObserver regression using the production CSS
// expression. The complete application is exercised by browser-compact-editor.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium,webkit } from 'playwright';
import { handleCentersV111,clampedHandleLeftV111 } from '../source/src/modules/editor/components/graphHandlesV111.js';
const results=[];
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true}),page=await browser.newPage({viewport:{width:900,height:600}});
 try{
  for(const oldWidth of [312,382,836])for(const currentWidth of [312,382,836])for(const times of [[915,916],[0,1440],[1439,1440]]){
   const p=handleCentersV111(...times,oldWidth);
   await page.setContent(`<style>body{margin:0}#rail{position:relative;width:${currentWidth}px;height:60px}button{position:absolute;width:100px;height:44px;box-sizing:border-box;margin:0;top:0}</style><div id="rail"><button id="start" style="left:${clampedHandleLeftV111('start',p.start)}">START</button><button id="end" style="left:${clampedHandleLeftV111('end',p.end)}">END</button></div>`);
   const bounds=await page.evaluate(()=>{const r=id=>{const b=document.getElementById(id).getBoundingClientRect();return {left:b.left,right:b.right,width:b.width};};return {rail:r('rail'),start:r('start'),end:r('end')};});
   assert.ok(bounds.start.left>=0&&bounds.end.right<=bounds.rail.right,`${name} clipping with stale ${oldWidth} in ${currentWidth}`);
   assert.ok(bounds.start.right+7.9<=bounds.end.left,`${name} overlap with stale ${oldWidth} in ${currentWidth}`);
   assert.equal(bounds.start.width,100);assert.equal(bounds.end.width,100);results.push({browser:name,oldWidth,currentWidth,times,bounds});
  }
  console.log('PASS — '+name+': 27 immediate-width cases stay bounded with an intentionally stale observer measurement');
 }finally{await browser.close();}
}
fs.mkdirSync('browser-test-results',{recursive:true});fs.writeFileSync('browser-test-results/resize-grabbers.json',JSON.stringify(results,null,2));
