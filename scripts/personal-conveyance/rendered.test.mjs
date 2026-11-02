import test from 'node:test';
import assert from 'node:assert/strict';
import {register,createRequire} from 'node:module';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
register(new URL('../test-jsx-loader.mjs',import.meta.url));
const {default:EditEventSheet}=await import('../../source/src/modules/editor/EditEventSheet.jsx');
test('recorded OFF editor exposes PC, shows saved selection and keeps guidance beside notes',()=>{
  for(const mode of ['none','personal_conveyance']){
    const day='2026-09-18',event={id:'test-personal',status:'OFF',specialMode:mode,startMin:600,endMin:710,city:'Test City',state:'IL',note:'Home for rest',reasons:[]};
    const state={activeDay:day,homeTerminalTimeZone:'America/New_York',currentStatus:'OFF',eventsByDay:{[day]:[event]},equipment:{},signatureByDay:{},routeLegsByDay:{}};
    const before=structuredClone(state);
    const html=renderToStaticMarkup(React.createElement(EditEventSheet,{event,events:[event],logbookContext:state,onClose(){},onSave(){}}));
    assert.match(html,new RegExp('aria-label="Personal Conveyance" aria-pressed="'+(mode==='personal_conveyance')+'"'));
    assert.equal(html.includes('Bobtail alone does not establish personal use.'),mode==='personal_conveyance');
    assert.deepEqual(state,before);
  }
});
test('all modified React modules compile with the application Babel parser',()=>{
  const require=createRequire(import.meta.url),babel=require('next/dist/compiled/babel/core'),preset=require.resolve('next/dist/compiled/babel/preset-react');
  for(const file of ['source/src/app/App.jsx','source/src/modules/editor/EditEventSheet.jsx','source/src/modules/editor/InsertEditEventSheet.jsx']){
    assert.ok(babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,babelrc:false,configFile:false,presets:[preset]}).code);
  }
});
