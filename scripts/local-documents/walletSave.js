// Use the existing snapshot acknowledgement; never write a stale whole state
// from the editor or touch a driver's logbook to save a Wallet document.
export async function saveWalletOriginal({wallet,id,doc,onApply,fingerprint,readSaved,target=window,timeout=15000}) {
  const token=crypto.randomUUID(),next={...wallet,documents:{...wallet.documents,[id]:doc},lastReviewedAt:Date.now(),lastImport:{...wallet.lastImport,token}};
  if(typeof onApply!=='function')throw Error('Local saving is unavailable. Keep this document open.');
  await new Promise((resolve,reject)=>{
    let timer;
    const cleanup=()=>{target.removeEventListener('road-ready-wallet-saved',finish);clearTimeout(timer);};
    async function finish(e){
      if(e.detail?.token!==token)return;
      cleanup();
      try {
        if(e.detail.error)throw Error('Device storage could not save this document. Keep it open and save a copy to Files.');
        const saved=await readSaved();
        if(JSON.stringify(saved?.documents?.[id])!==JSON.stringify(doc))throw Error('The saved document could not be verified. Keep it open and try again.');
        resolve();
      }catch(error){reject(error);}
    }
    target.addEventListener('road-ready-wallet-saved',finish);
    timer=setTimeout(()=>{cleanup();reject(Error('Saving was not confirmed. Keep this document open and check device storage.'));},timeout);
    try{onApply(next,fingerprint(wallet));}catch(error){cleanup();reject(error);}
  });
}
