import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const VERSION='110.3.52',BUILD='v110352-route-cleanup';
const read=path=>fs.readFileSync(path,'utf8');
function patch(path,before,after){
  const source=read(path);
  if(source.includes(after))return;
  assert.equal(source.split(before).length-1,1,'Route cleanup anchor: '+path);
  fs.writeFileSync(path,source.replace(before,after));
}
fs.copyFileSync('scripts/v110350/routeLegDeletion.js','source/src/core/routes/routeLegDeletion.js');
const screen='source/src/modules/logbook/DayLogScreen.jsx';
const locks=JSON.parse(read('module-locks.v1.json'));
const hash=()=>crypto.createHash('sha256').update(read(screen)).digest('hex');
if(!read(screen).includes('routeLegDeleteRequest'))assert.equal(hash(),'5ce2a905fc4927a13bffc4d4f42dbdb17bf24701d08cd3257f7ec4d360058670','Reviewed route form baseline');
patch(screen,"import React, { useEffect, useMemo, useRef, useState } from 'react';",
  "import React, { useEffect, useMemo, useRef, useState } from 'react';\nimport { routeLegDeleteRequest } from '../../core/routes/routeLegDeletion.js';");
patch(screen,`    const targetDay = leg.day || state.activeDay;
    const routeLegsByDay = { ...(state.routeLegsByDay || {}) };
    routeLegsByDay[targetDay] = (routeLegsByDay[targetDay] || []).filter(item => item.id !== leg.id);
    onSaveLoad?.({ routeLegsByDay });`,
`    const request = routeLegDeleteRequest(state, leg);
    if (!request) {
      window.alert?.('This route could not be identified safely. Reopen the Form tab and try again.');
      return;
    }
    onSaveLoad?.({ deleteRouteLeg:request });`);
const app='source/src/app/App.jsx';
patch(app,"import React, { useMemo, useRef, useState } from 'react';",
  "import React, { useMemo, useRef, useState } from 'react';\nimport { deleteRouteLegFromState } from '../core/routes/routeLegDeletion.js';");
patch(app,`  function saveLoadInfo(payload = {}) {
    setState(s => {`,
`  function saveLoadInfo(payload = {}) {
    setState(s => {
      if (Object.prototype.hasOwnProperty.call(payload, 'deleteRouteLeg')) {
        const next = deleteRouteLegFromState(s, payload.deleteRouteLeg);
        return next === s ? s : reconcileCertificationStatusesV1032(next);
      }`);
const browserTest='scripts/browser-isolation-v110.mjs';
const browserImport="await import('./browser-route-delete-v110350.mjs');";
if(!read(browserTest).includes(browserImport))fs.appendFileSync(browserTest,'\n'+browserImport+'\n');
locks.files[screen]=hash();locks.release=VERSION;
fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(read(path));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.52 Route cleanup',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Delete selected route data from actual storage buckets and legacy mirrors.','Preserve unrelated days, routes, original documents and duty times.','Retain the Signed / Not signed display without signing timestamps.']});
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){
  const value=JSON.parse(read(path));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let source=read(path);
  for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]])source=source.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);
  fs.writeFileSync(path,source);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.51');assert.equal(meta.build,'v110351-dot-signature-labels');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — v110.3.52 current-state route deletion installed');
// Temporary preview-only source trace while reviewing the day-deletion pathway.
const source=read(app);
for(const match of source.matchAll(/^  (?:async )?function ((?:delete|clear|remove|reset)[A-Za-z0-9_]*)\([^\n]*\) \{/gm)){
  const end=source.indexOf('\n  function ',match.index+match[0].length);
  const text=source.slice(match.index,end<0?match.index+500:end);
  console.log('DELETE_PATH_SOURCE '+match[1]+'\n'+text.slice(0,18000));
}
