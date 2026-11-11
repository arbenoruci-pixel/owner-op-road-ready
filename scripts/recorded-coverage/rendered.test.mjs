import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {fixture,day,at} from './fixture.mjs';
import {graphX} from '../../source/src/modules/graph/graphGeometryV110.js';
register(new URL('../test-jsx-loader.mjs',import.meta.url));
mock.timers.enable({apis:['Date'],now:at});
const {default:Panel}=await import('../../source/src/modules/logbook/LogCheckPanel.jsx');
const {default:Editor}=await import('../../source/src/modules/editor/EditEventSheet.jsx');
const {default:DayLog}=await import('../../source/src/modules/logbook/DayLogScreen.jsx');
test('actual daily screen draws the saved endpoint and exposes its missing tail',()=>{
  const state=fixture(),before=structuredClone(state);
  const html=renderToStaticMarkup(React.createElement(DayLog,{state,events:[],liveCurrent:{status:'ON'}}));
  const svg=html.match(/<svg[^>]*log-graph-v110[\s\S]*?<\/svg>/)?.[0];
  assert.ok(svg);
  const paths=[...svg.matchAll(/class="duty-trace-v110"[^>]* d="([^"]+)"/g)].map(match=>match[1]);
  assert.ok(paths.at(-1).endsWith('H '+graphX(1383)),'Sleeper trace ends at the saved 23:03');
  assert.match(svg,/>10\.08<\/text>/,'Sleeper total counts recorded minutes only');
  assert.match(html,/Unrecorded time: 23:03–24:00 · 57 min/);
  assert.deepEqual(state,before);
});
test('collapsed Log Check exposes 23:03–24:00 instead of OK even on a certified day',()=>{
  const state=fixture(),before=structuredClone(state);
  const html=renderToStaticMarkup(React.createElement(Panel,{state,events:state.eventsByDay[day]}));
  assert.match(html,/Unrecorded time: 23:03–24:00 · 57 min/);
  assert.doesNotMatch(html,/>OK<|No reviews/);
  assert.deepEqual(state,before);
});
test('editor opens the saved 23:03 endpoint without enabling Save or extending it',()=>{
  const state=fixture(),before=structuredClone(state);
  const html=renderToStaticMarkup(React.createElement(Editor,{event:state.eventsByDay[day].at(-1),events:state.eventsByDay[day],logbookContext:state}));
  assert.match(html,/aria-label="End time"[^>]*value="23:03"/);
  assert.match(html,/save-main[^>]*disabled/);
  assert.deepEqual(state,before);
});
