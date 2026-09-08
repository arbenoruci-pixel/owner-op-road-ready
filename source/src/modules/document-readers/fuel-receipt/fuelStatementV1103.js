// A statement is a set of transactions. Subtotal/footer rows are never purchases.
export function parseCsvRows(source = '') {
  const rows=[]; let row=[],cell='',quoted=false;
  const text=String(source).replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') { if(quoted && text[i+1]==='"') {cell+='"';i++;} else quoted=!quoted; }
    else if(c===',' && !quoted) {row.push(cell);cell='';}
    else if((c==='\n'||c==='\r') && !quoted) {if(c==='\r' && text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(quoted) throw new Error('Fuel CSV has an unfinished quoted field');
  row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
  return rows;
}
const amount=value=>{const n=Number(String(value??'').replace(/[$,\s]/g,''));return String(value??'').trim()!==''&&Number.isFinite(n)?n:null;};
const STATES=Object.fromEntries('Alabama:AL|Alaska:AK|Arizona:AZ|Arkansas:AR|California:CA|Colorado:CO|Connecticut:CT|Delaware:DE|District of Columbia:DC|Florida:FL|Georgia:GA|Hawaii:HI|Idaho:ID|Illinois:IL|Indiana:IN|Iowa:IA|Kansas:KS|Kentucky:KY|Louisiana:LA|Maine:ME|Maryland:MD|Massachusetts:MA|Michigan:MI|Minnesota:MN|Mississippi:MS|Missouri:MO|Montana:MT|Nebraska:NE|Nevada:NV|New Hampshire:NH|New Jersey:NJ|New Mexico:NM|New York:NY|North Carolina:NC|North Dakota:ND|Ohio:OH|Oklahoma:OK|Oregon:OR|Pennsylvania:PA|Rhode Island:RI|South Carolina:SC|South Dakota:SD|Tennessee:TN|Texas:TX|Utah:UT|Vermont:VT|Virginia:VA|Washington:WA|West Virginia:WV|Wisconsin:WI|Wyoming:WY'.split('|').map(row=>{const [name,code]=row.split(':');return [name.toLowerCase(),code];}));
export function parseFuelStatement(source = '') {
  const firstLine=String(source).trimStart().split(/\r?\n/,1)[0].toLowerCase();
  if(!['transaction id','date of visit','gallons dispensed','paid','truck stop'].every(key=>firstLine.includes(key)))return null;
  const rows=parseCsvRows(source), header=rows[0]?.map(v=>v.trim().toLowerCase()) || [];
  const required=['transaction id','date of visit','gallons dispensed','paid','truck stop'];
  if(!required.every(key=>header.includes(key))) return null;
  const at=(row,key)=>String(row[header.indexOf(key)]??'').trim();
  const transactions=[],issues=[],byId=new Map();let footerTotal=null,footerGallons=null;
  for(let i=1;i<rows.length;i++) {
    const row=rows[i],id=at(row,'transaction id');
    if(!id) {
      if(at(row,'zip').toLowerCase()==='total gallons' && !at(row,'state')) {footerGallons=amount(at(row,'gallons dispensed'));footerTotal=amount(at(row,'paid'));}
      continue;
    }
    const dateTime=at(row,'date of visit'),date=dateTime.slice(0,10),gallons=amount(at(row,'gallons dispensed')),total=amount(at(row,'paid'));
    const parsedDate=new Date(date+'T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}(?:\s|T)\d{2}:\d{2}/.test(dateTime)||!Number.isFinite(parsedDate.getTime())||parsedDate.toISOString().slice(0,10)!==date||gallons===null||gallons<=0||total===null||total<0) {issues.push({row:i+1,transactionId:id,code:'INVALID_TRANSACTION'});continue;}
    const stateName=at(row,'state'),state=STATES[stateName.toLowerCase()] || (/^[A-Z]{2}$/i.test(stateName)?stateName.toUpperCase():'');
    const transaction={transactionId:id,date,transactionDate:dateTime,transactionTime:dateTime.slice(11,16),merchant:at(row,'truck stop'),street:at(row,'street'),city:at(row,'city'),state,stateName,cityState:[at(row,'city'),state].filter(Boolean).join(', '),zip:at(row,'zip'),gallons,total,pricePerGallon:amount(at(row,'cost')),fuelType:at(row,'fuel type'),unitNumber:at(row,'truck #'),sourceRow:i+1};
    const previous=byId.get(id);
    if(previous) {if(JSON.stringify({...previous,sourceRow:0})!==JSON.stringify({...transaction,sourceRow:0}))issues.push({row:i+1,transactionId:id,code:'CONFLICTING_TRANSACTION_ID'});continue;}
    byId.set(id,transaction);transactions.push(transaction);
  }
  const total=Math.round(transactions.reduce((s,t)=>s+Math.round(t.total*100),0))/100;
  const gallons=transactions.reduce((s,t)=>s+Math.round(t.gallons*1000),0)/1000;
  if(footerTotal!==null && Math.abs(total-footerTotal)>0.01)issues.push({code:'STATEMENT_TOTAL_MISMATCH',expected:footerTotal,actual:total});
  if(footerGallons!==null && Math.abs(gallons-footerGallons)>0.011)issues.push({code:'STATEMENT_GALLONS_MISMATCH',expected:footerGallons,actual:gallons});
  if(!transactions.length)issues.push({code:'NO_TRANSACTIONS'});
  return {kind:'fuel_statement',transactions,transactionCount:transactions.length,total,gallons,issues,valid:issues.length===0,
    periodStart:transactions.map(t=>t.date).sort()[0] || '',periodEnd:transactions.map(t=>t.date).sort().at(-1) || ''};
}
export function fuelStatementFields(statement) {
  return {type:'fuel_receipt',title:'Fuel statement',documentScope:'statement',transactions:statement.transactions,transactionCount:statement.transactionCount,
    total:statement.total,gallons:statement.gallons,periodStart:statement.periodStart,periodEnd:statement.periodEnd,
    date:statement.periodEnd,documentDate:statement.periodEnd,merchant:'Fuel statement',loadNo:'',transactionId:'',statementVerified:statement.valid};
}
export function upsertFuelTransactions(store, document, fields) {
  const transactions=fields.transactions;
  if(!Array.isArray(transactions)||!transactions.length||fields.statementVerified!==true)throw new Error('Review and verify the fuel statement transactions before saving');
  const existing=[...(store.fuel||[])],byId=new Map(existing.filter(t=>t.transactionId).map(t=>[String(t.transactionId),t]));
  for(const row of transactions) {
    const prior=byId.get(row.transactionId);
    if(prior && (Number(prior.total)!==Number(row.total)||Number(prior.gallons)!==Number(row.gallons)||prior.date!==row.date))throw new Error('Conflicting fuel transaction '+row.transactionId);
  }
  const added=[];
  for(const row of transactions) {
    if(byId.has(row.transactionId))continue;
    const item={...row,id:'fuel_transaction_'+row.transactionId,documentId:document.id,sourceDocumentId:document.id,loadNo:'',receiptAttached:true,source:'verified_fuel_statement',createdAt:Date.now(),updatedAt:Date.now()};
    byId.set(row.transactionId,item);added.push(item);
  }
  return {...store,fuel:[...added,...existing],updatedAt:Date.now()};
}
