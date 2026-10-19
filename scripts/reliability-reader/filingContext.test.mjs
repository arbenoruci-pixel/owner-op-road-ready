import test from 'node:test';
import assert from 'node:assert/strict';
import {freezeFilingContext,retainFilingChoice,assertFilingContext,filingContextMessage} from './filingContext.js';
test('Add POD keeps exact type, load and stop through late reader results',()=>{
 const request={kind:'pod',loadNo:'LOAD-A',stopSequence:2,date:'2026-10-12'},context=freezeFilingContext(request);request.loadNo='LOAD-B';request.kind='bol';
 assert.equal(retainFilingChoice(context,'type','bol'),'pod');assert.equal(retainFilingChoice(context,'loadNo','LOAD-B'),'LOAD-A');assert.equal(retainFilingChoice(context,'stopSequence',4),2);assert.equal(retainFilingChoice(context,'assignment','source_match'),'driver_requested_context');assert.equal(retainFilingChoice(context,'linkToLogbook',true),false);
 assert.equal(context.requestedWeek,'2026-10-12');assert.equal(context.documentDate,undefined);assert.equal(retainFilingChoice(context,'documentDate','2026-10-15'),'2026-10-15');
 assert.doesNotThrow(()=>assertFilingContext(context,{type:'pod',loadNo:'LOAD-A',stopSequence:2}));
 assert.throws(()=>assertFilingContext(context,{type:'pod',loadNo:'LOAD-B',stopSequence:2}),/requested document folder/);
 assert.match(filingContextMessage(context,{fields:{readerSourceFieldsV110393:{fields:{loadNo:{value:'LOAD-B'}}}}}),/different load reference/);
});
test('generic import still permits an explicit choice and no implicit week date',()=>{
 assert.equal(freezeFilingContext({kind:'auto',loadNo:'A'}),null);assert.equal(freezeFilingContext({kind:'pod'}),null);assert.equal(retainFilingChoice(null,'type','bol'),'bol');assert.equal(retainFilingChoice(null,'loadNo','A'),'A');
});
