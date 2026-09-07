import fs from 'node:fs';
import assert from 'node:assert/strict';
const path='source/src/modules/dot/DotMode.jsx';
let source=fs.readFileSync(path,'utf8');
const before=`      // Officer-email handoff is intentionally logs-only. Wallet documents\n      // require a separate explicit share choice in Private Cloud / DOT package.\n      const share = await cloudApi({ action:'create_share', wallet_keys:[] });`;
const after=`      const catalogV11028 = await cloudApi({ action:'catalog' });\n      const cloudDatesV11028 = new Set((catalogV11028?.days || []).map(row => String(row.log_date || '')));\n      const missingDatesV11028 = days.filter(day => !cloudDatesV11028.has(day));\n      if (missingDatesV11028.length) {\n        throw new Error('Roadside cloud package is missing: ' + missingDatesV11028.join(', ') + '. Review/sign those log days and retry.');\n      }\n      // Officer-email handoff is intentionally logs-only. Wallet documents\n      // require a separate explicit share choice in Private Cloud / DOT package.\n      const share = await cloudApi({ action:'create_share', wallet_keys:[] });\n      if (Number(share?.log_count || 0) !== days.length) {\n        throw new Error('Secure roadside link did not contain all 8 log dates. Retry after cloud sync.');\n      }`;
if(!source.includes(after)){assert.ok(source.includes(before),'8-day guard anchor changed');source=source.replace(before,after);}
fs.writeFileSync(path,source);
console.log('PASS — officer email requires all eight cloud log dates before opening the addressed email');
