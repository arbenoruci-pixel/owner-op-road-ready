import assert from 'node:assert/strict';
import {routeLegsForDayCanonical,routeLegsForDayMiles} from '../source/src/core/routes/routeNormalization.js';
const day='2026-09-13',other='2026-09-14';
const target={id:'shared-route',day,pickupDay:day,fromCity:'Example',toCity:'Receiver',loadNo:'SHARED',status:'open'};
let passed=0;const test=(label,fn)=>{fn();passed++;console.log('PASS — '+label);};
// P1 regression: source-bucket insertion order must not defeat saved revisions.
const {newestRouteCopies}=await import('../source/src/core/routes/routeProjectionV110352.js');
test('newer delivered copy wins in both projections regardless of bucket order',()=>{
 const old={...target,status:'open',miles:12,updatedAt:1000};
 const fresh={...old,status:'delivered',deliveryDay:other,deliveryEventId:'delivery',miles:467.19,updatedAt:2000};
 for(const copies of [[old,fresh],[fresh,old]]){
  const s={routeLegsByDay:{first:[copies[0]],second:[copies[1]]}},snapshot=structuredClone(copies);
  assert.equal(routeLegsForDayCanonical(s,day)[0].status,'delivered');
  assert.equal(routeLegsForDayMiles(s,day)[0].miles,467.19);
  assert.equal(routeLegsForDayCanonical(s,'2026-09-15').length,0,'closed latest copy cannot carry an older Pending route');
  assert.deepEqual(copies,snapshot);
 }
});
test('newer reopened copy beats stale delivery and revised mileage day suppresses the old day',()=>{
 const old={...target,status:'delivered',deliveryEventId:'old-delivery',miles:1,updatedAt:'2026-09-13T12:00:00Z'};
 const fresh={...target,status:'open',miles:200,milesDay:other,updatedAt:'2026-09-14T12:00:00Z'};
 for(const copies of [[old,fresh],[fresh,old]]){
  const s={routeLegsByDay:{one:[copies[0]],two:[copies[1]]}};
  assert.equal(routeLegsForDayCanonical(s,day)[0].status,'open');
  assert.equal(routeLegsForDayMiles(s,day).length,0);
  assert.equal(routeLegsForDayMiles(s,other)[0].miles,200);
 }
});
test('newer cancelled and excluded revisions suppress older visible duplicates before filters',()=>{
 const old={...target,updatedAt:1000};
 for(const changed of [{status:'cancelled'},{logbookExcludedDaysV110352:[day]}]){
  const fresh={...old,...changed,updatedAt:2000};
  for(const copies of [[old,fresh],[fresh,old]]){
   const s={routeLegsByDay:{one:[copies[0]],two:[copies[1]]}};
   assert.equal(routeLegsForDayCanonical(s,day).length,0);
   assert.equal(routeLegsForDayMiles(s,day).length,0);
  }
 }
});
test('equal, missing and malformed timestamps are deterministic; independent IDs and ID-less records stay distinct',()=>{
 const old={...target,updatedAt:'invalid'},fresh={...old,status:'delivered',miles:33,updatedAt:undefined};
 assert.deepEqual(newestRouteCopies([old,fresh]),newestRouteCopies([fresh,old]));
 const a={...target,updatedAt:4000,miles:10},b={...a,miles:20};
 assert.deepEqual(newestRouteCopies([a,b]),newestRouteCopies([b,a]));
 assert.equal(newestRouteCopies([{...old,id:0},{...fresh,id:0}]).length,1);
 assert.equal(newestRouteCopies([old,{...old,id:'distinct'},{...old,id:''},{...old,id:''}]).length,4);
 assert.deepEqual(newestRouteCopies([{...a,logbookExcludedDaysV110352:[day]},{...b,updatedAt:5000}])[0].logbookExcludedDaysV110352,[day]);
});
console.log(passed+' route authority regression groups passed');
