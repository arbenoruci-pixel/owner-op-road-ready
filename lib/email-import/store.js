// Use the approved driver's JWT and RLS; this module never needs an admin key.
const BASE='https://ghwkcgczuwctzxsxmqzx.supabase.co/rest/v1/';
const KEY='sb_publishable_YP8uKzWiV-l-ZiJhy9smbQ_hmbEPBrb';
export function emailStore({authorization,owner,fetcher=fetch,signal}){
  async function query(table,method='GET',filters={},body){
    const params=new URLSearchParams({owner_id:`eq.${owner}`,...filters});
    const r=await fetcher(BASE+table+'?'+params,{method,headers:{Authorization:authorization,apikey:KEY,'Content-Type':'application/json',Prefer:'return=representation'},body:body?JSON.stringify(body):undefined,cache:'no-store',signal});
    if(!r.ok)throw Object.assign(Error('Email storage is unavailable. Please try again.'),{status:503});
    return r.status===204?[]:r.json();
  }
  const connections='road_ready_email_connections',imports='road_ready_email_imports';
  return {
    async get(){return (await query(connections))[0]||null;},
    async start(row){
      // Explicit reconnect replaces the old grant. A callback/refresh can only
      // update this generation; disconnect cannot be undone by an in-flight job.
      await query(connections,'DELETE');
      return (await query(connections,'POST',{}, {owner_id:owner,...row}))[0];
    },
    async update(connectionId,revision,values,extra={}){return (await query(connections,'PATCH',{connection_id:`eq.${connectionId}`,revision:`eq.${revision}`,...extra},values))[0]||null;},
    async disconnect(){await query(connections,'DELETE');},
    async imported(account,sha256){return (await query(imports,'GET',{account_id:`eq.${account}`,sha256:`eq.${sha256}`,select:'document_id,sha256'}))[0]||null;},
    async mark({accountId,sha256,messageId,attachmentId,documentId}){
      if(await this.imported(accountId,sha256))return;
      await query(imports,'POST',{}, {owner_id:owner,account_id:accountId,sha256,message_id:messageId,attachment_id:attachmentId,document_id:documentId});
    },
  };
}
