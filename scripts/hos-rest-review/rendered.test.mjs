import assert from 'node:assert/strict';
import {register} from 'node:module';
import {mock} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {day,at,fixture} from './fixture.mjs';
register(new URL('../test-jsx-loader.mjs',import.meta.url));
mock.timers.enable({apis:['Date'],now:at});
const {default:Editor}=await import('../../source/src/modules/editor/EditEventSheet.jsx');
for(const sentinel of [true,false]) {
  const state=fixture({sentinel}),before=structuredClone(state);
  const html=renderToStaticMarkup(React.createElement(Editor,{
    event:state.eventsByDay[day].at(-1),events:state.eventsByDay[day],logbookContext:state,
  }));
  assert.match(html,/2h 17m/);
  assert.match(html,/aria-label="End time"[^>]*value="00:00"/);
  assert.match(html,/save-main[^>]*disabled/,'opening an unchanged event must keep Save disabled');
  assert.deepEqual(state,before);
}
mock.timers.reset();
console.log('PASS — actual editor renders the same 2h17m midnight interval from both sentinel and completed records');
