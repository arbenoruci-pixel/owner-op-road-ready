import assert from 'node:assert/strict';
import {register} from 'node:module';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

register(new URL('./first-paint-loader.mjs', import.meta.url));
const {default: App} = await import('../../source/src/app/App.jsx');

test('the first Home render waits for the device snapshot before displaying duty information', () => {
  // On the first render the IndexedDB effect has not run yet.
  const html = renderToStaticMarkup(React.createElement(App));
  assert.match(html, /role="status">Loading logbook…</);
  assert.doesNotMatch(html, /rr-driver-home|OFF DUTY|Location needed/i);
});
