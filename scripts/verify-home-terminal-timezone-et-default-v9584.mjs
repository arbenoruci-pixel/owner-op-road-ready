import assert from 'node:assert/strict';
import {
  DEFAULT_HOME_TERMINAL_TIMEZONE,
  getHomeTerminalTimeZone,
  homeTerminalConfigFromState,
  timeZoneSettingSummary,
} from '../source/src/core/time/homeTerminalTime.js';

assert.equal(DEFAULT_HOME_TERMINAL_TIMEZONE, 'America/New_York', 'default timezone is Eastern');
assert.equal(getHomeTerminalTimeZone({}), 'America/New_York', 'empty state resolves to Eastern');
const cfg = homeTerminalConfigFromState({});
assert.equal(cfg.timeZone, 'America/New_York', 'config defaults to America/New_York');
assert.match(timeZoneSettingSummary(cfg.timeZone), /Eastern Time/);
console.log('PASS verify-home-terminal-timezone-et-default-v9584');
