import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {fixture,at} from './fixture.mjs';
register(new URL('../test-jsx-loader.mjs',import.meta.url));
register(new URL('./jsx-loader.mjs',import.meta.url));
mock.timers.enable({apis:['Date'],now:at});
const {default:Wizard}=await import('../../source/src/modules/dot/InspectionWizard.jsx');
test('one real log is shown, with exact DOT time and no choice/compare UI',()=>{
  const state=fixture(),before=structuredClone(state),html=renderToStaticMarkup(React.createElement(Wizard,{state}));
  assert.match(html,/Inspection logbook/);assert.match(html,/19:22/);assert.match(html,/On Duty · DOT Inspection/);
  assert.equal((html.match(/Driver daily log/g)||[]).length,1);assert.equal((html.match(/aria-pressed=/g)||[]).length,8);
  assert.doesNotMatch(html,/Use this phone|Use saved account|Choose the correct|Saved changes|STEP [123]|Confirm logbook/);
  assert.deepEqual(state,before);
});
