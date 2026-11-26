#!/bin/sh
set -eu
patch=$(mktemp)
trap 'rm -f "$patch"' EXIT
curl -fsSL --retry 2 https://github.com/arbenoruci-pixel/owner-op-road-ready/commit/49a26df84b968b54c7cfc72a92ad61b45314c1fb.diff -o "$patch"
echo "4c83f4a0c13d4089eea087162ec279132b710d6ef69eeeba305f8b895e4d8986  $patch" | sha256sum -c -
git apply --include='app/operator/loadAlerts.js' --include='app/operator/DriverLoadAlerts.jsx' --include='public/operator-load-alerts-sw.js' "$patch"
node - <<'NODE'
const fs=require('node:fs');
const path='app/operator/OperatorPortal.jsx';
let source=fs.readFileSync(path,'utf8');
function replace(pattern,sub) {
 const matches=[...source.matchAll(new RegExp(pattern.source,'g'))];
 if(matches.length!==1)throw Error('Production portal integration anchor '+pattern+' matched '+matches.length);
 source=source.replace(pattern,sub);
}
replace(/import \{ PortalSession, usePortalClient \} from '\.\/PortalSession\.jsx';/,m=>m+"\nimport DriverLoadAlerts from './DriverLoadAlerts.jsx';\nimport { unsubscribeLoadAlerts } from './loadAlerts.js';");
if (!/\.select\('[^']*driver_user_id[^']*'\)/.test(source)) replace(/pay_weekday,carrier_user_id,workspace_kind/,'pay_weekday,carrier_user_id,driver_user_id,workspace_kind');
replace(/\{operator && <Workspace\b/,m=>"{operator && operator.workspace_kind === 'leased' && operator.driver_user_id === session.user.id && <DriverLoadAlerts key={operator.id} operatorId={operator.id} onRefresh={() => window.dispatchEvent(new Event('rr-driver-load-assigned'))} />}\n      "+m);
replace(/window\.addEventListener\('online', check\);/,m=>m+"\n    window.addEventListener('rr-driver-load-assigned',check);");
replace(/window\.removeEventListener\('online', check\);/,m=>m+"\n      window.removeEventListener('rr-driver-load-assigned',check);");
replace(/const \{ error \} = await operatorClient\(\)\.auth\.signOut\(\{ scope: 'local' \}\);/,m=>"await unsubscribeLoadAlerts(client || operatorClient()).catch(() => {});\n    "+m);
fs.writeFileSync(path,source);
console.log('Added scoped notifications to the deployed driver portal.');
NODE
export GITHUB_SHA=49a26df84b968b54c7cfc72a92ad61b45314c1fb VERCEL_GIT_COMMIT_SHA=49a26df84b968b54c7cfc72a92ad61b45314c1fb
node scripts/build-v110.mjs
