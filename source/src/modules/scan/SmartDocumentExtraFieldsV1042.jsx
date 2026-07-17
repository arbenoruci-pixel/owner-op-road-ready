import React from 'react';
import SmartDocumentExtraFieldsV1041 from './SmartDocumentExtraFieldsV1041.jsx';

function Field({ label, wide = false, children }) {
  return <label className={wide ? 'smart-scan-field wide' : 'smart-scan-field'}><span>{label}</span>{children}</label>;
}
function Text({ label, name, fields, onChange, wide = false, placeholder = '' }) {
  return <Field label={label} wide={wide}><input value={fields?.[name] || ''} onChange={event => onChange(name, event.target.value)} placeholder={placeholder}/></Field>;
}
function NumberField({ label, name, fields, onChange, placeholder = 'Optional' }) {
  return <Field label={label}><input inputMode="decimal" value={fields?.[name] || ''} onChange={event => onChange(name, event.target.value)} placeholder={placeholder}/></Field>;
}
function Money({ label, name, fields, onChange }) {
  return <Field label={label}><input inputMode="decimal" value={fields?.[name] || ''} onChange={event => onChange(name, event.target.value)} placeholder="$0.00"/></Field>;
}
function DateField({ label, name, fields, onChange }) {
  return <Field label={label}><input type="date" value={fields?.[name] || ''} onChange={event => onChange(name, event.target.value)}/></Field>;
}

export default function SmartDocumentExtraFieldsV1042({ typeId = 'other', fields = {}, onChange }) {
  if (typeId !== 'lumper_receipt') {
    return <SmartDocumentExtraFieldsV1041 typeId={typeId} fields={fields} onChange={onChange}/>;
  }
  return <>
    <Text label="Receipt #" name="receiptNo" fields={fields} onChange={onChange} wide placeholder="Capstone / Relay / Comchek receipt"/>
    <DateField label="Work date" name="workDate" fields={fields} onChange={onChange}/>
    <Text label="Bill code" name="billCode" fields={fields} onChange={onChange} placeholder="Optional"/>
    <Text label="Facility / location" name="location" fields={fields} onChange={onChange} wide placeholder="Warehouse or receiver"/>
    <Text label="BOL #" name="bolNo" fields={fields} onChange={onChange} placeholder="Optional"/>
    <Text label="Purchase order" name="purchaseOrder" fields={fields} onChange={onChange} placeholder="PO #"/>
    <Text label="Carrier" name="carrierName" fields={fields} onChange={onChange} wide placeholder="Carrier on receipt"/>
    <Text label="Dock" name="dock" fields={fields} onChange={onChange} placeholder="Optional"/>
    <Text label="Door" name="door" fields={fields} onChange={onChange} placeholder="Optional"/>
    <Text label="Tractor / unit" name="unitNumber" fields={fields} onChange={onChange} placeholder="Optional"/>
    <Text label="Trailer" name="trailerNo" fields={fields} onChange={onChange} placeholder="Optional"/>
    <NumberField label="Initial pallets" name="initialPallets" fields={fields} onChange={onChange}/>
    <NumberField label="Finished pallets" name="finishedPallets" fields={fields} onChange={onChange}/>
    <NumberField label="Case count" name="caseCount" fields={fields} onChange={onChange}/>
    <Money label="Base charge" name="baseCharge" fields={fields} onChange={onChange}/>
    <Money label="Additional charges" name="additionalCharges" fields={fields} onChange={onChange}/>
    <Money label="Convenience fee" name="convenienceFee" fields={fields} onChange={onChange}/>
  </>;
}
