// Historical browser scripts are rebuilt from release archives. Update only their
// entry controls after every legacy materializer has finished.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const support='scripts/test-support/dashboard-navigation.mjs';
const exact=(name)=>`page.getByRole('button',{name:'${name}',exact:true})`;
const nav="page.getByRole('navigation',{name:'Driver navigation'})";
const files=fs.readdirSync('scripts',{recursive:true}).filter(name=>/(?:^|\/)browser[^/]*\.mjs$/.test(name)&&!name.startsWith('test-support/'));
for(const name of files){
 const file=path.join('scripts',name);
 const initial=fs.readFileSync(file,'utf8');
 if(initial.startsWith('// Driver workflow browser navigation\n'))continue;
 let source=initial;
 // Most page.getByRole calls were already bridged by adapt-dashboard-tests.
 // Other suites use a regex, another page, or a tool added in a later release.
 const moreControls=['Wallet','My month','Settings','Documents','Export & Backup','Billing','Drive','Import'];
 source=source.replace(/\b(page|target|phone\.page)\.getByRole\('button',\{name:'([^']+)',exact:true\}\)\.click\(\)/g,(all,receiver,control)=>
  moreControls.includes(control)?`(await homeControl(${receiver},'${control}')).click()`:all);
 source=source.replace(/\b(page|target)\.getByRole\('button',\{name:\/(\^Documents|Export & Backup|\^Billing)\/\}\)(?:\.first\(\))?\.click\(\)/g,
  (_,receiver,pattern)=>`(await homeControl(${receiver},'${pattern.replace(/^\^/,'')}')).click()`);
 if(name==='v110435/browser-phone-home.mjs'){
  const oldTabs=/assert\.equal\(await page\.getByRole\('navigation',\{name:'Road Ready tools'\}\)\.getByRole\('button'\)\.count\(\),\d+\);/;
  const oldMonth="assert.equal(await page.getByRole('navigation',{name:'Additional tools'}).getByRole('button',{name:'My month',exact:true}).count(),1);";
  assert.ok(oldTabs.test(source)&&source.includes(oldMonth),'Expected both legacy phone-navigation assertions');
  source=source.replace(oldTabs,`assert.deepEqual(await ${nav}.getByRole('button').allTextContents(),['Today','Loads','Logbook','More']);`);
  source=source.replace(oldMonth,`await ${nav}.getByRole('button',{name:'More tools',exact:true}).click();assert.equal(await page.getByRole('region',{name:'Additional tools'}).getByRole('button',{name:'My month',exact:true}).count(),1);await ${nav}.getByRole('button',{name:'Today',exact:true}).click();`);
  source=source.replaceAll(exact('Close more tools'),`${nav}.getByRole('button',{name:'Today',exact:true})`);
 }
 // These waits and hit-target assertions followed the old shortcut grid.
 source=source.replaceAll("'.rrd-icon-grid>button'","'.rr-today-nav>button'").replaceAll("'.rrd-icon-grid'","'.rr-today-nav'");
 if(name==='v110470/browser-handoff.mjs'){
  source=source.replace("page.locator('.rr-today-nav').getByRole('button',{name:'Logbook',exact:true})",`${nav}.getByRole('button',{name:'Open logbook',exact:true})`);
 }
 if(name==='reliability-sync/browser-profile.mjs'){
  // Receiving profile notifications must keep the driver landing screen mounted.
  source=source.replace(`${exact('Settings')}.waitFor()`,`${nav}.waitFor()`);
 }
 if(name==='v110455/browser-account.mjs'){
  const before=`const settings=${exact('Settings')};const home=page.getByRole('button',{name:/Home/i}).first();await settings.or(home).first().waitFor();if(!await settings.isVisible())await home.click();await settings.click();`;
  assert.ok(source.includes(before),'Expected the account fixture Settings entry');
  source=source.replace(before,`const driver=${nav},home=page.getByRole('button',{name:/Home/i}).first();await driver.or(home).first().waitFor();if(!await driver.isVisible())await home.click();await (await homeControl(page,'Settings')).click();`);
  source=source.replace("third.getByRole('button',{name:'Settings',exact:true})","third.getByRole('navigation',{name:'Driver navigation'})");
 }
 if(name==='v110434/browserFixture.mjs'){
  const home="page.getByRole('button',{name:/Home/i}).first()";
  source=source.replace(`await ${home}.waitFor({timeout:30000});`, `await ${nav}.or(${home}).first().waitFor({timeout:30000});`);
 }
 if(name==='workspace-navigation/browser-navigation.mjs'){
  const folderAction="await missionPage(page);await page.getByRole('button',{name:'Open load folder',exact:true}).click();";
  assert.ok(source.includes(folderAction),'Expected the mission folder entry');
  source=source.replace(folderAction,"await missionPage(page);assert.equal(await page.locator('.rrd-mission-doc-actions').getByRole('button',{name:'Open load folder',exact:true}).count(),1);await page.getByRole('main').getByRole('button',{name:'Browse load folders',exact:true}).click();");
  const toolAction="await page.getByRole('button',{name:button,exact:true}).click();";
  assert.ok(source.includes(toolAction),'Expected DOT and backup navigation');
  source=source.replace(toolAction,"await (await homeControl(page,button)).click();");
  const old="await page.getByLabel('Trip logbooks',{exact:true}).getByRole('button',{name:/2026-10-14/}).click();";
  assert.ok(source.includes(old),'Expected the retained trip logbook link');
  source=source.replace(old,"await page.locator('.rr-folder-logs summary').click();await page.locator('.rr-folder-logs').getByRole('button',{name:/2026-10-14/}).click();");
 }
 if(name==='import-display/browser.mjs'){
  source=source.replace("page.locator('.rr-smart-heading').innerText(),/COMPLETED/","page.locator('.rr-folder-head').innerText(),/Completed/i");
 }
 if(source===initial)continue;
 if(source.includes('await homeControl(')&&!/^import\s*\{[^}]*\bhomeControl\b[^}]*\}\s*from/m.test(source)){
  let rel=path.relative(path.dirname(file),support);
  if(!rel.startsWith('.'))rel='./'+rel;
  source=`import {homeControl} from '${rel}';\n`+source;
 }
 const check=spawnSync(process.execPath,['--check','--input-type=module'],{input:source,encoding:'utf8'});
 assert.equal(check.status,0,file+'\n'+check.stderr);
 fs.writeFileSync(file,'// Driver workflow browser navigation\n'+source);
}
console.log('PASS — historical browser fixtures navigate the driver dashboard using the visible controls');
