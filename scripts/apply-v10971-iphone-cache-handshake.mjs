import fs from 'node:fs';

const VERSION='109.7.1';
const BUILD='v10971-iphone-cache-handshake';
function read(path){ return fs.readFileSync(path,'utf8'); }
function write(path,value){ fs.writeFileSync(path,value); }

for(const path of ['package.json','package-lock.json']) if(fs.existsSync(path)){
  const data=JSON.parse(read(path));
  data.version=VERSION;
  data.engines={...(data.engines||{}),node:'24.x'};
  if(data.packages?.['']){
    data.packages[''].version=VERSION;
    data.packages[''].engines={...(data.packages[''].engines||{}),node:'24.x'};
  }
  write(path,JSON.stringify(data,null,2)+'\n');
}

const releasedAt=new Date().toISOString();
write('public/app-version.json',JSON.stringify({
  version:VERSION,
  build:BUILD,
  releasedAt,
  updatedAt:releasedAt,
  label:'v109.7.1 iPhone cache recovery',
  force:true,
  notes:[
    'Synchronizes the PWA shell, service worker and generated JavaScript chunks after the Rate Confirmation risk review release.',
    'Forces stale iPhone installations to fetch the complete current build instead of mixing old shell code with new chunks.',
    'Preserves local Road Ready data, documents, Logbook and Records Vault content.'
  ]
},null,2)+'\n');

let sw=read('public/sw.js');
sw=sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/,`const OWNER_OP_SW_VERSION = '${VERSION}';`);
sw=sw.replace(/const OWNER_OP_SW_BUILD = '[^']+';/,`const OWNER_OP_SW_BUILD = '${BUILD}';`);
write('public/sw.js',sw);

let update=read('source/src/core/update/appUpdate.js');
update=update.replace(/const FALLBACK_APP_VERSION = '[^']+';/,`const FALLBACK_APP_VERSION = '${VERSION}';`);
update=update.replace(/const FALLBACK_APP_BUILD = '[^']+';/,`const FALLBACK_APP_BUILD = '${BUILD}';`);
write('source/src/core/update/appUpdate.js',update);

console.log('PASS — v109.7.1 iPhone PWA cache and chunk handshake synchronized');
