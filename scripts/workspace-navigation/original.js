// Read only. The authenticated server resolves ownership and storage location.
export async function readDocumentOriginal(record,{readLocal,getAccessToken,fetch:request}){
  const clientId=String(record.client_document_id||record.clientDocumentId||'').trim();
  const local=clientId?await readLocal(clientId):null;
  if(local?.size)return local;
  if(typeof record.dataUrl==='string'&&/^data:(application\/pdf|image\/(png|jpeg|webp));base64,/.test(record.dataUrl))return (await request(record.dataUrl)).blob();
  if(!/^[a-zA-Z0-9_-]{1,160}$/.test(clientId))return null;
  const token=await getAccessToken();
  if(!token)throw Error('Sign in to retrieve the cloud original.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{
    // Legacy business metadata may omit cloud flags. Its stable client ID is
    // sufficient for an authenticated, owner-scoped lookup on this endpoint.
    const response=await request('/api/documents/read-original',{method:'POST',cache:'no-store',signal:controller.signal,
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({client_document_id:clientId})});
    if(response.status===404)return null;
    if(response.status===401||response.status===403)throw Error('Sign in to retrieve this account’s cloud original.');
    if(!response.ok)throw Error('Cloud original could not be retrieved. Connect and try again.');
    return response.blob();
  }finally{clearTimeout(timer);}
}
