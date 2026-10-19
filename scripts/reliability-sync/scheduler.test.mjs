import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncScheduler } from './scheduler.js';

function fixture(handler = async () => ({}), overrides = {}) {
  let tick = 0, id = 0, connected = true; const timers = new Map(), calls = [], retries = [];
  const queue = createSyncScheduler({
    sync: async options => { calls.push({ at: tick, ...options }); return handler(options); },
    now: () => tick, random: () => 0, online: () => connected,
    setTimer: (fn, ms) => { timers.set(++id, { fn, at: tick + ms }); return id; },
    clearTimer: key => timers.delete(key), onRetry: item => retries.push(item), ...overrides,
  });
  async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
  async function advance(ms = 0) {
    const target = tick + ms;
    for (let count = 0; count < 1000; count++) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > target) { tick = target; await flush(); return; }
      tick = next[1].at; timers.delete(next[0]); next[1].fn(); await flush();
    }
    throw Error('Runaway timer loop');
  }
  return { queue, calls, retries, advance, flush, online(value) { connected = value; } };
}

test('idle app performs one startup archive, then only minute metadata checks', async () => {
  const f = fixture(); f.queue.start(); await f.advance(59000);
  assert.deepEqual(f.calls.map(c => c.scope), ['records', 'all']);
  await f.advance(125000);
  assert.equal(f.calls.filter(c => c.scope === 'all').length, 1);
  assert.ok(f.calls.length <= 5);
});
test('a burst of durable saves coalesces into one records pass and one archive', async () => {
  const f = fixture(); f.queue.start(); await f.advance(2000); f.calls.length = 0;
  for (let i = 0; i < 40; i++) f.queue.saved();
  await f.advance(2000);
  assert.deepEqual(f.calls.map(c => c.scope), ['records', 'all']);
  assert.equal(f.queue.inspect().pending, false);
});
test('a durable save during a request is captured by a fresh follow-up', async () => {
  let release; let first = true;
  const f = fixture(() => first ? (first = false, new Promise(r => { release = r; })) : {});
  f.queue.start(); await f.advance(0); f.queue.saved(); release({}); await f.flush();
  await f.advance(2000);
  assert.deepEqual(f.calls.map(c => c.scope), ['records', 'records', 'all']);
  assert.equal(f.queue.inspect().pending, false);
});
test('offline local work remains pending without a retry storm and resumes online', async () => {
  let offline = true; const f = fixture(async () => offline ? { offline: true } : {});
  f.online(false); f.queue.start(); f.queue.saved(); await f.advance(600000);
  assert.equal(f.calls.length, 1, 'Startup checks the owned offline copy once'); assert.equal(f.queue.inspect().pending, true);
  for(let i=0;i<40;i++){f.queue.saved();f.queue.wake();await f.advance(3000);}
  assert.equal(f.calls.length,1,'Offline edits and page focus cannot repeat the startup ownership attempt');
  offline = false; f.online(true); f.queue.wake({ reconnect: true }); await f.advance(2000);
  assert.deepEqual(f.calls.map(c => c.scope), ['records', 'records', 'all']);
});
test('persistent failures back off and a new save cannot bypass retry limits', async () => {
  const f = fixture(async () => ({ error: 'Synthetic network failure' }));
  f.queue.start(); await f.advance(0);
  for (let i = 0; i < 100; i++) f.queue.saved();
  await f.advance(4999); assert.equal(f.calls.length, 1);
  await f.advance(30001); assert.deepEqual(f.calls.map(c => c.at), [0, 5000, 15000, 35000]);
  assert.equal(f.queue.inspect().pending, true);
});
test('busy second tab retains work and retries after a bounded delay', async () => {
  let busy = true; const f = fixture(async () => busy ? { busy: true } : {});
  f.queue.start(); await f.advance(0); assert.equal(f.queue.inspect().recordsAck, 0);
  busy = false; await f.advance(2000); assert.equal(f.queue.inspect().pending, false);
});
test('actual conflicting versions stop automation until explicit review', async () => {
  let reviewed = false;
  const f = fixture(async options => options.choices ? (reviewed = true, {}) : reviewed ? {} : { conflicts: [{ key: 'day' }] });
  f.queue.start(); await f.advance(600000); f.queue.saved(); await f.advance(600000);
  assert.equal(f.calls.length, 1); assert.equal(f.queue.inspect().blocked, true);
  f.queue.retry({ day: 'remote' }); await f.advance(2000);
  assert.equal(reviewed, true); assert.equal(f.queue.inspect().pending, false);
});
test('document-only changes do not delay behind an unrelated record edit', async () => {
  const f = fixture(); f.queue.start(); await f.advance(2000); f.calls.length = 0;
  f.queue.saved({ scope: 'all' }); await f.advance(2000);
  assert.deepEqual(f.calls.map(c => c.scope), ['all']);
});
test('archive receives are preempted for a new durable log save', async () => {
  let release, priorities = 0;
  const f = fixture(options => options.scope === 'all' && !release ? new Promise(r => { release = r; }) : {}, { prioritize: () => priorities++ });
  f.queue.start(); await f.advance(1200); f.queue.saved(); release({ deferred: true }); await f.flush();
  await f.advance(2000);
  assert.equal(priorities, 1); assert.deepEqual(f.calls.map(c => c.scope), ['records', 'all', 'records', 'all']);
});
test('closing a view disposes timers and late results cannot restart it', async () => {
  let release; const f = fixture(() => new Promise(r => { release = r; }));
  f.queue.start(); await f.advance(0); f.queue.stop(); release({}); await f.flush(); await f.advance(600000);
  assert.equal(f.calls.length, 1);
});
