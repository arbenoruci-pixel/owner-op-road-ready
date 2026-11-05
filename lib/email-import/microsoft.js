// Read-only ingestion adapter. The host must supply a delegated Mail.Read token
// for the current Road Ready user. No mailbox credentials or token persistence.
export const MAIL_IMPORT_LIMITS=Object.freeze({messages:20,attachments:40,fileBytes:12*1024*1024,responseBytes:18*1024*1024});
const origin='https://graph.microsoft.com',base=origin+'/v1.0';
const types=new Set(['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif','image/tiff']);
const id=value=>{if(typeof value!=='string'||!value||value.length>2048)throw Error('Invalid mailbox item');return encodeURIComponent(value);};
const safeName=value=>String(value||'Document').replace(/[\u0000-\u001f\u007f/\\]/g,'_').slice(0,180);
function allowedUrl(value){const url=new URL(value);if(url.origin!==origin||url.username||url.password||!url.pathname.startsWith('/v1.0/me/messages'))throw Error('Unexpected mailbox address');return url.href;}
async function limitedJson(response){
  if(!response.ok)throw Error(response.status===401?'Reconnect your Microsoft account.':response.status===429?'Mailbox is busy. Try again shortly.':'Could not read mailbox documents.');
  if(Number(response.headers.get('content-length'))>MAIL_IMPORT_LIMITS.responseBytes)throw Error('Mailbox response is too large.');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAIL_IMPORT_LIMITS.responseBytes)throw Error('Mailbox response is too large.');chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function createMicrosoftDocumentImport({getAccessToken,fetcher=fetch}){
  async function get(url,signal){
    const target=allowedUrl(url),token=await getAccessToken({signal});
    if(typeof token!=='string'||!token)throw Error('Connect Microsoft to import documents.');
    return limitedJson(await fetcher(target,{method:'GET',signal,redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/json',Prefer:'IdType="ImmutableId"'}}));
  }
  return {
    async list({signal,cursor}={}){
      const query=new URLSearchParams({'$filter':'hasAttachments eq true','$select':'id,subject,from,receivedDateTime','$top':String(MAIL_IMPORT_LIMITS.messages)});
      const messages=await get(cursor||`${base}/me/messages?${query}`,signal),items=[];
      for(const message of (messages.value||[]).slice(0,MAIL_IMPORT_LIMITS.messages)){
        if(signal?.aborted)throw new DOMException('Import stopped','AbortError');
        const data=await get(`${base}/me/messages/${id(message.id)}/attachments?$select=id,name,contentType,size,isInline`,signal);
        if(data['@odata.nextLink'])throw Error('This message has many attachments. Import its documents individually.');
        for(const attachment of data.value||[]){
          if(attachment['@odata.type']!=='#microsoft.graph.fileAttachment'||attachment.isInline||!types.has(attachment.contentType)||!(attachment.size>0&&attachment.size<=MAIL_IMPORT_LIMITS.fileBytes))continue;
          items.push({messageId:message.id,attachmentId:attachment.id,name:safeName(attachment.name),type:attachment.contentType,size:attachment.size,subject:String(message.subject||'').slice(0,300),sender:String(message.from?.emailAddress?.address||'').slice(0,320),receivedAt:message.receivedDateTime});
        }
        if(items.length>MAIL_IMPORT_LIMITS.attachments)throw Error('Too many documents in this batch. Narrow the mailbox selection.');
      }
      return {items:items.slice(0,MAIL_IMPORT_LIMITS.attachments),nextCursor:messages['@odata.nextLink']?allowedUrl(messages['@odata.nextLink']):null};
    },
    async read({accountId,messageId,attachmentId,knownHashes=[],signal}){
      if(typeof accountId!=='string'||!accountId)throw Error('Mailbox account is missing.');
      const item=await get(`${base}/me/messages/${id(messageId)}/attachments/${id(attachmentId)}`,signal);
      if(item['@odata.type']!=='#microsoft.graph.fileAttachment'||item.isInline||!types.has(item.contentType)||!(item.size>0&&item.size<=MAIL_IMPORT_LIMITS.fileBytes)||typeof item.contentBytes!=='string')throw Error('Choose a supported document attachment.');
      if(item.contentBytes.length>Math.ceil(MAIL_IMPORT_LIMITS.fileBytes/3)*4)throw Error('Attachment is too large.');
      const bytes=Uint8Array.from(atob(item.contentBytes),c=>c.charCodeAt(0));
      if(bytes.length!==item.size)throw Error('Attachment size did not match. Try again.');
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
      const provenance={provider:'microsoft',accountId,messageId,attachmentId,sha256:hash};
      if(knownHashes.includes(hash))return {duplicate:true,provenance};
      return {duplicate:false,file:new File([bytes],safeName(item.name),{type:item.contentType}),provenance,requiresReview:true};
    },
  };
}
