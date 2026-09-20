// Keep observed numbers and units separate. Arithmetic cannot invent either.
const number = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,3})?';
const token = new RegExp('^('+number+')(?:[ \\t]*(LB|LBS|KG|KGS))?(?=[ \\t|)]|$)', 'id');
function weightField(label, source) {
  return {label, kind:'shipping_weight', required:false, displayWhenFound:true,
    pattern:new RegExp('^[\\s|]*(?:'+source+')[ \\t]*:?[ \\t]+(.+?)\\s*$', 'id'),
    rightLabel:new RegExp('^\\s*(?:'+source+')\\s*:?\\s*$', 'i'), valuePattern:token};
}
export const bolMeasurementFields = {
  weight:weightField('Total weight', 'TOTAL WEIGHT|GROSS WEIGHT|WEIGHT'),
  netWeight:weightField('Net weight', 'TOTAL NET WEIGHT|NET WEIGHT'),
  tareWeight:{...weightField('Tare weight', 'TOTAL TARE|OTAL TARE|TARE WEIGHT|TARE'),noisyLabel:/^[\s|]*OTAL\s/i},
  totalUnits:{label:'Total units', kind:'count', required:false, displayWhenFound:true,
    pattern:/^[\s|]*(?:TOTAL|OTAL)\s+UNITS\s*:?\s+(\d[\d,]*)\s*$/id,
    rightLabel:/^\s*(?:TOTAL|OTAL)\s+UNITS\s*:?\s*$/i,noisyLabel:/^[\s|]*OTAL\s/i},
  temperature:{label:'Temperature setting instruction', kind:'temperature_instruction', required:false, displayWhenFound:true,
    pattern:/^[\s|]*(?:(?:FROZEN\s+LOADS|FOOTNOTES)\s*:\s*)?(?:USE\s*TEMP(?:ERATURE)?\s*SETTING\s*(?:OF\s*)?|(?:REEFER\s+)?(?:SET\s*POINT|TEMP(?:ERATURE)?\s*SETTING)\s*:?\s*)([+\-−<]?\s*\d{1,3}(?:\.\d+)?\s*°?\s*[FC])\s*$/id}
};
export function normalizeBolMeasurement(kind, raw) {
  const value=raw.trim();
  if(kind==='count') {
    if(!/^(?:\d{1,3}(?:,\d{3})+|\d+)$/.test(value))return {value:null,issue:'invalid_count'};
    const count=Number(value.replaceAll(',',''));
    return Number.isSafeInteger(count)?{value:String(count)}:{value:null,issue:'invalid_count'};
  }
  if(kind==='temperature_instruction') {
    const match=/^([+\-−<]?)\s*(\d{1,3}(?:\.\d+)?)\s*°?\s*([FC])$/i.exec(value);
    if(!match)return {value:null,issue:'invalid_temperature'};
    if(match[1]==='<')return {value:null,issue:'ambiguous_temperature_sign'};
    return {value:match[1].replace('−','-')+match[2]+' '+match[3].toUpperCase()};
  }
  const match=new RegExp('^('+number+')(?:\\s*(LB|LBS|KG|KGS))?$','i').exec(value);
  if(!match)return {value:null,issue:'invalid_weight'};
  const numericValue=match[1].replaceAll(',',''),unit=match[2]?.toUpperCase().replace(/S$/,'')||null;
  const thousandths=Math.round(Number(numericValue)*1000);
  if(!Number.isSafeInteger(thousandths))return {value:null,issue:'invalid_weight'};
  return {value:numericValue+(unit?' '+unit:''),numericValue,unit,thousandths,...(!unit?{issue:'weight_unit_required'}:{})};
}
export function validateBolWeights(fields) {
  const keys=['netWeight','tareWeight','weight'];
  const readings=keys.map(key=>{
    const field=fields[key];
    if(field?.correction)return normalizeBolMeasurement('shipping_weight',field.value||'');
    const values=[...new Map((field?.candidates||[]).filter(c=>c.numericValue!=null).map(c=>[JSON.stringify([c.numericValue,c.unit]),c])).values()];
    // Invalid fragments remain field issues even when other numbers agree.
    return values.length===1?values[0]:null;
  });
  const complete=readings.every(r=>Number.isSafeInteger(r?.thousandths));
  const units=new Set(readings.map(r=>r?.unit).filter(Boolean));
  const comparable=complete&&units.size<=1;
  const matches=comparable&&readings[0].thousandths+readings[1].thousandths===readings[2].thousandths;
  return [{id:'bol_weight_arithmetic',fields:keys,status:comparable?(matches?'passed':'needs_review'):'not_checked',
    ...(comparable?{unit:readings.every(r=>r.unit)?readings[0].unit:null,
      message:(matches?'Net weight plus tare matches total weight.':'Net weight plus tare differs from total weight.')+(readings.every(r=>r.unit)?'':' Confirm the weight unit from the source.')}:{} )}];
}
