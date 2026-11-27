import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { watchOperatorBuild, trackPodUpload } from '../../app/operator/operatorUpdate.js';

function events() {
  const handlers = new Map();
  return {
    addEventListener(type, fn) { if (!handlers.has(type)) handlers.set(type,new Set()); handlers.get(type).add(fn); },
    removeEventListener(type, fn) { handlers.get(type)?.delete(fn); },
    emit(type, target) { for (const handler of handlers.get(type) || []) handler({type, target}); },
  };
}

function fixture({ url = '/operator?podInvoice=load#tools', initialUrl = url, storage = new Map(), build = 'build-a' } = {}) {
  const state = {remote:build, requests:0, reloads:[], notices:[], busy:false, fields:[], controls:[]};
  const toUrl = path => new URL(path, 'https://example.test').href;
  const doc = {
    ...events(), body:{}, visibilityState:'visible',
    querySelector:selector => (selector.includes('passive-view') ? state.passive : state.busy) ? {} : null,
    querySelectorAll:() => state.fields,
  };
  const win = {
    ...events(), navigator:{onLine:true},
    location:{href:toUrl(url), reload:() => state.reloads.push(win.location.href)},
    performance:{getEntriesByType:() => [{name:toUrl(initialUrl)}]},
    sessionStorage:{getItem:k => storage.get(k), setItem:(k,v) => storage.set(k,v)},
    setTimeout, clearTimeout,
    MutationObserver:class { constructor(fn){state.mutate=fn;} observe() {} disconnect() {} },
    fetch:async (url, opts) => {
      assert.match(url,/^\/app-version\.json\?operator=/);assert.equal(opts.cache,'no-store');assert.equal(opts.credentials,'omit');
      state.requests++;
      if(state.fail) throw Error('offline');
      return {ok:true,json:async()=>({build:state.remote})};
    },
  };
  const watcher = watchOperatorBuild(win, doc, build, status => state.notices.push(status));
  return {state,doc,win,watcher};
}

function field(tag='INPUT') {
  return {
    matches:() => tag !== 'BUTTON', closest(selector) { return selector === 'button' && tag === 'BUTTON' ? this : null; },
    isConnected:true, tagName:tag, type:tag === 'INPUT' ? 'text' : 'button', value:'', defaultValue:'',
  };
}

test('checks cold launch, resume, online; applies a differing exact build to the same window and URL once',async()=>{
  const storage = new Map(), f = fixture({storage});await tick();
  assert.equal(f.state.requests,1);assert.deepEqual(f.state.reloads,[]);
  f.doc.visibilityState='hidden';f.state.remote='build-b';f.doc.emit('visibilitychange');await tick();
  assert.equal(f.state.requests,1);
  f.doc.visibilityState='visible';f.win.emit('pageshow');f.doc.emit('visibilitychange');f.win.emit('online');await tick();
  assert.equal(f.state.requests,2);assert.deepEqual(f.state.reloads,[f.win.location.href]);f.watcher.stop();
  const again=fixture({storage});again.state.remote='build-b';await tick();
  assert.deepEqual(again.state.reloads,[]);assert.equal(again.state.notices.at(-1),'ready');again.watcher.stop();
  const rollback=fixture({storage:new Map(),build:'build-b'});rollback.state.remote='build-a';await tick();
  assert.equal(rollback.state.reloads.length,1);rollback.watcher.stop();
});

test('ordinary navigation asks before updating, active files, dialog and submitted upload block it',async()=>{
  const f=fixture();await tick();
  f.doc.emit('click',field('BUTTON'));f.state.remote='build-b';f.win.emit('pageshow');await tick();
  assert.equal(f.state.notices.at(-1),'ready');assert.equal(f.state.reloads.length,0);
  f.state.fields=[{type:'file',files:[{}]}];await f.watcher.apply();assert.equal(f.state.notices.at(-1),'busy');
  f.state.fields=[];f.state.busy=true;await f.watcher.apply();assert.equal(f.state.reloads.length,0);
  f.state.busy=false;
  let finish;const active=trackPodUpload(new Promise(resolve=>{finish=resolve;}));
  await f.watcher.apply();assert.equal(f.state.reloads.length,0);
  finish();await active;
  await f.watcher.apply();assert.deepEqual(f.state.reloads,[f.win.location.href]);f.watcher.stop();
});

test('controlled inputs retain edits after React updates defaultValue; after form unmount manual refresh is safe',async()=>{
  const f=fixture();await tick();
  const input=field();f.doc.emit('focusin',input);input.value='draft';f.doc.emit('input',input);input.defaultValue=input.value;
  f.state.remote='build-b';f.win.emit('online');await tick();assert.equal(f.state.notices.at(-1),'busy');
  await f.watcher.apply();assert.equal(f.state.reloads.length,0);
  input.isConnected=false;f.state.mutate();
  assert.equal(f.state.notices.at(-1),'ready');
  f.state.fail=true;await f.watcher.apply();assert.equal(f.state.reloads.length,0);
  f.state.fail=false;await f.watcher.apply();assert.equal(f.state.reloads.length,1);f.watcher.stop();
});

test('preserves email confirmation and callbacks even after the auth SDK consumes their parameters',async()=>{
  for (const initialUrl of ['/operator/confirm','/operator?code=example','/operator#access_token=example']) {
    const f=fixture({initialUrl});f.state.remote='build-b';f.win.emit('pageshow');await f.watcher.apply();await tick();
    assert.equal(f.state.requests,0);assert.equal(f.state.reloads.length,0);f.watcher.stop();
  }
  const f=fixture();await tick();f.win.navigator.onLine=false;f.state.remote='build-b';
  f.win.emit('online');await tick();assert.equal(f.state.requests,1);assert.equal(f.state.reloads.length,0);
  f.watcher.stop();f.win.navigator.onLine=true;f.win.emit('online');await tick();assert.equal(f.state.requests,1);
});

test('automatically refreshes a clean Load or Pay screen after passive navigation and a real background round trip',async()=>{
  const f=fixture();await tick();
  const tab=field('BUTTON');
  tab.closest=selector=>selector.includes('operator-navigation') || selector==='button' ? tab : null;
  f.state.passive=true;f.doc.emit('click',tab);
  f.state.remote='build-b';
  f.win.emit('pageshow');await tick();assert.equal(f.state.reloads.length,0);
  f.doc.visibilityState='hidden';f.doc.emit('visibilitychange');f.doc.visibilityState='visible';f.doc.emit('visibilitychange');await tick();
  assert.equal(f.state.reloads.length,1);f.watcher.stop();
});

test('opening a form, then returning from the background never interrupts the draft or an email code request',async()=>{
  const f=fixture();await tick();f.state.passive=true;
  f.doc.emit('click',field('BUTTON'));f.state.busy=true;
  f.doc.visibilityState='hidden';f.doc.emit('visibilitychange');f.state.remote='build-b';
  f.doc.visibilityState='visible';f.doc.emit('visibilitychange');await tick();
  assert.deepEqual(f.state.reloads,[]);assert.equal(f.state.notices.at(-1),'busy');f.watcher.stop();
});
