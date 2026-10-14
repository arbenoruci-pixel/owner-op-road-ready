import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const run=args=>execFileSync(process.execPath,args,{stdio:'inherit'});
run(['--test',...fs.readdirSync('packages/smart-reader-core/test').filter(name=>name.endsWith('.test.mjs')).map(name=>'packages/smart-reader-core/test/'+name)]);
run(['--test',...fs.readdirSync('scripts/reader-foundation').filter(name=>name.endsWith('.test.mjs')).map(name=>'scripts/reader-foundation/'+name)]);
run(['scripts/test-pdf-coverage-v110363.mjs','--runtime']);
run(['--test',...fs.readdirSync('scripts/reader-ai').filter(name=>/^test-.*\.mjs$/.test(name)).map(name=>'scripts/reader-ai/'+name)]);
