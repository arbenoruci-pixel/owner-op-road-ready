import {recordsFrom, equivalentRecords, UI_FIELDS} from './accountCoreV110455.js';

// Navigation and clock UI do not change saved records. Driver selection still
// matters because receive must never switch the driver the user is reviewing.
export function sameSyncState(before = {}, after = {}) {
  if(before === after)return true;
  before ||= {}; after ||= {};
  return before.activeDriverId === after.activeDriverId && equivalentRecords(recordsFrom({state:before}), recordsFrom({state:after}));
}
export function retainSyncNavigation(next, live) {
  if (!live) return next;
  const state = {...next};
  for (const key of UI_FIELDS) if (key !== 'activeDriverId' && Object.hasOwn(live, key)) state[key] = live[key];
  return state;
}
