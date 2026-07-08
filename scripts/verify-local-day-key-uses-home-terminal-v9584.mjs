import assert from 'node:assert/strict';
import { localDayKey } from '../source/src/shared/utils/date.js';

const instant = new Date('2026-07-09T04:30:00.000Z');
assert.equal(localDayKey(instant, 'America/New_York'), '2026-07-09', 'Eastern day has rolled after 12:30 AM ET');
assert.equal(localDayKey(instant, 'America/Chicago'), '2026-07-08', 'Central day has not rolled at 11:30 PM CT');
assert.equal(localDayKey(new Date('2026-07-09T02:00:00.000Z'), 'America/New_York'), '2026-07-08', 'Eastern log day does not roll early just because Europe/Kosovo is next day');
console.log('PASS verify-local-day-key-uses-home-terminal-v9584');
