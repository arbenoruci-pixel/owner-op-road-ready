import {test} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

register(new URL('../test-jsx-loader.mjs', import.meta.url));
register(new URL('./step3.css-loader.mjs', import.meta.url));
globalThis.React = React;
const {PortalSession} = await import('../../app/operator/PortalSession.jsx');
const {default:Workspace} = await import('../../app/operator/Step3Workspace.jsx');
const {default:LoadCard, trainingCardLoadId} = await import('../../app/operator/TrainingLoadCard.jsx');

const operator = {
  id:'operator', company_name:'Test workspace', driver_name:'Test driver', workspace_kind:'leased',
  carrier_user_id:'office', driver_user_id:'driver',
};

function workspace(user) {
  return renderToStaticMarkup(React.createElement(PortalSession.Provider, {value:{}},
    React.createElement(Workspace, {operator, operators:[operator], session:{user:{id:user}}})));
}

test('driver settings share one profile while the office keeps its existing controls', () => {
  const driver = workspace('driver');
  const profile = driver.match(/<details[^>]*><summary>Profile<\/summary>(.*?)<\/details>/s)?.[1];
  assert.ok(profile);
  for (const action of ['Refresh', 'Enable load alerts', 'Light mode', 'Sign out']) assert.ok(profile.includes(action));
  assert.equal((driver.match(/<svg[^>]*aria-hidden="true"/g)||[]).length, 4);
  assert.doesNotMatch(workspace('office'), /<summary>Profile<\/summary>|data-driver-portal/);
});

test('load card puts actual stops and assigned POD controls ahead of broker copy and gross', () => {
  function card(id) {
    const load = {
      id, status:'assigned', load_number:'RC-167', broker_name:'Carrier fixture',
      pickup_address:'20 Main St, Dallas, TX 75201', delivery_address:'42 West St, Austin, TX 78701',
      steps:[],
    };
    return renderToStaticMarkup(React.createElement(LoadCard, {
      load, status:'Accepted', gross:'$1,000.00', initialOpen:true,
      controls:React.createElement('button', null, 'Upload POD'),
    }, React.createElement('p', null, 'Broker email preview')));
  }
  const real = card('separate-live-load');
  assert.match(real,/Dallas, TX → Austin, TX/);
  const order = ['Route stops','Upload POD','Load Details','$1,000.00','Broker email preview'];
  const positions=order.map(text=>real.indexOf(text));
  assert.ok(positions.every((pos,i)=>pos>=0 && (i===0 || pos>positions[i-1])));
  assert.doesNotMatch(real,/Rockford Foam|Tallmadge Plant|Lot 2/);
  assert.match(card(trainingCardLoadId),/Rockford Foam/);
});
