import fs from 'node:fs';

const VERSION = '110.4.6';
const BUILD = 'v110406-rate-route-locations';
const stamp = new Date().toISOString();
for (const path of ['release-version.json', 'public/app-version.json']) {
  const value = JSON.parse(fs.readFileSync(path, 'utf8'));
  Object.assign(value, {
    version: VERSION, build: BUILD, force: false,
    label: 'v110.4.6 Rate confirmation route correction',
    releasedAt: stamp, updatedAt: stamp,
    sourceCommit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null,
    notes: ['Read pickup and delivery locations from the correct party sections.', 'Reject time labels and payment terms as route locations when rereading a document.'],
  });
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
for (const path of ['package.json', 'package-lock.json']) {
  const value = JSON.parse(fs.readFileSync(path, 'utf8'));
  value.version = VERSION;
  if (value.packages?.['']) value.packages[''].version = VERSION;
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
for (const [path, name] of [['source/src/core/update/appUpdate.js', 'FALLBACK_APP'], ['public/sw.js', 'OWNER_OP_SW']]) {
  let value = fs.readFileSync(path, 'utf8');
  for (const [key, replacement] of [['VERSION', VERSION], ['BUILD', BUILD]]) {
    value = value.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`), `const ${name}_${key} = '${replacement}';`);
  }
  fs.writeFileSync(path, value);
}
for (const path of ['source/src/modules/home/HomeScreen.jsx', 'source/src/shared/ui/ToolsSheet.jsx']) {
  fs.writeFileSync(path, fs.readFileSync(path, 'utf8').replace(/App v\d+\.\d+\.\d+/g, 'App v' + VERSION).replace(/APP V\d+\.\d+\.\d+/g, 'APP V' + VERSION));
}
for (const path of ['scripts/test-duty-graph-continuity.mjs', 'scripts/test-editor-grips-v110355.mjs', 'scripts/verify-log-integrity-v1051.mjs', 'scripts/test-document-continuity-integration-v110375.mjs']) {
  fs.writeFileSync(path, fs.readFileSync(path, 'utf8').replaceAll("'110.4.5'", "'" + VERSION + "'").replaceAll("'v110405-team-logbook-import'", "'" + BUILD + "'"));
}
const locks = JSON.parse(fs.readFileSync('module-locks.v1.json', 'utf8'));
locks.release = VERSION;
fs.writeFileSync('module-locks.v1.json', JSON.stringify(locks, null, 2) + '\n');
console.log('Release 110.4.6: rate confirmation route locations');
