'use client';
import React,{useEffect,useMemo,useState} from 'react';
import {getHomeTerminalTimeZone,homeTerminalDayKey} from '../../core/time/homeTerminalTime.js';
import {operationalCandidateContext,businessLoadRows} from '../loads/currentLoadV110473.js';
import {grossSummary,grossMoney} from './compactGross.js';
import './compactPolish.css';
export default function GrossBoard({store={},state={},onOpen}) {
  const [clock,setClock]=useState(()=>Date.now());
  useEffect(()=>{const refresh=()=>setClock(Date.now());const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};},[]);
  const loads=useMemo(()=>businessLoadRows(store,operationalCandidateContext(state,store)),[store,state]);
  const timezone=getHomeTerminalTimeZone(state), today=homeTerminalDayKey(new Date(clock),timezone);
  const totals=grossSummary(loads,today,timezone);
  const warnings=[totals.missingAmount?`${totals.missingAmount} missing rates excluded`:null,totals.conflicts?`${totals.conflicts} conflicting loads excluded`:null,totals.undated?`${totals.undated} undated loads in all-time only`:null,totals.future?`${totals.future} future-dated loads excluded`:null].filter(Boolean);
  return <section className="rr-gross-board" aria-label="Gross revenue dashboard">
    <header><span>GROSS REVENUE</span>{onOpen?<button type="button" onClick={onOpen}>Dashboard <span aria-hidden="true">›</span></button>:<small>USD · before expenses</small>}</header>
    <div className="rr-gross-grid">{[['week','This week','Mon – today'],['month','This month',today.slice(0,7)],['total','All time','Saved history']].map(([key,label,detail])=><article className={'rr-gross-card '+(key==='week'?'featured':'')} key={key} aria-label={label+' gross'}><span>{label}</span><strong>{grossMoney(totals[key].cents/100)}</strong><small>{totals[key].count} {totals[key].count===1?'load':'loads'} · {detail}</small></article>)}</div>
    <details className="rr-gross-basis"><summary>{warnings.length?'Review totals · '+warnings.length+' coverage notes':'Completed loads · before expenses'}</summary><p>One saved gross amount per completed load, using its delivery date. TONU uses its service or pickup date. Week starts Monday. Calendar: {timezone}. These amounts do not confirm payment.</p>{warnings.length?<p>{warnings.join(' · ')}.</p>:null}</details>
  </section>;
}
