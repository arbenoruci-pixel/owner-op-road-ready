import React from 'react';
import { truckDocumentTypeMetaV1040 } from './truckDocumentCatalogV1040.js';

function Field({ label, wide = false, children }) {
  return <label className={wide ? 'smart-scan-field wide' : 'smart-scan-field'}><span>{label}</span>{children}</label>;
}

function Text({ label, name, fields, onChange, wide = false, placeholder = '' }) {
  return <Field label={label} wide={wide}><input value={fields?.[name] || ''} onChange={event => onChange(name, event.target.value)} placeholder={placeholder}/></Field>;
}

function Money({ label, name, fields, onChange }) {
  return <Field label={label}><input inputMode="decimal" value={fields?.[name] || ''} onChange={event => onChange(name, event.target.value)} placeholder="$0.00"/></Field>;
}

function DateField({ label, name, fields, onChange }) {
  return <Field label={label}><input type="date" value={fields?.[name] || ''} onChange={event => onChange(name, event.target.value)}/></Field>;
}

function Toggle({ label, checked = false, onChange, hint = '' }) {
  return <Field label={label}><label className="smart-extra-toggle-v1040"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)}/><span>{hint || 'Visible / confirmed'}</span></label></Field>;
}

export default function SmartDocumentExtraFieldsV1041({ typeId = 'other', fields = {}, onChange }) {
  const meta = truckDocumentTypeMetaV1040(typeId);
  const family = meta.family;
  const bolPod = ['bol','pod','delivery_receipt'].includes(typeId);
  const financialLoad = ['lumper_receipt','detention_approval','tonu','layover_approval','washout_receipt','load_invoice'].includes(typeId);
  const otherLoadSupport = ['packing_list','load_tender','reefer_temperature'].includes(typeId);
  const fuelIfta = family === 'fuel_ifta' || ['ifta_license','trip_permit'].includes(typeId);
  const maintenance = family === 'maintenance';
  const driver = family === 'driver';
  const equipment = family === 'equipment';
  const broker = family === 'broker';
  const business = family === 'business' || family === 'billing';
  const claims = family === 'claims';

  return <>
    {bolPod && <>
      <Text label="Carrier" name="carrierName" fields={fields} onChange={onChange} wide placeholder="Carrier on document"/>
      <Text label="Shipper" name="shipper" fields={fields} onChange={onChange} wide placeholder="Ship from company"/>
      <Text label="Consignee" name="consignee" fields={fields} onChange={onChange} wide placeholder="Delivery company"/>
      <Text label="Sales order" name="salesOrder" fields={fields} onChange={onChange} placeholder="Optional"/>
      <Text label="Delivery #" name="deliveryNumber" fields={fields} onChange={onChange} placeholder="Optional"/>
      <Text label="Route / car #" name="routeCarNo" fields={fields} onChange={onChange} placeholder="Optional"/>
      <Text label="Drop #" name="dropNumber" fields={fields} onChange={onChange} placeholder="Optional"/>
      <Text label="FO #" name="foNumber" fields={fields} onChange={onChange} placeholder="Optional"/>
      <Text label="Seal numbers" name="sealNumbers" fields={fields} onChange={onChange} wide placeholder="Comma separated"/>
      <Text label="Total units" name="totalUnits" fields={fields} onChange={onChange} placeholder="Optional"/>
      <Text label="Total tare" name="totalTare" fields={fields} onChange={onChange} placeholder="Optional"/>
      <Text label="Net weight" name="netWeight" fields={fields} onChange={onChange} placeholder="lbs"/>
      <Text label="Gross weight" name="grossWeight" fields={fields} onChange={onChange} placeholder="lbs"/>
      <Text label="Temperature" name="temperature" fields={fields} onChange={onChange} placeholder="Optional"/>
      <DateField label="Signed / delivered" name="deliverySignedDate" fields={fields} onChange={onChange}/>
      {typeId === 'pod' && <>
        <Toggle label="Receiver signature" checked={fields.signaturePresent === true} onChange={value => onChange('signaturePresent', value)} hint={fields.signatureLikely ? 'Signature area detected — confirm it is signed' : 'Visible / confirmed'}/>
        <Text label="Delivery exception" name="exceptionText" fields={fields} onChange={onChange} wide placeholder="Leave blank for a clean POD"/>
      </>}
    </>}

    {financialLoad && <>
      <Text label="Receipt / approval #" name="approvalNo" fields={fields} onChange={onChange} placeholder="Optional"/>
      <Text label="BOL / PO #" name="bolNo" fields={fields} onChange={onChange} placeholder="Optional"/>
      <Text label="Location / stop" name="location" fields={fields} onChange={onChange} wide placeholder="Facility or city, state"/>
      <Money label="Amount" name="total" fields={fields} onChange={onChange}/>
      {['detention_approval','layover_approval'].includes(typeId) && <Text label="Hours / wait" name="hours" fields={fields} onChange={onChange} placeholder="Optional"/>}
    </>}

    {otherLoadSupport && <>
      <Text label="BOL / PO #" name="bolNo" fields={fields} onChange={onChange} placeholder="Optional"/>
      <Text label="Location / stop" name="location" fields={fields} onChange={onChange} wide placeholder="Facility or city, state"/>
      {typeId === 'reefer_temperature' && <Text label="Temperature" name="temperature" fields={fields} onChange={onChange} placeholder="Set point"/>}
    </>}

    {fuelIfta && <>
      <Text label="Jurisdiction" name="state" fields={fields} onChange={onChange} placeholder="State"/>
      <Text label="Truck / unit" name="unitNumber" fields={fields} onChange={onChange} placeholder="Unit #"/>
      <Text label="Fuel type" name="fuelType" fields={fields} onChange={onChange} placeholder="Diesel / DEF"/>
      <Text label="IFTA account" name="accountNumber" fields={fields} onChange={onChange} placeholder="Optional"/>
      <Text label="Quarter" name="quarter" fields={fields} onChange={onChange} placeholder="Q1–Q4"/>
      <DateField label="Expiration" name="expirationDate" fields={fields} onChange={onChange}/>
    </>}

    {maintenance && <>
      <Text label="Vendor" name="merchant" fields={fields} onChange={onChange} wide placeholder="Repair shop or vendor"/>
      <Text label="Invoice #" name="invoiceNo" fields={fields} onChange={onChange} placeholder="Invoice / RO"/>
      <Text label="Truck / unit" name="unitNumber" fields={fields} onChange={onChange} placeholder="Unit #"/>
      <Text label="VIN" name="vin" fields={fields} onChange={onChange} wide placeholder="17 characters"/>
      <Text label="Odometer" name="odometer" fields={fields} onChange={onChange} placeholder="Miles"/>
      <Money label="Labor" name="labor" fields={fields} onChange={onChange}/>
      <Money label="Parts" name="parts" fields={fields} onChange={onChange}/>
      <Money label="Invoice total" name="total" fields={fields} onChange={onChange}/>
      <Text label="Work performed" name="serviceDescription" fields={fields} onChange={onChange} wide placeholder="Service summary"/>
      <Text label="Next due miles" name="nextDueMiles" fields={fields} onChange={onChange} placeholder="Optional"/>
    </>}

    {driver && <>
      <Text label="Driver name" name="driverName" fields={fields} onChange={onChange} wide placeholder="Name on document"/>
      <Text label="License / document #" name="licenseNumber" fields={fields} onChange={onChange} wide placeholder="Document number"/>
      <DateField label="Issued" name="issuedDate" fields={fields} onChange={onChange}/>
      <DateField label="Expiration" name="expirationDate" fields={fields} onChange={onChange}/>
    </>}

    {equipment && <>
      <Text label="Truck / unit" name="unitNumber" fields={fields} onChange={onChange} placeholder="Unit #"/>
      <Text label="Trailer #" name="trailerNo" fields={fields} onChange={onChange} placeholder="Optional"/>
      <Text label="VIN" name="vin" fields={fields} onChange={onChange} wide placeholder="17 characters"/>
      <Text label="Plate" name="plate" fields={fields} onChange={onChange} placeholder="Plate #"/>
      <Text label="Policy / permit #" name={typeId === 'insurance' || typeId === 'certificate_of_insurance' ? 'policyNumber' : 'permitNumber'} fields={fields} onChange={onChange} wide placeholder="Document number"/>
      <DateField label="Issued" name="issuedDate" fields={fields} onChange={onChange}/>
      <DateField label="Expiration" name="expirationDate" fields={fields} onChange={onChange}/>
    </>}

    {broker && <>
      <Text label="Broker / company" name="broker" fields={fields} onChange={onChange} wide placeholder="Legal company name"/>
      <Text label="MC #" name="mcNumber" fields={fields} onChange={onChange} placeholder="MC number"/>
      <Text label="USDOT #" name="dotNumber" fields={fields} onChange={onChange} placeholder="Optional"/>
      <Text label="Factoring company" name="factorName" fields={fields} onChange={onChange} wide placeholder="Optional"/>
      <Text label="Phone" name="phone" fields={fields} onChange={onChange} placeholder="Contact"/>
      <Text label="Email" name="email" fields={fields} onChange={onChange} wide placeholder="Contact email"/>
      <Text label="Remit to" name="remitTo" fields={fields} onChange={onChange} wide placeholder="Payment instructions"/>
      <DateField label="Effective" name="effectiveDate" fields={fields} onChange={onChange}/>
    </>}

    {business && !['rate_confirmation','carrier_settlement'].includes(typeId) && <>
      <Text label="Business / bank" name="businessName" fields={fields} onChange={onChange} wide placeholder="Company name"/>
      <Text label="Invoice / account #" name="invoiceNo" fields={fields} onChange={onChange} wide placeholder="Optional"/>
      <Text label="Tax year / quarter" name="taxYear" fields={fields} onChange={onChange} placeholder="Optional"/>
      <Money label="Amount" name="total" fields={fields} onChange={onChange}/>
    </>}

    {claims && <>
      <Text label="Claim / case #" name="claimNo" fields={fields} onChange={onChange} placeholder="Optional"/>
      <Text label="Load #" name="loadNo" fields={fields} onChange={onChange} placeholder="Load number"/>
      <Text label="Incident location" name="location" fields={fields} onChange={onChange} wide placeholder="City, state or facility"/>
      <Text label="Damage / exception" name="exceptionText" fields={fields} onChange={onChange} wide placeholder="What actually happened"/>
    </>}
  </>;
}
