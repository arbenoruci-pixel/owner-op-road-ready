import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ACCESS_CHECK_TIMEOUT_MS,
  APPROVAL_PREFIX,
  AUTH_STORAGE_KEY,
  OFFLINE_GRACE_MS,
  SESSION_CHECK_TIMEOUT_MS,
  approvalIsFresh,
  cachedApprovedUser,
  settleWithin,
  storedAuthUser,
} from '../../source/src/modules/auth/authStartupV110377.js';

let count=0;
async function test(name,fn){await fn();count+=1;console.log('PASS — '+name);}

function storage(rows={}) {
  const map=new Map(Object.entries(rows));
  return {
    getItem:key=>map.has(key)?map.get(key):null,
    setItem:(key,value)=>map.set(key,String(value)),
    removeItem:key=>map.delete(key),
  };
}

const user={id:'driver-1',email:'driver@example.test',email_confirmed_at:'2026-01-01T00:00:00Z'};
const now=1_800_000_000_000;

await test('stored Supabase identity can unlock only its matching approved-device row',()=>{
  const store=storage({
    [AUTH_STORAGE_KEY]:JSON.stringify({access_token:'secret-token',refresh_token:'secret-refresh',user}),
    [APPROVAL_PREFIX+user.id]:JSON.stringify({userId:user.id,email:user.email,verifiedAt:now-1000}),
  });
  assert.deepEqual(storedAuthUser(store),user);
  const cached=cachedApprovedUser(store,now);
  assert.deepEqual(cached.user,user);
  assert.equal(cached.approval.userId,user.id);
  assert.equal(JSON.stringify(cached).includes('secret-token'),false,'cached startup data never exposes auth tokens');
});

await test('expired or mismatched approval cannot fast-path startup',()=>{
  const base={[AUTH_STORAGE_KEY]:JSON.stringify({user})};
  assert.equal(cachedApprovedUser(storage({...base,[APPROVAL_PREFIX+user.id]:JSON.stringify({userId:user.id,email:user.email,verifiedAt:now-OFFLINE_GRACE_MS-1})}),now),null);
  assert.equal(cachedApprovedUser(storage({...base,[APPROVAL_PREFIX+user.id]:JSON.stringify({userId:'other',email:user.email,verifiedAt:now})}),now),null);
  assert.equal(cachedApprovedUser(storage({...base,[APPROVAL_PREFIX+user.id]:JSON.stringify({userId:user.id,email:'other@example.test',verifiedAt:now})}),now),null);
  assert.equal(approvalIsFresh(null,user,now),false);
});

await test('missing or malformed stored session never unlocks local records',()=>{
  assert.equal(storedAuthUser(storage()),null);
  assert.equal(storedAuthUser(storage({[AUTH_STORAGE_KEY]:'{bad'})),null);
  assert.equal(cachedApprovedUser(storage({[APPROVAL_PREFIX+user.id]:JSON.stringify({userId:user.id,email:user.email,verifiedAt:now})}),now),null);
});

await test('session and access operations are time bounded',async()=>{
  assert.ok(SESSION_CHECK_TIMEOUT_MS>0&&SESSION_CHECK_TIMEOUT_MS<=3000);
  assert.ok(ACCESS_CHECK_TIMEOUT_MS>SESSION_CHECK_TIMEOUT_MS&&ACCESS_CHECK_TIMEOUT_MS<=5000);
  const started=Date.now();
  await assert.rejects(()=>settleWithin(new Promise(()=>{}),70,'synthetic check'),error=>error?.name==='TimeoutError'&&/synthetic check timed out/.test(error.message));
  assert.ok(Date.now()-started<1000,'timeout must settle promptly');
  assert.equal(await settleWithin(Promise.resolve('ok'),500,'fast check'),'ok');
});

await test('AuthGate opens cached approval before network revalidation and bounds every startup check',()=>{
  const source=fs.readFileSync('source/src/modules/auth/AuthGate.jsx','utf8');
  assert.match(source,/cachedApprovedUser\(window\.localStorage\)/);
  assert.match(source,/setStage\('approved'\)/);
  assert.match(source,/settleWithin\(\s*supabase\.auth\.getSession\(\)/);
  assert.match(source,/settleWithin\(\s*supabase\.rpc\('owner_op_access_v1'\)/);
  assert.doesNotMatch(source,/\}, \[supabase, verifyAccess, stage\]\)/,'stage changes must not resubscribe the auth bootstrap effect');
  assert.match(source,/Secure session check is taking too long/);
});

await test('sign out still clears approval before dropping the session',()=>{
  const source=fs.readFileSync('source/src/modules/auth/AuthGate.jsx','utf8');
  const start=source.indexOf('async function signOut()');
  const end=source.indexOf('\n  if (stage ===',start);
  const block=source.slice(start,end);
  assert.match(block,/clearApproval\(session\?\.user\)/);
  assert.match(block,/supabase\.auth\.signOut\(\)/);
  assert.match(block,/setStage\('signed_out'\)/);
});

console.log(count+' secure-session startup regression groups passed');
