import fs from 'node:fs';
import assert from 'node:assert/strict';

function replaceOnce(path,before,after,label){
  let source=fs.readFileSync(path,'utf8');
  if(source.includes(after)) return;
  assert.ok(source.includes(before),`110.2.8 legacy browser anchor missing: ${label}`);
  source=source.replace(before,after);
  fs.writeFileSync(path,source);
}

replaceOnce(
  'scripts/browser-logbook-editor-v110.mjs',
  `async function inspect(page,label){const info=await page.locator('.editor-ui-v110').evaluate(root=>({width:root.clientWidth,scroll:root.scrollWidth,viewport:innerWidth,fields:[...root.querySelectorAll('input:not([type=checkbox])')].filter(el=>el.getBoundingClientRect().width>0).map(el=>{const c=getComputedStyle(el);return {name:el.getAttribute('aria-label')||el.placeholder,color:c.webkitTextFillColor||c.color,background:c.backgroundColor,font:c.fontSize,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right};})}));assert.ok(info.scroll<=info.width+1,label+' editor overflow');for(const field of info.fields){assert.ok(field.left>=-1&&field.right<=info.viewport+1,label+' clipped input '+field.name);assert.ok(parseFloat(field.font)>=16,label+' iPhone input zoom '+field.name);const a=luminance(field.color),b=luminance(field.background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert.ok(ratio>=4.5,\`${'${label}'} low contrast ${'${field.name}'}: ${'${ratio}'}\`);}return info;}`,
  `async function inspect(page,label){const info=await page.locator('.editor-ui-v110').evaluate(root=>{const visibleForm=root.querySelector('.editor-form-v85')||root;return {width:visibleForm.clientWidth,scroll:visibleForm.scrollWidth,viewport:innerWidth,fields:[...root.querySelectorAll('input:not([type=checkbox])')].filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';}).map(el=>{const c=getComputedStyle(el),r=el.getBoundingClientRect();return {name:el.getAttribute('aria-label')||el.placeholder,color:c.webkitTextFillColor||c.color,background:c.backgroundColor,font:c.fontSize,left:r.left,right:r.right};})};});assert.ok(info.scroll<=info.width+1,label+' visible form overflow');for(const field of info.fields){assert.ok(field.left>=-1&&field.right<=info.viewport+1,label+' clipped input '+field.name);assert.ok(parseFloat(field.font)>=16,label+' iPhone input zoom '+field.name);const a=luminance(field.color),b=luminance(field.background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert.ok(ratio>=4.5,\`${'${label}'} low contrast ${'${field.name}'}: ${'${ratio}'}\`);}return info;}`,
  'visible editor overflow measurement'
);

replaceOnce(
  'scripts/browser-compact-editor-v111.mjs',
  `await page.getByRole('button',{name:'Insert',exact:true}).click();await page.locator('.editor-compact-v111').waitFor();await page.getByLabel('Start time',{exact:true}).fill('23:59');await page.locator('.midnight-end-v110 input').check();await inspect(page);assert.equal(await page.getByRole('slider',{name:'end time handle',exact:true}).getAttribute('aria-valuenow'),'1440');`,
  `await page.getByRole('button',{name:'Insert',exact:true}).click();await page.locator('.editor-compact-v111').waitFor();await page.getByLabel('Start time',{exact:true}).fill('23:59');await page.getByText('Fine tune',{exact:true}).click();const midnight=page.locator('.midnight-end-v110 input');await midnight.waitFor({state:'visible'});await midnight.check();await inspect(page);assert.equal(await page.getByRole('slider',{name:'end time handle',exact:true}).getAttribute('aria-valuenow'),'1440');`,
  'visible next-day midnight control'
);

console.log('PASS — legacy browser checks measure the visible modern form and use the visible Fine tune path for 24:00');
