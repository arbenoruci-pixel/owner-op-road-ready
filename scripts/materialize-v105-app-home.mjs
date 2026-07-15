import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
const write = (relative, content) => fs.writeFileSync(file(relative), content);
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v100.5 missing ${label}`);
  return content.replace(before, after);
}

const appPath = 'source/src/app/App.jsx';
let app = read(appPath);
app = replaceOnce(
  app,
  `import { signableLogDays, signConfirmMessage, signBlockMessage } from '../modules/logbook/signing.js';`,
  `import { signableLogDays, signConfirmMessage, signBlockMessage } from '../modules/logbook/signing.js';
import { normalizeCompletedDayCertificationV105 } from '../modules/logbook/certificationIntegrityV105.js';`,
  'App certification integrity import'
);
app = replaceOnce(
  app,
  `  const certifyStatus = { ...DEMO_CERTIFY_STATUS, ...(s.certifyStatus || {}) };`,
  `  let certifyStatus = { ...DEMO_CERTIFY_STATUS, ...(s.certifyStatus || {}) };`,
  'mutable normalized certification state'
);
app = replaceOnce(
  app,
  `  ensureTodayCarryover(eventsByDay, certifyStatus, today);
  refreshCarryoverIfOnlyPlaceholder(eventsByDay, today);
  const todayRawEvents = rawStoredEventsForDay(eventsByDay, today);`,
  `  ensureTodayCarryover(eventsByDay, certifyStatus, today);
  refreshCarryoverIfOnlyPlaceholder(eventsByDay, today);
  certifyStatus = normalizeCompletedDayCertificationV105(certifyStatus, s.signatureByDay || {}, eventsByDay, today);
  const todayRawEvents = rawStoredEventsForDay(eventsByDay, today);`,
  'completed day certification normalization'
);
app = replaceOnce(
  app,
  `      const eventsByDay = { ...s.eventsByDay };
      const certifyStatus = { ...s.certifyStatus };`,
  `      const eventsByDay = { ...s.eventsByDay };
      let certifyStatus = normalizeCompletedDayCertificationV105({ ...s.certifyStatus }, s.signatureByDay || {}, eventsByDay, localDayKey());`,
  'openDay certification normalization'
);
write(appPath, app);

const homePath = 'source/src/modules/home/HomeScreen.jsx';
let home = read(homePath);
home = replaceOnce(
  home,
  `import DriverLoadGuideV103 from '../loads/DriverLoadGuideV103.jsx';`,
  `import DriverLoadGuideV103 from '../loads/DriverLoadGuideV103.jsx';
import { activeGuideLoadSummaryV105 } from '../loads/activeLoadSummaryV105.js';`,
  'Home active guide summary import'
);
home = replaceOnce(
  home,
  `  const activeLoad = useMemo(() => activeLoadSummary(state, businessStore), [state, businessStore]);`,
  `  const activeLoad = useMemo(() => activeGuideLoadSummaryV105(state, businessStore) || activeLoadSummary(state, businessStore), [state, businessStore]);`,
  'Home active guide priority'
);
write(homePath, home);

console.log('v100.5 app and Home patch applied');
