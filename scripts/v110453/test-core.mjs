import assert from 'node:assert/strict';
import {catalog,filterRows,validateFiling,csvCell} from './core.js';
const source={local_id:'one',type:'maintenance',document_date:'2026-10-01',load_no:'100',original_file_name:'Repair.pdf'};
const before=structuredClone(source),state={activeDriverId:'a',teamDrivers:[{id:'a',name:'Arben'},{id:'b',name:'Feriz'}],eventsByDay:{'2026-10-01':[{id:'a',status:'OFF'}]},teamLogbooksByDriverId:{b:{eventsByDay:{'2026-10-01':[{id:'b',status:'ON'}]}}},dotWallet:{documents:{insurance_card:{attachmentName:'Insurance.pdf'}}}};
const rows=catalog([source],state);assert.equal(rows.length,4);assert.equal(rows.find(r=>r.kind==='document').category,'repair');assert.equal(rows.filter(r=>r.kind==='log').length,2);assert.deepEqual(source,before);
assert.equal(filterRows(rows,{scenario:'tax'}).length,1);assert.equal(filterRows(rows,{loadNo:'100'}).length,1);assert.equal(filterRows(rows,{loadNo:'00'}).length,0);
assert.equal(filterRows(rows,{from:'2026-10-02',includeUndated:false}).length,0);assert.equal(filterRows(rows,{from:'2026-10-02',includeUndated:true}).length,1);
assert.throws(()=>validateFiling({category:'repair',date:'2026-02-30'}),/valid/);assert.throws(()=>validateFiling({category:'repair',amount:'-2'}),/amount/);assert.equal(validateFiling({category:'repair',amount:'120.50'}).amount,'120.50');
assert.equal(csvCell('=SUM(A1)'),`"'=SUM(A1)"`);console.log('PASS — filing scopes, two-driver preservation, source immutability, amount/date validation and CSV escaping');
