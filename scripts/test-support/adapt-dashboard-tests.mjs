// Historical releases regenerate their browser fixtures on every build.
// Adapt only navigation/presentation expectations to the driver dashboard.
// Data, signature, original-byte, workflow and isolation assertions stay intact.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const file of files('scripts').filter(p=>/browser[^/]*\.mjs$/.test(p)&&!p.includes('test-support/'))){
 let s=fs.readFileSync(file,'utf8'),before=s;
 if(s.includes('// Dashboard navigation adapted'))continue;
 // Home waits follow the actual Home, while mission assertions enter Active Load.
 s=s.replace(/(page|target)\.locator\('(\.adaptive-(?:mission|no-load)[^']*|\.adaptive-home-v1038\.(?:active-load|no-load))'\)/g,"(await missionPage($1)).locator('$2')");
 s=s.replaceAll('.adaptive-home-v1038,','.rr-driver-home,');
 s=s.replaceAll("'.adaptive-home-v1038'","'.rr-driver-home'").replaceAll("'.phone-app-grid'","'.rrd-icon-grid'").replaceAll("'.phone-app-grid>button'","'.rrd-icon-grid>button'");
 s=s.replace(/(page|target)\.getByRole\('button',\{name:'(Full mission|Open shipment log)',exact:true\}\)/g,"(await missionPage($1)).getByRole('button',{name:'$2',exact:true})");
 for(const name of ['Documents','Smart Scan','Continue saved scan','Open logbook','Import','Export & Backup','Drive','Billing','More tools'])s=s.replaceAll(`page.getByRole('button',{name:'${name}',exact:true})`,`(await homeControl(page,'${name}'))`);
 s=s.replaceAll("page.getByRole('button',{name:/Smart Scan/}).first()","(await homeControl(page,'Smart Scan'))");
 if(file==='scripts/browser-fullscreen-reader-v110369.mjs'){
  s=s.replace("await page.locator('.rr-driver-home').waitFor();\n  assert.equal(await card", "await page.locator('.rr-driver-home').waitFor();await missionPage(page);\n  assert.equal(await card");
  s=s.replace("card=(await missionPage(page)).locator('.adaptive-mission-v1038');\n  await seed(page,state);", "await seed(page,state);card=(await missionPage(page)).locator('.adaptive-mission-v1038');\n  ");
 }
 if(file==='scripts/workspace-navigation/browser-navigation.mjs')s=s.replace("await page.getByRole('button',{name:'Open load folder',exact:true}).click();","await missionPage(page);await page.getByRole('button',{name:'Open load folder',exact:true}).click();");
 if(file==='scripts/v110411/browser-filing.mjs')s=s.replace('await reviewFixturePodEvidence(page',"await (await homeControl(page,'Documents')).waitFor();await reviewFixturePodEvidence(page").replace("    assert.equal(await page.getByText('Pickup BOL missing',{exact:true}).count(),0,'Saved POD covers","    await missionPage(page);assert.equal(await page.getByText('Pickup BOL missing',{exact:true}).count(),0,'Saved POD covers");
 if(file==='scripts/compact-business/browser.mjs')s=s.replace("name:'Open load inbox'","name:'Loads'").replaceAll("'.rr-business-nav button'","'.rrd-icon-grid button'");
 if(file==='scripts/v110435/browser-phone-home.mjs'){
  s=s.replaceAll("name:'Apps'","name:'Road Ready tools'").replace("getByRole('navigation',{name:'Road Ready tools'}).getByRole('button',{name:'My month'","getByRole('navigation',{name:'Additional tools'}).getByRole('button',{name:'My month'").replace(/(getByRole\('navigation',\{name:'Road Ready tools'\}\)\.getByRole\('button'\)\.count\(\),)\d+/,'$17');
 }
 if(file==='scripts/browser-saved-documents-v110344.mjs')s=s.replaceAll("reread.getByRole('button',{name:'Export reading review'","(await readingDetails(reread)).getByRole('button',{name:'Export reading review'").replaceAll("reread.getByRole('button',{name:'Enter ship date from page'","(await readingDetails(reread)).getByRole('button',{name:'Enter ship date from page'").replace("assert.equal(await recent.getByRole('searchbox').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)','search stays readable over the app theme');","assert.ok(await searchContrast(recent.getByRole('searchbox'))>=4.5,'search text contrast >= 4.5 over the app theme');");
 if(file==='scripts/v110416/browser-weeks.mjs')s=s.replace("assert.deepEqual(color,{background:'rgb(255, 255, 255)',color:'rgb(21, 43, 70)'},'search stays readable in iOS dark mode');","assert.ok(await searchContrast(search)>=4.5,'search text contrast >= 4.5 in iOS dark mode');");
 s=s.replace('const home=()=>','const home=async()=>');
 if(s!==before){let relative=path.relative(path.dirname(file),'scripts/test-support/dashboard-navigation.mjs');if(!relative.startsWith('.'))relative='./'+relative;s=`// Dashboard navigation adapted\nimport {missionPage,homeControl,searchContrast,readingDetails} from '${relative}';\n`+s;execFileSync(process.execPath,['--check','--input-type=module'],{input:s});fs.writeFileSync(file,s);}
}
console.log('PASS — dashboard test navigation updated; behavioral/data assertions retained');
// The evidence helper returns through Home after verifying immutable originals.
const podHelper='scripts/test-support/review-pod-evidence.mjs';
fs.writeFileSync(podHelper,fs.readFileSync(podHelper,'utf8').replaceAll("'.adaptive-home-v1038'","'.rr-driver-home'"));
