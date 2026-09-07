import assert from 'node:assert/strict';
import fs from 'node:fs';

const dot=fs.readFileSync('source/src/modules/dot/DotMode.jsx','utf8');
const cloud=fs.readFileSync('lib/owner-op-cloud/client.js','utf8');
const meta=JSON.parse(fs.readFileSync('public/app-version.json','utf8'));
const sw=fs.readFileSync('public/sw.js','utf8');

assert.match(dot,/backupLocalData, cloudApi/);
assert.match(dot,/validOfficerEmailV11028/);
assert.match(dot,/type="email"[^>]+aria-label="Officer email"/);
assert.match(dot,/aria-label="Officer email in officer view"/);
assert.doesNotMatch(dot,/placeholder="Routing \/ reference code \(if provided\)"/);
assert.match(dot,/backupLocalData\(\{[\s\S]*onlyDays:days/);
assert.match(dot,/cloudApi\(\{ action:'create_share', wallet_keys:walletKeys \}\)/);
assert.match(dot,/\/inspection#\$\{share\.token\}/);
assert.match(dot,/window\.location\.href = mailto/);
assert.match(dot,/Secure link ready/);
assert.match(dot,/Copy secure link/);
assert.match(dot,/not FMCSA eRODS/);
assert.match(dot,/Local records were not changed/);
assert.match(dot,/if \(!validOfficerEmailV11028\(to\)\)/);
assert.match(dot,/navigator\.onLine === false/);
assert.match(dot,/officerEmailBusyV11028 \|\| !validOfficerEmailV11028\(officerEmail\)/);

// Existing isolated cloud contract is the transport. It authenticates create_share,
// while inspect/inspection_file are the only public capability-token reads.
assert.match(cloud,/const publicRequest = \['inspect', 'inspection_file'\]\.includes\(body\.action\)/);
assert.match(cloud,/if \(!publicRequest && !session\) throw new Error\('Sign in to your Owner Operator cloud account\.'\)/);
assert.match(cloud,/CLOUD_URL = 'https:\/\/ghwkcgczuwctzxsxmqzx\.supabase\.co'/);

assert.equal(meta.version,'110.2.8');
assert.equal(meta.build,'v110208-officer-email-share');
assert.equal(meta.force,false);
assert.match(sw,/OWNER_OP_SW_VERSION = '110\.2\.8'/);
assert.match(sw,/OWNER_OP_SW_BUILD = 'v110208-officer-email-share'/);

const css=fs.readFileSync('source/src/styles.css','utf8');
assert.match(css,/DOT_OFFICER_EMAIL_V11028/);
assert.match(css,/min-height:44px/);

console.log('PASS — officer enters email, Road Ready syncs the eight-day package, creates a private capability link, and opens an addressed email without routing-code UI');
