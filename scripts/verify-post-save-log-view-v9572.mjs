import fs from 'node:fs';

const app = fs.readFileSync('source/src/app/App.jsx', 'utf8');
const day = fs.readFileSync('source/src/modules/logbook/DayLogScreen.jsx', 'utf8');
const css = fs.readFileSync('source/src/styles.css', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const appVersion = fs.readFileSync('source/src/core/update/appUpdate.js', 'utf8');
const sw = fs.readFileSync('public/sw.js', 'utf8');
const remote = JSON.parse(fs.readFileSync('public/app-version.json', 'utf8'));


function versionAtLeast(version, min) {
  const a = String(version || '').split('.').map(Number);
  const b = String(min || '').split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return true;
}

const checks = [];
function check(name, ok) {
  checks.push({ name, ok: !!ok });
}

check('package version is 95.72.0 or newer', versionAtLeast(pkg.version, '95.72.0'));
check('current app version is 95.72.0 or newer', versionAtLeast((appVersion.match(/CURRENT_APP_VERSION\s*=\s*'([^']+)'/) || [])[1], '95.72.0'));
check('service worker version is 95.72.0 or newer', versionAtLeast((sw.match(/OWNER_OP_SW_VERSION\s*=\s*'([^']+)'/) || [])[1], '95.72.0'));
check('remote app version is 95.72.0 or newer', versionAtLeast(remote.version, '95.72.0'));
check('DayLogScreen does not enter editing-graph only because selectedEvent exists', !day.includes('selectedEvent ? "editing-graph"'));
check('DayLogScreen root still includes graph-first-screen', day.includes('graph-first-screen'));
check('live status save clears selectedEventId', /currentTrailer:\s*trailer,[\s\S]{0,260}selectedEventId:null,[\s\S]{0,120}sheet:\s*null/.test(app));
check('edit event save clears selectedEventId and closes sheet', /let next = \{ \.\.\.s, gpsTrip, routeLegsByDay, eventsByDay, selectedEventId:null, sheet:null \};/.test(app));
check('edit sheet close clears selectedEventId', /onClose=\{\(\)=>setState\(s=>\(\{ \.\.\.s, sheet:null, selectedEventId:null \}\)\)\}/.test(app));
check('CSS v95.72 post-save override exists', css.includes('v95.72 post-save log return'));
check('CSS restores natural log graph height', /graph-first-screen[\s\S]{0,220}height:auto!important;[\s\S]{0,80}min-height:0!important/.test(css));
check('CSS safety override keeps event list visible if old editing-graph class appears', /editing-graph \.clean-events[\s\S]{0,240}display:block!important/.test(css));

const failed = checks.filter(c => !c.ok);
if (failed.length) {
  console.error('v95.72 verifier failed:');
  for (const item of failed) console.error(`- ${item.name}`);
  process.exit(1);
}
console.log(`v95.72 verifier passed (${checks.length} checks).`);
