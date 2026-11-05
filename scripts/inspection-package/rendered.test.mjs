import test,{mock} from 'node:test';import assert from 'node:assert/strict';import {register} from 'node:module';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {fixture,at} from '../inspection-signed/fixture.mjs';
register(new URL('../test-jsx-loader.mjs',import.meta.url));register(new URL('../inspection-signed/jsx-loader.mjs',import.meta.url));
mock.timers.enable({apis:['Date'],now:at});
const {default:Wizard}=await import('../../source/src/modules/dot/InspectionWizard.jsx');
test('the original three-step wizard is restored, with the saved phone wallet listed and no version choices',()=>{
 const state=fixture();state.dotWallet={documents:{driver_license:{attachmentDataUrl:'data:image/png;base64,dGVzdA=='}}};const before=structuredClone(state);
 const html=renderToStaticMarkup(React.createElement(Wizard,{state}));
 assert.match(html,/STEP 1 OF 3/);for(const text of ['Review','Inspection link','Officer email','Digital Wallet','CDL / Driver License','1 saved documents'])assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/Use this phone|Use saved account|Choose the correct|Driver daily log|Inspection logbook|presented separately/);
 assert.match(html,/disabled=""[^>]*>Prepare inspection link/);assert.deepEqual(state,before);
});
