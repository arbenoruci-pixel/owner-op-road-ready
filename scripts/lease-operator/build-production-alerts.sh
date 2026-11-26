#!/bin/sh
set -eu
patch=$(mktemp)
trap 'rm -f "$patch"' EXIT
curl -fsSL --retry 2 https://github.com/arbenoruci-pixel/owner-op-road-ready/commit/49a26df84b968b54c7cfc72a92ad61b45314c1fb.diff -o "$patch"
echo "4c83f4a0c13d4089eea087162ec279132b710d6ef69eeeba305f8b895e4d8986  $patch" | sha256sum -c -
git apply --include='app/operator/loadAlerts.js' --include='app/operator/DriverLoadAlerts.jsx' --include='public/operator-load-alerts-sw.js' "$patch"
node - <<'NODE'
const fs = require('node:fs');
const path = 'app/operator/OperatorPortal.jsx';
let text = fs.readFileSync(path,'utf8');
function replaceOnce(needle, replacement) {
  if (text.split(needle).length !== 2) throw new Error('Unexpected production source: '+needle);
  text = text.replace(needle,replacement);
}
replaceOnce("import { PortalSession, usePortalClient } from './PortalSession.jsx';","import { PortalSession, usePortalClient } from './PortalSession.jsx';\nimport DriverLoadAlerts from './DriverLoadAlerts.jsx';\nimport { unsubscribeLoadAlerts } from './loadAlerts.js';");
replaceOnce("function Workspace({ operator }) {","function Workspace({ operator, driverView }) {");
replaceOnce('<div className={styles.sectionHeading}>',"{driverView && <DriverLoadAlerts operatorId={operator.id} onRefresh={() => setRefresh(v => v + 1)} />}\n        <div className={styles.sectionHeading}>");
replaceOnce('pay_weekday,carrier_user_id,workspace_kind','pay_weekday,carrier_user_id,driver_user_id,workspace_kind');
replaceOnce('<Workspace key={operator.id} operator={operator} />',"<Workspace key={operator.id} operator={operator} driverView={operator.workspace_kind === 'leased' && operator.driver_user_id === session.user.id} />");
replaceOnce("const { error } = await operatorClient().auth.signOut({ scope: 'local' });","await unsubscribeLoadAlerts(client || operatorClient()).catch(() => {});\n    const { error } = await operatorClient().auth.signOut({ scope: 'local' });");
fs.writeFileSync(path,text);
NODE
export GITHUB_SHA=49a26df84b968b54c7cfc72a92ad61b45314c1fb VERCEL_GIT_COMMIT_SHA=49a26df84b968b54c7cfc72a92ad61b45314c1fb
node scripts/build-v110.mjs
