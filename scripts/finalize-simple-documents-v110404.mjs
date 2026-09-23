import fs from 'node:fs';
const VERSION='110.4.4',BUILD='v110404-simple-documents',stamp=new Date().toISOString();
for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(fs.readFileSync(path,'utf8'));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.4.4 Simple document folders',releasedAt:stamp,updatedAt:stamp,
    sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
    notes:['Browse weeks, choose a load, and open clearly labeled documents.','Keep repairs and operational records under optional details.','Improve mobile wrapping and text contrast.']});
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){
  const value=JSON.parse(fs.readFileSync(path,'utf8'));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const [path,name]of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let value=fs.readFileSync(path,'utf8');
  for(const [key,replacement]of [['VERSION',VERSION],['BUILD',BUILD]])value=value.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${replacement}';`);
  fs.writeFileSync(path,value);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,fs.readFileSync(path,'utf8').replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,fs.readFileSync(path,'utf8').replaceAll("'110.4.3'","'"+VERSION+"'").replaceAll("'v110403-documents-export'","'"+BUILD+"'"));
const locks=JSON.parse(fs.readFileSync('module-locks.v1.json','utf8'));locks.release=VERSION;
fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');

for(const [input,output] of [['LoadFolders.jsx','LoadFoldersV10969.jsx'],['documentBrowser.js','documentBrowserV110404.js'],['documentsBrowser.css','documentsBrowserV110404.css']])fs.copyFileSync('scripts/v110404/'+input,'source/src/modules/owneros/'+output);

// These tests follow the same saved-file entry point as a driver. Keep all
// original-byte, sharing, offline-cache and rereading assertions intact.
function patch(path,before,after,count=1){
  const source=fs.readFileSync(path,'utf8');
  if(source.includes(after))return;
  if(source.split(before).length!==count+1)throw new Error('Simple documents anchor changed: '+path);
  fs.writeFileSync(path,source.replaceAll(before,after));
}
for(const path of ['scripts/browser-owned-reader.mjs','scripts/browser-fullscreen-reader-v110369.mjs','scripts/v110384/browser-rows.mjs']){
  const before="await page.getByRole('button',{name:/^Documents/}).first().click();";
  patch(path,before,before+"\n    await page.getByRole('button',{name:'Browse all saved files',exact:true}).click();",path.includes('owned-reader')?1:2);
}
patch('scripts/browser-saved-documents-v110344.mjs',
  "await page.getByRole('heading',{name:'Recent documents',exact:true}).waitFor();",
  "await page.getByText('Documents to organize (42)',{exact:true}).waitFor();\n  await page.getByRole('button',{name:'Browse all saved files',exact:true}).click();\n  await page.getByRole('heading',{name:'Recent documents',exact:true}).waitFor();");
patch('scripts/browser-saved-documents-v110344.mjs',
  "assert.match(await page.locator('.load-folder-review-v10974').innerText(),/42 documents need identity review/);",
  "assert.equal(await page.getByRole('heading',{name:'All saved files',exact:true}).count(),1);");
patch('scripts/browser-saved-documents-v110344.mjs',
  "const wizard=page.locator('.load-folder-review-v10974');\n    await wizard.locator(':scope>button').click();",
  "await page.getByRole('button',{name:'‹ Back to weeks',exact:true}).click();\n    const wizard=page.locator('.rr-docs-options').filter({has:page.getByText('Documents to organize (42)',{exact:true})});\n    await wizard.locator('summary').click();");
patch('scripts/browser-saved-documents-v110344.mjs',
  "for(const button of await wizard.locator('.load-folder-actions-v10969 button').all())await fit(page,button);\n      assert.equal(await wizard.locator('.load-folder-actions-v10969').evaluate(el=>getComputedStyle(el).position),'static');\n      await fit(page,wizard.locator('article button'));",
  "assert.equal(await wizard.locator('.rr-docs-file').count(),42,'every unassigned original remains accessible');\n      await fit(page,wizard.locator('.rr-docs-file').first());\n      await fit(page,wizard.locator('.rr-docs-file').filter({hasText:'very-long-original-file-name'}));");
for(const path of ['source/src/modules/scan/SmartScanSheetV105.jsx','scripts/browser-scanner-workflow-v110328.mjs'])patch(path,'Documents → Recent documents','Documents → Browse all saved files');
console.log('PASS — 110.4.4 simple document folders installed');
