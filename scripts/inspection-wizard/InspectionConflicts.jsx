import React from 'react';

function flatten(value, path = '', out = {}) {
  if (value?.__rrAccountFile || typeof value==='string' && value.startsWith('data:')) {
    out[path || 'Original file'] = typeof value==='string' ? value : JSON.stringify(value); return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item,i)=>flatten(item,`${path} ${i+1}`,out));
    if(!value.length)out[path]='Empty';return out;
  }
  if(value && typeof value==='object') {
    for(const [key,item] of Object.entries(value))flatten(item,[path,key.replace(/([a-z])([A-Z])/g,'$1 $2')].filter(Boolean).join(' · '),out);
    return out;
  }
  out[path || 'Record']=value===undefined?'Removed':value===null||value===''?'Not set':String(value);return out;
}
function title(conflict) {
  const [kind,field,day]=JSON.parse(conflict.key);
  if(kind==='day')return `Log · ${day}`;
  const labels={loadInfo:'Current load',driverProfile:'Driver details',dotNumber:'Carrier USDOT',formByDay:'Daily form'};
  return [kind==='guide'?'Load':labels[field]||field.replace(/([a-z])([A-Z])/g,'$1 $2'),conflict.local?.loadNo||conflict.remote?.loadNo].filter(Boolean).join(' · ');
}
function Value({value}) {
  if(value.startsWith('data:'))return <a href={value} download="record-original">View original</a>;
  return <span>{value}</span>;
}
export function InspectionConflicts({conflicts,choices,onChoose,onConfirm,busy}) {
  return <section className="inspection-conflicts" aria-label="Choose saved versions">
    <h2>Choose the correct saved details</h2>
    <p>{conflicts.length} item(s) differ. Compare each item and select the correct version. Both copies stay in recovery history.</p>
    {conflicts.map(conflict=>{
      const local=flatten(conflict.local),remote=flatten(conflict.remote);
      const changed=[...new Set([...Object.keys(local),...Object.keys(remote)])].filter(key=>local[key]!==remote[key]);
      return <article className="inspection-card" key={conflict.key}>
        <h3>{title(conflict)}</h3>
        <div className="inspection-differences">{changed.map(label=><div key={label}>
          <b>{label}</b><p>This phone: <Value value={local[label]??'Removed'}/></p><p>Saved account: <Value value={remote[label]??'Removed'}/></p>
        </div>)}</div>
        <div className="inspection-choice" role="group" aria-label={title(conflict)}>{['local','remote'].map(side=><button type="button" key={side} disabled={busy} aria-pressed={choices[conflict.key]===side} onClick={()=>onChoose(conflict.key,side)}>{choices[conflict.key]===side?'✓ ':''}{side==='local'?'Use this phone':'Use saved account'}</button>)}</div>
      </article>;
    })}
    <p role="status">{conflicts.filter(c=>choices[c.key]).length} of {conflicts.length} selected</p>
    <button className="primary" disabled={busy || conflicts.some(c=>!['local','remote'].includes(choices[c.key]))} onClick={onConfirm}>Save choices & prepare link</button>
  </section>;
}
