import fs from 'node:fs';
import { assert, pass } from './hos-v9581-test-utils.mjs';

const app = fs.readFileSync(new URL('../source/src/app/App.jsx', import.meta.url), 'utf8');
const tracker = fs.readFileSync(new URL('../source/src/modules/gps/DriveTrackerSheet.jsx', import.meta.url), 'utf8');
assert(tracker.includes('PAPER_RODS_NO_AUTO_DUTY_EVENTS = true'), 'paper RODS no-auto-duty-events guard missing');
assert(!app.includes('onMotionDetected={startDrivingFromMotion}'), 'motion detection is wired to create driving events');
assert(!app.includes('onAutoStopped={stopDrivingToOnDuty}'), 'auto stop is wired to create duty events');
assert(/function startDrivingFromMotion\(\) \{\s*\/\/ Smart paper RODS[\s\S]*?return;\s*\}/.test(app), 'startDrivingFromMotion is not a no-op');
pass('verify-no-gps-auto-driving-v9581');
