'use client';
import React,{useState} from 'react';
import {measurementReviewProposal} from '../../../../packages/smart-reader-core/src/measurementReview.js';
import {normalizeBolMeasurement} from '../../../../packages/smart-reader-core/src/bolMeasurements.js';

export default function MeasurementReview({group,sources,disabled,onSource,onConfirm}){
  const [unit,setUnit]=useState(''),[error,setError]=useState('');
  const proposal=measurementReviewProposal(group);
  if(!proposal||proposal.entries.some(entry=>!sources[entry.evidence.sourceImageId]))return null;
  function confirm(){try{onConfirm(unit,proposal.signature);setError('');}catch(failure){setError(failure.message);}}
  return <section className="reader-weight-review" aria-label="Review shipment weights">
    <h4>Review shipment weights</h4>
    <p>Net + tare matches total. Check the values and choose their unit once.</p>
    <table><tbody>{proposal.entries.map(entry=><tr key={entry.key}>
      <th scope="row">{entry.label}</th><td>{entry.numericValue}</td>
      <td><button type="button" disabled={disabled} aria-label={'View '+entry.label+' source'} onClick={()=>onSource(entry.key)}>View</button></td>
    </tr>)}</tbody></table>
    <label>Unit for all three weights<select aria-label="Unit for all three weights" value={unit} disabled={disabled} onChange={e=>{setUnit(e.target.value);setError('');}}>
      <option value="">Choose unit</option><option value="LB">lb — pounds</option><option value="KG">kg — kilograms</option>
    </select></label>
    {error?<p role="alert">{error}</p>:null}
    <button type="button" className="reader-weight-confirm" disabled={disabled||!unit} onClick={confirm}>Confirm all three weights</button>
  </section>;
}

export function WeightUnitChoices({value,onChange,disabled}){
  const reading=normalizeBolMeasurement('shipping_weight',value);
  if(reading.numericValue==null)return <p>Enter the weight shown on the source, then choose its unit.</p>;
  return <fieldset className="reader-weight-units"><legend>Weight unit</legend>
    {['LB','KG'].map(unit=><button type="button" key={unit} aria-pressed={reading.unit===unit} disabled={disabled} onClick={()=>onChange(reading.numericValue+' '+unit)}>{unit==='LB'?'lb (pounds)':'kg (kilograms)'}</button>)}
  </fieldset>;
}
