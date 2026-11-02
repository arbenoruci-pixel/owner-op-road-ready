import test from 'node:test';
import assert from 'node:assert/strict';
import {PC_MODE,PC_REASON,activitySpecialMode,choosePersonalConveyance,specialModeEdit} from './mode.js';
test('PC requires the explicit OFF activity; bobtail, delivery and prose never imply PC',()=>{
  assert.equal(activitySpecialMode('OFF',[PC_REASON]),PC_MODE);
  for(const status of ['ON','D','SB'])assert.equal(activitySpecialMode(status,[PC_REASON]),'none');
  for(const reason of ['Bobtail','Drop Load / Trailer','Driving home, personal','No Personal Conveyance'])assert.equal(activitySpecialMode('OFF',[reason]),'none');
});
test('selecting and removing PC preserves the personal explanation and does not mutate source',()=>{
  const event={note:'Driving home for personal reasons',reasons:[]},before=structuredClone(event);
  const selected=choosePersonalConveyance(event,true);
  assert.equal(selected.specialMode,PC_MODE);assert.equal(selected.status,'OFF');
  assert.equal(choosePersonalConveyance(selected,true).note,selected.note);
  const removed=choosePersonalConveyance(selected,false);
  assert.deepEqual(removed,{status:'OFF',specialMode:'none',reasons:[],note:event.note});
  assert.deepEqual(event,before);
});
test('explicit PC requires OFF, invalid categories fail, ordinary edits retain prior PC',()=>{
  const event={status:'OFF',specialMode:PC_MODE};
  assert.deepEqual(specialModeEdit(event,{note:'Reviewed'}),{ok:true,patch:{note:'Reviewed'}});
  for(const status of ['D','ON','SB']){
    assert.deepEqual(specialModeEdit(event,{status}).patch,{status,specialMode:'none'});
    assert.equal(specialModeEdit(event,{status,specialMode:PC_MODE}).ok,false);
  }
  assert.equal(specialModeEdit(event,{specialMode:'invented'}).ok,false);
});
