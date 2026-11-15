'use client';
import React from 'react';
import {businessLoadRows,operationalCandidateContext} from '../loads/currentLoadV110473.js';
import {activeFolderLoad,closedLoad} from '../owneros/manualLoadCore.js';
import {requestLoadFolder} from '../owneros/folderRequest.js';
export function openActiveFolder(store,state,onOpen,onCreate){
 const context=operationalCandidateContext(state,store),active=activeFolderLoad(businessLoadRows(store,context),context.current);
 if(active){requestLoadFolder(active.loadNo||active.canonicalLoadNo);onOpen();}else if((store.loads||[]).some(l=>!l.deleted&&!l.deletedAt&&!closedLoad(l)))onOpen();else onCreate();
}
export default function ActiveFolderCard({store={},state={},onOpen,onCreate}){
 const context=operationalCandidateContext(state,store),loads=businessLoadRows(store,context),active=activeFolderLoad(loads,context.current),open=loads.filter(l=>!l.deleted&&!l.deletedAt&&!closedLoad(l));
 return <section className="rr-active-folder" aria-label="Active load folder"><span>ACTIVE LOAD</span>{active?<><h2>#{active.loadNo||active.canonicalLoadNo}</h2><p>{active.origin||'Pickup not set'} → {active.destination||'Delivery not set'}</p><button type="button" onClick={()=>{requestLoadFolder(active.loadNo||active.canonicalLoadNo);onOpen();}}>Open active load · Documents</button></>:<><h2>{open.length?'Choose your active load':'No active load'}</h2><p>{open.length?'Open a folder and choose Set as active.':'Create a load folder, then add its paperwork.'}</p><button type="button" onClick={onCreate}>+ New load manually</button></>}<button type="button" onClick={onOpen}>All load folders</button></section>;
}
