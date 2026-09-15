import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const VERSION = '110.3.52';
const BUILD = 'v110352-day-load-cleanup';

// Presentation only: retain signedAt, signature images, fingerprints and history.
export function patchDotSignaturePresentation(input) {
  let source = input;
  function replaceLabelFunction(name, body) {
    const pattern = new RegExp('^function ' + name + '\\(state, day\\) \\{[\\s\\S]*?^\\}', 'gm');
    const matches = [...source.matchAll(pattern)];
    assert.equal(matches.length, 1, 'DOT signature function anchor: ' + name);
    const replacement = `function ${name}(state, day) {\n${body}\n}`;
    if (matches[0][0] === replacement) return;
    assert.ok(matches[0][0].includes('sig.signed') && matches[0][0].includes('sig.signedAt'), 'Unexpected DOT signature implementation: ' + name);
    source = source.replace(pattern, () => replacement);
  }
  replaceLabelFunction('signatureLabel', "  return signatureForDay(state, day).signed ? 'Signed' : 'Not signed';");
  replaceLabelFunction('officerSignatureLabel', '  return signatureLabel(state, day);');
  source = source.replaceAll('Certification:', 'Signature:');
  const before = '<em>{officerSignatureLabel(state, selectedDay)}</em>';
  const after = '<em style={signatureForDay(state, selectedDay).signed ? undefined : { color: \'var(--muted, #6b7280)\' }}>{officerSignatureLabel(state, selectedDay)}</em>';
  if (!source.includes(after)) {
    assert.equal(source.split(before).length - 1, 1, 'DOT selected-day signature badge anchor');
    source = source.replace(before, after);
  }
  return source;
}

export function patchDeletedDayLoadCleanup(input) {
  let source = input;
  const helperAnchor = '  function deleteEvent(id) {';
  const helper = `  function cleanupLoadDatesForDeletedDay(sourceState, day) {
    function cleanRouteMap(inputMap = {}) {
      const output = {};
      for (const [bucketDay, legs] of Object.entries(inputMap || {})) {
        for (const original of (Array.isArray(legs) ? legs : [])) {
          if (!original || typeof original !== 'object') continue;
          const touchesDay = bucketDay === day || original.day === day || original.pickupDay === day || original.deliveryDay === day;
          if (!touchesDay) {
            (output[bucketDay] ||= []).push(original);
            continue;
          }
          const leg = { ...original };
          if (leg.pickupDay === day) { leg.pickupDay = ''; leg.pickupEventId = ''; leg.pickupMin = null; }
          if (leg.deliveryDay === day) { leg.deliveryDay = ''; leg.deliveryEventId = ''; leg.deliveryMin = null; }
          if (leg.day === day) leg.day = leg.pickupDay || leg.deliveryDay || '';
          const survivingDay = [leg.day, leg.pickupDay, leg.deliveryDay].find(value => value && value !== day) || '';
          if (!survivingDay) continue;
          (output[survivingDay] ||= []).push(leg);
        }
      }
      return output;
    }
    const routeLegsByDay = cleanRouteMap(sourceState.routeLegsByDay || {});
    let loadInfo = { ...(sourceState.loadInfo || {}) };
    if (loadInfo.routeLegsByDay) loadInfo.routeLegsByDay = cleanRouteMap(loadInfo.routeLegsByDay);
    for (const key of ['pickupDay','deliveryDay','pickupDate','deliveryDate','date']) {
      if (loadInfo[key] === day) loadInfo[key] = '';
    }
    if (loadInfo.sourceEventDay === day) {
      loadInfo.sourceEventDay = '';
      loadInfo.sourceEventId = '';
      loadInfo.sourceEventReason = '';
    }
    return { routeLegsByDay, loadInfo };
  }

`;
  if (!source.includes('function cleanupLoadDatesForDeletedDay(')) {
    assert.equal(source.split(helperAnchor).length - 1, 1, 'Deleted-day helper anchor');
    source = source.replace(helperAnchor, helper + helperAnchor);
  }
  const before = `      const eventsByDay = { ...s.eventsByDay, [s.activeDay]: evs };
      const routeLegsByDay = syncRouteLegTimes(removeOrUnlinkRouteLegForEvent(s.routeLegsByDay || {}, id), eventsByDay);
      let next = { ...s, loadInfo, routeLegsByDay, eventsByDay, selectedEventId:null, sheet:null };`;
  const after = `      const eventsByDay = { ...s.eventsByDay, [s.activeDay]: evs };
      let routeLegsByDay = syncRouteLegTimes(removeOrUnlinkRouteLegForEvent(s.routeLegsByDay || {}, id), eventsByDay);
      if (!evs.length) {
        const cleaned = cleanupLoadDatesForDeletedDay({ ...s, loadInfo, routeLegsByDay }, s.activeDay);
        routeLegsByDay = cleaned.routeLegsByDay;
        loadInfo = cleaned.loadInfo;
      }
      let next = normalizeLoadInfoFromRouteLegs({ ...s, loadInfo, routeLegsByDay, eventsByDay, selectedEventId:null, sheet:null });`;
  if (!source.includes(after)) {
    assert.equal(source.split(before).length - 1, 1, 'Deleted-day cleanup anchor');
    source = source.replace(before, after);
  }
  return source;
}

export function finalizeDotSignaturePresentation() {
  const dotPath = 'source/src/modules/dot/DotMode.jsx';
  fs.writeFileSync(dotPath, patchDotSignaturePresentation(fs.readFileSync(dotPath, 'utf8')));
  const appPath = 'source/src/app/App.jsx';
  fs.writeFileSync(appPath, patchDeletedDayLoadCleanup(fs.readFileSync(appPath, 'utf8')));

  const now = new Date().toISOString();
  for (const path of ['release-version.json', 'public/app-version.json']) {
    const value = JSON.parse(fs.readFileSync(path, 'utf8'));
    Object.assign(value, {
      version: VERSION, build: BUILD, force: false,
      label: 'v110.3.52 Delete day load cleanup',
      releasedAt: now, updatedAt: now,
      sourceCommit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null,
      notes: ['Keep Signed/Not signed labels without signing timestamps.', 'When the last log event for a day is deleted, remove load/route date references belonging to that day.', 'Preserve route/load information that belongs to other log days.'],
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
    let source = fs.readFileSync(path, 'utf8');
    for (const [key, value] of [['VERSION', VERSION], ['BUILD', BUILD]]) {
      const pattern = new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`);
      assert.ok(pattern.test(source), 'Release marker: ' + path + ': ' + key);
      source = source.replace(pattern, `const ${name}_${key} = '${value}';`);
    }
    fs.writeFileSync(path, source);
  }
  for (const path of ['source/src/modules/home/HomeScreen.jsx', 'source/src/shared/ui/ToolsSheet.jsx']) {
    fs.writeFileSync(path, fs.readFileSync(path, 'utf8').replace(/App v\d+\.\d+\.\d+/g, 'App v' + VERSION).replace(/APP V\d+\.\d+\.\d+/g, 'APP V' + VERSION));
  }
  const test = 'scripts/test-duty-graph-continuity.mjs';
  const before = "assert.equal(meta.version,'110.3.49');assert.equal(meta.build,'v110349-reading-evidence');";
  const after = `assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`;
  const contents = fs.readFileSync(test, 'utf8');
  if (!contents.includes(after)) {
    assert.equal(contents.split(before).length - 1, 1, 'Release test anchor');
    fs.writeFileSync(test, contents.replace(before, after));
  }
  console.log('PASS — v110.3.52 signature labels + deleted-day load cleanup installed');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  finalizeDotSignaturePresentation();
}
