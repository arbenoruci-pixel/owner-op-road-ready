import fs from 'node:fs';
import assert from 'node:assert/strict';
const path='source/src/modules/dot/DotMode.jsx';
let source=fs.readFileSync(path,'utf8');
const oldCall=`      const walletKeys = Object.keys(state.dotWallet?.documents || {});\n      const share = await cloudApi({ action:'create_share', wallet_keys:walletKeys });`;
const newCall=`      // Officer-email handoff is intentionally logs-only. Wallet documents\n      // require a separate explicit share choice in Private Cloud / DOT package.\n      const share = await cloudApi({ action:'create_share', wallet_keys:[] });`;
if(!source.includes(newCall)){assert.ok(source.includes(oldCall),'DOT email privacy anchor changed');source=source.replace(oldCall,newCall);}
source=source.replace('This link contains the current 24-hour period and previous 7 consecutive log days plus the selected roadside wallet documents.','This secure link contains the current 24-hour period and previous 7 consecutive log days.');
source=source.replace('<div><b>Email this package</b><span>Officer enters email · secure link expires in about 4 hours</span></div>','<div><b>Email logs</b><span>Officer enters email · 8-day logs only · secure link expires in about 4 hours</span></div>');
fs.writeFileSync(path,source);
console.log('PASS — officer email handoff is logs-only; wallet documents require a separate explicit share');
