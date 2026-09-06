'use client';
import React,{useState} from 'react';
import {APP_STATE_KEY,saveAppSnapshot} from '../../../../lib/local-db/appState.js';
import './cloud.css';
export default function CloudLaunchBar({state}){const[busy,setBusy]=useState(false),[error,setError]=useState('');return <div className="rr-launch"><button disabled={busy} onClick={async()=>{setBusy(true);try{if(state)await saveAppSnapshot(APP_STATE_KEY,state);window.location.assign('/cloud');}catch{setError('Local save needs attention. Your open records are still on this screen.');setBusy(false);}}}><b>Private cloud wallet</b><span>Backup · 8-day officer view · Older logs →</span></button>{error?<p role="alert">{error}</p>:null}</div>;}
