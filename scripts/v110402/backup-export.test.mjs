import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareBackupFile, sharePreparedBackupFile } from '../../lib/local-db/backupFile.js';

const payload = { state:{ eventsByDay:{ '2026-09-21':[{ id:'event', status:'OFF' }] } }, original:'AAECAwQ=', extra:{ retained:true } };

test('prepared backup keeps every supplied record and file byte', async () => {
  for (const compact of [true, false]) {
    const file = prepareBackupFile(payload, 'backup.json', { compact });
    assert.equal(file.name, 'backup.json');
    assert.equal(file.type, 'application/json');
    assert.deepEqual(JSON.parse(await file.text()), payload);
  }
});

test('save shares the already prepared File before the click handler yields', async () => {
  const file = prepareBackupFile(payload, 'backup.json');
  let called = false;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable:true, value:{
    canShare:({files}) => files[0] === file,
    userActivation:{ isActive:true },
    share:({files}) => { called=true; assert.equal(files[0], file); return Promise.resolve(); },
  } });
  try {
    const operation = sharePreparedBackupFile(file);
    assert.equal(called, true);
    assert.deepEqual(await operation, { mode:'shared' });
  } finally { if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor); else delete globalThis.navigator; }
});

test('cancellation, expired activation and unsupported sharing remain retryable without a hidden download', async () => {
  const file = prepareBackupFile(payload, 'backup.json');
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let calls = 0;
  const nav = { userActivation:{ isActive:false }, share:async () => { calls++; throw new DOMException('Dismissed', 'AbortError'); } };
  Object.defineProperty(globalThis, 'navigator', { configurable:true, value:nav });
  try {
    assert.deepEqual(await sharePreparedBackupFile(file), { mode:'retry' });
    assert.equal(calls, 0);
    nav.userActivation.isActive = true;
    assert.deepEqual(await sharePreparedBackupFile(file), { mode:'cancelled' });
    nav.share = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
    assert.deepEqual(await sharePreparedBackupFile(file), { mode:'retry' });
    nav.canShare = () => false;
    assert.deepEqual(await sharePreparedBackupFile(file), { mode:'unavailable' });
    nav.canShare = () => { throw new Error('Unsupported file'); };
    assert.deepEqual(await sharePreparedBackupFile(file), { mode:'retry' });
    nav.share = undefined;
    assert.deepEqual(await sharePreparedBackupFile(file), { mode:'unavailable' });
    assert.deepEqual(JSON.parse(await file.text()), payload);
  } finally { if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor); else delete globalThis.navigator; }
});
