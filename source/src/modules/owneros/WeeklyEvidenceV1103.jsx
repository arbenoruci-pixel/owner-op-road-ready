'use client';
import React,{useMemo} from 'react';
import { documentIdentity } from './archiveEvidenceV1103.js';
import { openVaultDocumentV102 } from './documentVaultV102.js';
import { openHistoricalLogbookPdfV10981 } from './historicalLogbookV10981.js';

export default function WeeklyEvidenceV1103({week,documents,state}) {
  const originals=useMemo(()=>new Map(documents.map(doc=>[documentIdentity(doc),doc])),[documents]);
  if(!week)return null;
  function receipt(row) {const doc=originals.get(row.documentId || row.sourceDocumentId);return doc?<button type="button" onClick={()=>openVaultDocumentV102(doc)}>Open original</button>:<span>Original needs linking</span>;}
  return <section className="load-folder-detail-v10969" aria-label="Weekly evidence">
    <h3>Weekly evidence</h3>
    <p>{week.miles.toFixed(2)} recorded mi · {week.unallocatedMiles.toFixed(2)} mi awaiting load allocation</p>
    <details><summary>Daily Logbooks · {week.days.length} recorded days</summary>{week.days.map(row=><article key={row.day}><b>{row.day}</b><p>{row.miles===null?'Mileage not recorded':`${row.miles.toFixed(2)} mi · ${row.status}`}</p><button type="button" onClick={()=>openHistoricalLogbookPdfV10981({state,folder:{loadNo:'Weekly records',days:[row.day]},day:row.day})}>Open current Logbook</button></article>)}</details>
    <details><summary>Fuel · {week.fuel.length} purchases · ${week.fuelTotal.toFixed(2)} · {week.fuelGallons} gal</summary>{week.fuel.map(row=><article key={row.id}><b>{row.date} · {row.merchant || 'Fuel'}</b><p>{row.cityState || row.city || ''} · {row.gallons ?? 'Unknown'} gal · ${Number(row.total || 0).toFixed(2)}</p>{receipt(row)}</article>)}</details>
    <details><summary>Expenses · {week.expenses.length} records · ${week.expenseTotal.toFixed(2)}</summary>{week.expenses.map(row=><article key={row.id}><b>{row.date} · {row.merchant || row.category || 'Expense'}</b><p>${Number(row.total ?? row.amount ?? 0).toFixed(2)}</p>{receipt(row)}</article>)}</details>
    <details><summary>Documents · {week.documents.length}</summary>{week.documents.map((doc,index)=><article key={documentIdentity(doc)||index}><b>{doc.title || doc.original_file_name || doc.fileName || 'Document'}</b><p>{doc.documentDate || doc.document_date || 'Original date needs confirmation'} · {doc.archiveLink.status.replaceAll('_',' ')}</p><button type="button" onClick={()=>openVaultDocumentV102(doc)}>Open original</button></article>)}</details>
  </section>;
}
