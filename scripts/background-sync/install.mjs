import fs from 'node:fs';
import assert from 'node:assert/strict';
const lib='lib/owner-op-cloud/',read=p=>fs.readFileSync(p,'utf8');
function patch(path,before,after){const s=read(path);if(s.includes(after))return;assert.equal(s.split(before).length,2,'Background sync anchor: '+path+' '+before.slice(0,70));fs.writeFileSync(path,s.replace(before,()=>after));}
fs.copyFileSync('scripts/background-sync/pacing.js',lib+'syncPacing.js');
fs.copyFileSync('scripts/reliability-sync/scheduler.js',lib+'syncSchedulerReliability.js');
fs.copyFileSync('scripts/reliability-sync/recordIndexer.js',lib+'recordIndexerReliability.js');
const core=lib+'recordsCoreV110451.js';
patch(core,'projectRecords({state={},business={},tables={},localRows=[]})','projectRecords({state={},business={},tables={},localRows=[],includeState=true,tableOffsets={}})');
patch(core,' const active=String(state.activeDriverId',' if(includeState){\n const active=String(state.activeDriverId');
patch(core,' for(const [table,rows] of Object.entries(tables))',' }\n for(const [table,rows] of Object.entries(tables))');
patch(core,'idOf(row)??i)', 'idOf(row)??((tableOffsets[table]||0)+i))');
const index=lib+'recordSyncV110451.js';
let source=read(index);const ownStart=source.indexOf('function assertBackgroundIndexVisible(){'),start=ownStart>=0?ownStart:source.indexOf('async function capture(){'),end=source.indexOf('export async function listCorrections');
assert.ok(start>0&&end>start,'Record sync entry boundaries');
source=source.slice(0,start)+read('scripts/background-sync/recordSyncBody.txt')+source.slice(end);
if(!source.includes("from './syncPacing.js'"))source=source.replace("'use client';", "'use client';\nimport {createSyncPacer,streamRecordInventory} from './syncPacing.js';\nimport {accountStatus} from './accountSyncV110455.js';");
fs.writeFileSync(index,source);
const files=lib+'accountFilesV110455.js';
patch(files,'known,onProgress=()=>{},check=()=>{}}','known,onProgress=()=>{},check=()=>{},pace=async()=>{},yieldUI=async()=>{}}');
patch(files,'at+=PART_BYTES){await check();chunks.push','at+=PART_BYTES){await pace();await check();chunks.push');
patch(files,'async function visit(v){','async function visit(v){\n  await yieldUI();');
patch(files,'p+=131072){const raw=','p+=131072){await yieldUI();const raw=');
patch(files,'check=()=>{},localPiece})','check=()=>{},localPiece,pace=async()=>{}})');
// Reused local pieces are verified without a network delay. Remote chunks
// wait and recheck priority immediately before each download.
patch(files,'   const r=await bounded(storage.download','   await pace();await check();const r=await bounded(storage.download');
patch(files,'export async function decode(value,opts,cache=new Map()){','export async function decode(value,opts,cache=new Map()){\n await opts.yieldUI?.();');
patch(files,'offset+=786432){const bytes=', 'offset+=786432){await opts.yieldUI?.();const bytes=');
const account=lib+'accountSyncV110455.js';
patch(account,"import Dexie from 'dexie';","import Dexie from 'dexie';\nimport {createSyncPacer} from './syncPacing.js';");
patch(account,'async function add(key,value){const parts=', 'async function add(key,value){await opts.yieldUI?.();const parts=');
patch(account,'const row=await db.table(name).get(id);if(!row)', 'await opts.yieldUI?.();const row=await db.table(name).get(id);if(!row)');
patch(account," show({message:'Saving account data for offline use…'});", " show({message:'Saving account data for offline use…'});\n const pacer=createSyncPacer({check});");
patch(account,'uid,check,localPiece:source.read}',"uid,check,localPiece:source.read,pace:scope==='all'?()=>pacer.file():undefined,yieldUI:()=>pacer.yield()}");
patch(account,' for(const [k,v] of Object.entries(records)){\n  const parts=', ' for(const [k,v] of Object.entries(records)){\n  await pacer.yield();const parts=');
patch(account,"   const opts={storage:cloudClient().storage.from('owner-op-private'),uid,known:","   const pacer=createSyncPacer({check});\n   const opts={pace:scope==='all'?()=>pacer.file():undefined,yieldUI:()=>pacer.yield(),storage:cloudClient().storage.from('owner-op-private'),uid,known:");
patch(account,"if(e.deferred)return {deferred:true,canOpenLocal};", "if(e.deferred){show({phase:'waiting',message:'Logbook takes priority. Documents will continue in the background.'});return {deferred:true,canOpenLocal};}");
console.log('PASS — logbook priority, paced originals and bounded streaming record index installed');
