import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=path=>fs.readFileSync(path,'utf8');
const changes=new Map();
function patch(path,before,after){
 let text=changes.get(path)||read(path);if(text.includes(after))return;
 assert.equal(text.split(before).length,2,'Shared current-load anchor: '+path+' / '+before.slice(0,75));
 changes.set(path,text.replace(before,()=>after));
}
const home='source/src/modules/home/AdaptiveHomeV1038.jsx',business='source/src/modules/business/OwnerOpBusinessScreen.jsx',scan='source/src/modules/scan/SmartScanSheetV105.jsx';
patch('source/src/modules/documents/documentFoundationV105.js','export function migrateBusinessStoreV105(store = {}, state = {}) {\n  const base = {',`export function migrateBusinessStoreV105(store = {}, state = {}) {
  const base = {
    ...(Array.isArray(store.evidenceAliases)?{evidenceAliases:[...store.evidenceAliases]}:{}),
    ...(Array.isArray(store.evidenceRecoveryHistory)?{evidenceRecoveryHistory:[...store.evidenceRecoveryHistory]}:{}),`);
patch(home,"import {currentHomeLoad,cleanRoutePlace} from './currentHomeLoadV110369.js';","import {cleanRoutePlace} from './currentHomeLoadV110369.js';\nimport {currentOperationalLoad} from '../loads/currentLoadV110473.js';");
patch(home,'const currentLoad = currentHomeLoad(props.state,selectedGuide,{day:localDayKey(),minute:nowMin()});','const currentLoad = currentOperationalLoad(props.state,checklistStore,{day:localDayKey(),minute:nowMin(),selectedGuide});');
patch(home,'documentSummary:loadDocumentSummaryV105(checklistStore,currentLoad.loadNo)','documentSummary:currentLoad.identity===\'load\'?loadDocumentSummaryV105(checklistStore,currentLoad.loadNo):{}');
patch(home,'<span>ACTIVE LOAD COMMAND</span>','<span>{currentLoad?.identity===\'reference\'?\'SHIPMENT REFERENCE\':\'ACTIVE LOAD COMMAND\'}</span>');
patch(home,"{!(snapshot.bolPresent || activeLoad?.documentSummary?.bolPresent) ? <button", "{currentLoad?.identity==='reference'?<button type=\"button\" className=\"adaptive-alert-v1038\" onClick={()=>onSection('documents')}><strong>!</strong><span><b>Check the load link</b><em>This is a shipment reference. Choose its broker load in Documents.</em></span><i>›</i></button>:null}\n      {currentLoad?.identity==='load' && !(snapshot.bolPresent || activeLoad?.documentSummary?.bolPresent) ? <button");
patch(business,"import React, { useEffect, useMemo, useState } from 'react';","import React, { useEffect, useMemo, useState } from 'react';\nimport {operationalCandidateContext,businessLoadRows} from '../loads/currentLoadV110473.js';");
patch(business,'const currentLoad = state?.loadInfo || {};','const loadContext=useMemo(()=>operationalCandidateContext(state,store),[state,store]);\n  const currentLoad=loadContext.current||{};\n  const displayedLoads=useMemo(()=>businessLoadRows(store,loadContext),[store,loadContext]);');
patch(business,"loadNo:String(currentLoad.shippingDocs || currentLoad.loadNo || currentLoad.bol || '').trim(),","loadNo:String(currentLoad.canonicalLoadNo || currentLoad.loadNo || '').trim(),");
patch(business,"origin:[currentLoad.pickupCity, currentLoad.pickupState].filter(Boolean).join(', '),","origin:currentLoad.origin || [currentLoad.pickupCity, currentLoad.pickupState].filter(Boolean).join(', '),");
patch(business,"destination:[currentLoad.deliveryCity, currentLoad.deliveryState].filter(Boolean).join(', '),","destination:currentLoad.destination || [currentLoad.deliveryCity, currentLoad.deliveryState].filter(Boolean).join(', '),");
patch(business,"{!showForm && (currentLoadDefaults.loadNo || currentLoadDefaults.origin || currentLoadDefaults.destination) ? (", "{!showForm && currentLoad.identity==='reference'?<aside className=\"business-shipment-reference\"><b>Shipment reference {currentLoad.shipmentReference}</b><p>Choose its broker load in Documents before using it as a load number.</p></aside>:null}\n            {!showForm && currentLoad.identity==='load' && (currentLoadDefaults.loadNo || currentLoadDefaults.origin || currentLoadDefaults.destination) ? (");
patch(business,'{store.loads.map(load => {','{displayedLoads.map(load => {');
patch(business,"<p>{[load.origin, load.destination].filter(Boolean).join(' → ') || load.broker || 'Route not entered'}</p>","<p>{[load.origin, load.destination].filter(Boolean).join(' → ') || load.broker || 'Route not entered'}</p>\n                      {load.broker?<small>{load.broker}</small>:null}");
patch(business,'<span>{recordDateLabel(load.date)}</span>','<span>{recordDateLabel(load.deliveryDate || load.pickupDate || load.date)}</span>');
patch(scan,"import {loadPickerCandidates,podReadingMessage} from './loadPickerV110472.js';","import {loadPickerCandidates,podReadingMessage} from './loadPickerV110472.js';\nimport {operationalCandidateContext} from '../loads/currentLoadV110473.js';");
patch(scan,'loadPickerCandidates(collectLoadCandidatesV105(state, store),state,store)','loadPickerCandidates(collectLoadCandidatesV105(state, store),state,store,operationalCandidateContext(state,store))');
// All source anchors are checked before any runtime is changed.
fs.copyFileSync('scripts/reader-foundation/currentLoad.js','source/src/modules/loads/currentLoadV110473.js');
for(const [path,text] of changes)fs.writeFileSync(path,text);
const css='source/src/road-ready-2026.css',marker='/* BUSINESS_READABILITY_V110473 */';
if(!read(css).includes(marker))fs.appendFileSync(css,'\n'+marker+'\n'+read('scripts/reader-foundation/business-readability.css'));
console.log('PASS — common operational load, reviewed aliases, recorded delivery closeout and readable business figures installed');
