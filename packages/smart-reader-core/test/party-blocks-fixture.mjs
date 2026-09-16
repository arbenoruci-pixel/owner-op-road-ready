const row=(text,x,y,width,height=.012,confidence=.96)=>({text,box:{x,y,width,height},confidence});
export function partyBlocksInput({facility='TOWN DEPOT #1-2'}={}){
  const common=[row('BILL OF LADING',.03,.03,.4,.02),row('BOL#: 001234500',.75,.09,.18),row('Ship Date: 7/14/2026',.75,.12,.2),row('PO#: 04929910',.25,.55,.2)];
  const clean=[...common,
    row('Carrier garbled words interest in the goods identified herein, and in',.025,.14,.52,.012,.59),
    row('CARRIER: EXAMPLE TRANSPORT',.03,.17,.30),
    row('FROM:',.03,.19,.05),row('NORTHERN FOODS',.15,.192,.16),
    row('CONSIGNED REGIONAL MARKET',.03,.24,.32),row('TO: '+facility,.065,.255,.27),
  ];
  const sparse=[...common,
    row('CARRIER:',.03,.17,.08),row('EXAMPLE TRANSPORT',.15,.172,.2),
    row('FROM:',.03,.19,.05),row('NORTHERN FOODS',.15,.192,.16),
    row('CONSIGNED',.03,.24,.09),row('REGIONAL MARKET',.15,.242,.2),
    row('TO:',.065,.255,.03),row(facility,.15,.257,.22),
    row('900 HIGHWAY 10 S',.15,.278,.22),row('TOWN, MN 56304',.15,.3,.22),
  ];
  const missing=structuredClone(sparse).filter(line=>line.text!=='TO:');
  return {documentId:'wrapped-consignee',pages:[{id:'page-1',observations:[clean,sparse,missing].map((lines,i)=>({id:'pass-'+i,sourceImageId:'image-'+i,source:'fixture',lines}))}]};
}

export function partyBlockPasses(){
  return partyBlocksInput().pages[0].observations.map(observation=>({id:observation.id,text:observation.lines.map(line=>line.text).join('\n'),imageSize:{width:1000,height:1000},confidence:.96,
    lines:observation.lines.map(line=>({text:line.text,confidence:line.confidence*100,left:line.box.x*1000,top:line.box.y*1000,width:line.box.width*1000,height:line.box.height*1000}))}));
}
