import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,simplePdf} from '../v110328/browserFixture.mjs';
const output='browser-test-results/export-center-v110430';fs.mkdirSync(output,{recursive:true});
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'rr-export-center-'));
 const context=await engine.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},serviceWorkers:'block',acceptDownloads:true});
 await setupRoutes(context);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  const state=baseState();state.view='logbook';state.testInstructionStore={loads:[{loadNo:'82002',gross:1800}]};
  await seed(page,state,[{id:'export-bol',bytes:[...simplePdf('Export original BOL')]}]);
  await page.getByRole('button',{name:/Export & Backup/}).click();await page.getByRole('button',{name:'Export Docs + Logbook (ZIP)',exact:true}).waitFor();
  await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Home',exact:true}).first().click();
  await page.getByRole('button',{name:'Documents Vault',exact:true}).click();
  await page.getByRole('button',{name:/Export & Backup/}).click();
  await page.getByRole('button',{name:'Export Docs + Logbook (ZIP)',exact:true}).click();
  const ready=page.getByRole('region',{name:'Backup ready to save'});await ready.waitFor();await ready.getByText(/1 original files/).waitFor();
  const downloadPromise=page.waitForEvent('download');await ready.getByRole('link',{name:'Download backup',exact:true}).click();const download=await downloadPromise;
  assert.ok(download.suggestedFilename().endsWith('.zip'));const zipFile=path.resolve(output,`${name}-everything.zip`);await download.saveAs(zipFile);
  const check=spawnSync('python3',['-c',`import zipfile,json,sys
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 files=json.loads(z.read('Documents/Manifest.json'))
 assert len(files)==1 and b'Export original BOL' in z.read(files[0]['path'])
 backup=json.loads(z.read('Road-Ready-Backup.roadready.json'))
 assert backup['kind']=='owner_op_road_ready_zip_backup'
 assert backup['payload']['businessStore']['loads'][0]['loadNo']=='82002'
 assert '2026-09-07' in z.read('Logbook/Logbook.html').decode()
 assert not any('auth' in r['key'] for r in backup['payload']['localStorage'])
`,zipFile],{encoding:'utf8'});assert.equal(check.status,0,check.stderr);
  // Native share is called synchronously from a fresh user tap; cancellation can retry.
  await page.evaluate(()=>{window.shareCalls=[];Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.shareCalls.push({name:data.files[0].name,active:navigator.userActivation?.isActive});if(window.shareCalls.length===1)throw new DOMException('Cancelled','AbortError');}});});
  await ready.getByRole('button',{name:'Share backup',exact:true}).click();await page.getByRole('status').filter({hasText:'Sharing closed'}).waitFor();
  await ready.getByRole('button',{name:'Share backup',exact:true}).click();await page.getByRole('status').filter({hasText:'Backup shared'}).waitFor();
  const calls=await page.evaluate(()=>window.shareCalls);assert.equal(calls.length,2);assert.ok(calls.every(c=>c.active!==false&&c.name.endsWith('.zip')));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`${output}/${name}-ready.png`,fullPage:true});assert.deepEqual(errors,[]);
  console.log(`PASS ${name}: Home and Documents entry, ZIP download, exact PDF, logbook, complete backup, credential exclusion, fresh-tap share and cancel/retry`);
 }catch(error){console.error({errors,body:await page.locator('body').innerText()});await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true});throw error;}
 finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
}
