import React from 'react';

export default function LoadRouteHelpersV110325({ steps = [] }) {
  if (!steps.length) return null;
  return <section aria-label="Route helpers" style={{marginTop:18,borderRadius:24,padding:22,background:'#fff',border:'1px solid #d7e1ee',color:'#10213c'}}>
    <h2 style={{margin:'0 0 8px'}}>Route helpers</h2>
    <p style={{margin:'0 0 14px',color:'#40526f'}}>Optional navigation. Routes do not affect load completion.</p>
    {steps.map((step,index) => {
      const destination = step.location || [step.city,step.state].filter(Boolean).join(', ');
      const usable = destination && !/location\s+after\s+pickup|unless\s+otherwise\s+instructed/i.test(destination);
      const open = () => {
        if (!usable || typeof window === 'undefined') return;
        const params = new URLSearchParams({api:'1',destination,travelmode:'driving'});
        window.open('https://www.google.com/maps/dir/?'+params, '_blank', 'noopener,noreferrer');
      };
      return <div key={step.id || index} data-route-helper={step.id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderTop:'1px solid #d7e1ee'}}>
        <div style={{flex:1,minWidth:0}}><b>{step.title}</b><p style={{margin:'5px 0',overflowWrap:'anywhere'}}>{usable ? destination : 'Review the address in the load document'}</p></div>
        <button type="button" disabled={!usable} onClick={open} style={{border:'1px solid #bfcde0',borderRadius:12,padding:'10px 12px',background:'#fff',color:'#175cc8',fontWeight:900}}>Open route</button>
      </div>;
    })}
  </section>;
}
