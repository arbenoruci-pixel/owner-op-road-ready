import fs from 'node:fs';
import { assert, pass } from './hos-v9581-test-utils.mjs';

const app = fs.readFileSync(new URL('../source/src/app/App.jsx', import.meta.url), 'utf8');
assert(app.includes("import DriveModeScreen"), 'DriveModeScreen import missing');
assert(app.includes("state.view === 'driveMode'"), 'driveMode view branch missing');
assert(app.includes("status === 'D' ? 'driveMode'"), 'manual D status does not navigate to Drive Mode');
assert(app.includes("initial.currentStatus === 'D' ? { ...initial, view:'driveMode'"), 'reopen while driving does not route to Drive Mode');
pass('verify-drive-mode-opens-on-driving-v9581');
