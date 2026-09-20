'use client';
import React,{useState} from 'react';
import {measurementReviewProposal} from '../../../../packages/smart-reader-core/src/measurementReview.js';
export {WeightUnitChoices} from './MeasurementReviewV110386.jsx';

export default function MeasurementReview({group,sources,disabled,onSource,onConfirm}){
  const [error,setError]=useState('');
  const proposal=measurementReviewProposal(group);
  if(!proposal||proposal.entries.some(entry=>!sources[entry.evidence.sourceImageId]))return null;
  function confirm(unit){try{onConfirm(unit,proposal.signature);setError('');}catch(failure){setError(failure.message);}}
  return <section className="reader-weight-review" aria-label="Review shipment weights">
    <h4>Choose the weight unit</h4>
    <p>All three numbers match: net + tare = total. Confirm their unit together.</p>
    <table><tbody>{proposal.entries.map(entry=><tr key={entry.key}>
      <th scope="row">{entry.label}</th><td>{entry.numericValue}</td>
      <td><button type="button" disabled={disabled} aria-label={'View '+entry.label+' source'} onClick={()=>onSource(entry.key)}>View</button></td>
    </tr>)}</tbody></table>
    <p>The weight unit is missing from the reading. Choose the unit for this shipment.</p>
    <div className="reader-weight-confirm-options" role="group" aria-label="Confirm all three weights">
      <button type="button" className="reader-weight-confirm" disabled={disabled} onClick={()=>confirm('LB')}>Confirm weights in LB<span>Pounds</span></button>
      <button type="button" className="reader-weight-confirm" disabled={disabled} onClick={()=>confirm('KG')}>Confirm weights in KG<span>Kilograms</span></button>
    </div>
    {error?<p role="alert">{error}</p>:null}
  </section>;
}
