import fs from 'node:fs';
import assert from 'node:assert/strict';
const root='source/src/modules/owneros/';
const read=p=>fs.readFileSync(p,'utf8');
function patch(path,before,after){const source=read(path);if(source.includes(after))return;assert.equal(source.split(before).length,2,'Compact presentation anchor: '+path+' / '+before.slice(0,100));fs.writeFileSync(path,source.replace(before,()=>after));}
for(const [from,to] of [['gross.js','compactGross.js'],['GrossBoard.jsx','GrossBoard.jsx'],['BusinessNav.jsx','BusinessNav.jsx'],['compact.css','compactBusiness.css'],['polish.css','compactPolish.css']])fs.copyFileSync('scripts/compact-business/'+from,root+to);
const owner=root+'OwnerOperatorOSV102.jsx';
patch(owner,"import React,", "import GrossBoard from './GrossBoard.jsx';\nimport BusinessNav from './BusinessNav.jsx';\nimport './compactBusiness.css';\nimport React,");
patch(owner,'<section className="screen owner-os-screen-v102">', '<section className={"screen owner-os-screen-v102"+(tab===\'audit\'?\'\':\' rr-business-shell\')}>');
patch(owner,'initialTab={\'loads\'} unlinkedShipment=',"onDashboard={()=>setTab('overview')} onBilling={()=>setTab('billing')} initialTab={'loads'} unlinkedShipment=");
const source=read(owner), hero=source.indexOf('          <section className="owner-os-hero-v102">'), heroEnd=source.indexOf('          <SectionHead eyebrow="Action center"',hero);
if(!source.includes('<GrossBoard store={businessStore} state={state}/>')){assert.ok(hero>0&&heroEnd>hero,'Overview presentation bounds');fs.writeFileSync(owner,source.slice(0,hero)+'          <GrossBoard store={businessStore} state={state}/>\n'+source.slice(heroEnd));}
patch(owner,'<form className="billing-profile-v102" onSubmit={saveProfile}>','<details className="rr-billing-setup" open={!ownerStore.billingProfile?.carrierName || undefined}><summary>Carrier, billing &amp; factoring setup</summary><form className="billing-profile-v102" onSubmit={saveProfile}>');
patch(owner,'Save billing setup</button></form>','Save billing setup</button></form></details>');
patch(owner,'      </main>\n      <input ref={mileageRef}',"      </main>\n      {tab!=='audit'?<BusinessNav active={tab} onDashboard={()=>setTab('overview')} onLoads={()=>setTab('documents')} onScan={()=>onScan?.({kind:'auto'})} onBilling={()=>setTab('billing')}/>:null}\n      <input ref={mileageRef}");
const workspace=root+'EvidenceWorkspaceV110453.jsx';
patch(workspace,"import React,","import BusinessNav from './BusinessNav.jsx';\nimport './compactBusiness.css';\nimport React,");
patch(workspace,'unlinkedShipment,onBack,loadsView,onScan,onOpenLog})','unlinkedShipment,onBack,loadsView,onScan,onOpenLog,onDashboard,onBilling})');
patch(workspace,'className="rr-files" aria-label="Records workspace"','className="rr-files rr-business-shell" aria-label="Records workspace"');
const ws=read(workspace);if(!ws.includes('<BusinessNav')){const pos=ws.lastIndexOf('</section>');assert.ok(pos>0);fs.writeFileSync(workspace,ws.slice(0,pos)+"{onDashboard?<BusinessNav active=\"loads\" onDashboard={onDashboard} onLoads={()=>chooseTab('loads')} onScan={()=>onScan?.({kind:'auto'})} onBilling={onBilling}/>:null}"+ws.slice(pos));}
const folders=root+'SmartLoadFolders.jsx';
patch(folders,"import React,","import {grossValue,grossMoney} from './compactGross.js';\nimport './compactBusiness.css';\nimport React,");
patch(folders,'className="rr-smart-card" key={f.id}', 'className="rr-smart-card" aria-current={folder?.id===f.id?\'true\':undefined} key={f.id}');
patch(folders,"{f.reference}</strong><b>›</b>","{f.reference}</strong><span className=\"rr-row-price\">{grossMoney(grossValue(f.source))}</span><b>›</b>");
patch(folders,'   {share?<div className="rr-smart-section"', "   {props.onContinueBilling&&!folder.shipment?<button type=\"button\" className=\"rr-inbox-billing\" onClick={()=>props.onContinueBilling(folder.reference)}>Open billing ›</button>:null}\n   {share?<div className=\"rr-smart-section\"");
let folderCode=read(folders);
if(!folderCode.includes('const inboxList =')){
 const start=folderCode.indexOf(' return <section className="rr-smart" aria-label="Smart load folders">'), detailStart=folderCode.indexOf('  {folder?<>',start), listStart=folderCode.indexOf('  </>:<>',detailStart), listEnd=folderCode.indexOf('  </>}\n  <details',listStart);
 assert.ok(start>0&&detailStart>start&&listStart>detailStart&&listEnd>listStart,'Master/detail display bounds');
 const detail=folderCode.slice(detailStart+'  {folder?<>'.length,listStart), list=folderCode.slice(listStart+'  </>:<>'.length,listEnd);
 const end=folderCode.slice(listEnd+'  </>}'.length);
 folderCode=folderCode.slice(0,start)+` const inboxList = <>${list}</>;\n const inboxDetail = folder ? <>${detail}</> : null;\n return <section className={'rr-smart rr-inbox'+(folder?' is-open':'')} aria-label="Smart load folders">\n  <div className="rr-inbox-grid"><aside className="rr-inbox-list">{inboxList}</aside>{folder?<article className="rr-inbox-detail">{inboxDetail}</article>:null}</div>`+end;
 fs.writeFileSync(folders,folderCode);
}
const home='source/src/modules/home/HomeScreen.jsx';
patch(home,"import {recordLogDay,shipmentLogDay}","import GrossBoard from '../owneros/GrossBoard.jsx';\nimport BusinessNav from '../owneros/BusinessNav.jsx';\nimport '../owneros/compactBusiness.css';\nimport {recordLogDay,shipmentLogDay}");
patch(home,'phone-home-v435"','phone-home-v435 rr-business-shell rr-home-dark"');
patch(home,'      <AdaptiveHomeV1038',"      <GrossBoard store={businessStore} state={state} onOpen={()=>setBusinessSection('overview')}/>\n      <AdaptiveHomeV1038");
patch(home,'      <footer className="phone-home-footer">',"      <BusinessNav onDashboard={()=>setBusinessSection('overview')} onLoads={()=>setBusinessSection('load_documents')} onScan={()=>{setScanPreferredType('auto');setScanOpen(true);}} onBilling={()=>setBusinessSection('billing')}/>\n      <footer className=\"phone-home-footer\">");
console.log('PASS — isolated compact dark presentation; existing handlers, documents, driver records and DOT renderer retained');
