import assert from 'node:assert/strict';
import {
  COMMON_LOG_TIME_ZONES,
  isValidTimeZone,
  normalizeTimeZone,
  timeZoneSettingSummary,
} from '../source/src/core/time/homeTerminalTime.js';

for (const zone of ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'Pacific/Honolulu', 'Europe/Belgrade']) {
  assert.equal(isValidTimeZone(zone), true, `${zone} is valid`);
  assert.equal(normalizeTimeZone(zone), zone, `${zone} normalizes to itself`);
}
assert(COMMON_LOG_TIME_ZONES.some(zone => zone.value === 'America/New_York'), 'common choices include Eastern');
assert(COMMON_LOG_TIME_ZONES.some(zone => zone.value === 'America/Chicago'), 'common choices include Central');
assert.equal(normalizeTimeZone('Bad/Zone'), 'America/New_York', 'invalid zone falls back safely');
assert.match(timeZoneSettingSummary('America/Chicago'), /Central Time/);
console.log('PASS verify-custom-timezone-option-v9584');
