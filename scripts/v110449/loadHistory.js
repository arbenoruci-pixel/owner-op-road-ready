const list=value=>Array.isArray(value)?value:[];
const text=value=>String(value??'').trim();
const documentId=doc=>text(doc?.client_document_id||doc?.clientDocumentId||doc?.local_id||doc?.localDocumentId||doc?.id);

// Group presentation only. Every issue and the original review target survive.
export function supportingFileChecks(rows=[]) {
  const groups=new Map();
  for(const row of rows) {
    const id=documentId(row.document),key=id?'source:'+id:'check:'+row.id;
    if(!groups.has(key))groups.set(key,{...row,id:key,checks:[],
      label:id?text(row.document.original_file_name||row.document.fileName||row.document.title)||'Saved document '+id:row.label});
    groups.get(key).checks.push(row);
  }
  return [...groups.values()].map(group=>({...group,detail:[...new Set(group.checks.map(row=>row.label+': '+row.detail))].join(' ')}));
}

// An imported source copy is separate from the active driver's editable log.
export function savedLoadLogbooks(archives=[],loadNo='') {
  const target=text(loadNo).toUpperCase(),found=[];
  for(const archive of archives)for(const link of list(archive.logbookLinks)) {
    if(text(link.loadNo).toUpperCase()!==target)continue;
    const log=list(archive.logbook).find(row=>row.day===link.day&&row.driverId===link.driverId);
    if(log&&list(log.events).length)found.push({...link,log});
  }
  return [...new Map(found.map(link=>[link.driverId+'|'+link.day,link])).values()];
}
