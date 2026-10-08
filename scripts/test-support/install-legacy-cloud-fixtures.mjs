import fs from 'node:fs';
import assert from 'node:assert/strict';
for(const file of ['browser-insert-interaction-v110316.mjs','browser-midnight-prefix-v110319.mjs','browser-modern-editor-v11027.mjs','browser-motive-override-v11023.mjs']){
 const path='scripts/'+file;
 let source=fs.readFileSync(path,'utf8');
 const imported="import {fixtureCorsHeaders,fulfillLocalAccountSettings,installLocalAccountSettings} from './test-support/cloud-fixture.mjs';\n";
 if(source.startsWith(imported))continue;
 const before="const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};";
 const route="await context.route('**/*',";
 assert.equal(source.split(before).length,2,'Cloud fixture header anchor: '+path);
 assert.equal(source.split(route).length,2,'Cloud fixture route anchor: '+path);
 source=imported+source.replace(before,'if(await fulfillLocalAccountSettings(route,origin,user))return;const headers=await fixtureCorsHeaders(route.request(),origin);').replace(route,'await installLocalAccountSettings(context,user);\n '+route);
 fs.writeFileSync(path,source);
}
