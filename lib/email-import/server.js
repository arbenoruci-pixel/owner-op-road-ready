import {ConfidentialClientApplication} from '@azure/msal-node';
import {randomUUID,createHash} from 'node:crypto';
import {authorizeReader} from '../reader-ai/server.js';
import {createMicrosoftDocumentImport} from './microsoft.js';
import {emailStore} from './store.js';
import {EMAIL_SCOPES,CALLBACK,configuration,seal,open,hash,random,cookie,readCookie,requireOrigin} from './security.js';

const headers={'Cache-Control':'private, no-store','CDN-Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const json=(value,status=200,extra={})=>Response.json(value,{status,headers:{...headers,...extra}});
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const checkId=value=>{if(typeof value!=='string'||!value||value.length>2048)throw fail('Choose a document again.');return value;};
async function body(request){
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw fail('Invalid request.',415);
  const reader=request.body?.getReader();if(!reader)throw fail('Invalid request.');
  let size=0;const chunks=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>12000)throw fail('Request is too large.',413);chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail('Invalid request.');}
}
const createMsal=config=>new ConfidentialClientApplication({auth:{clientId:config.clientId,clientSecret:config.secret,authority:'https://login.microsoftonline.com/common'},system:{loggerOptions:{piiLoggingEnabled:false,loggerCallback:()=>{}}}});

export function createEmailHandlers({env=()=>process.env,authorize=authorizeReader,fetcher=fetch,storeFactory=emailStore,msalFactory=createMsal,now=Date.now}={}){
  const checked=(value,key,purpose)=>{const data=open(value,key,purpose);if(!Number.isFinite(data.expires)||data.expires<=now())throw fail('This email session expired. Please try again.',409);return data;};
  function db(request,owner){return storeFactory({authorization:request.headers.get('authorization'),owner,fetcher,signal:request.signal});}
  async function connection(store,config,owner){
    const row=await store.get();if(!row?.sealed_cache)throw fail('Connect Outlook to import documents.',409);
    let data;try{data=open(row.sealed_cache,config.key,'cache:'+owner+':'+row.connection_id);}catch{throw fail('Reconnect Outlook to continue.',409);}
    return {row,data};
  }
  async function access(store,config,owner){
    for(let attempt=0;attempt<2;attempt++){
      const {row,data}=await connection(store,config,owner),msal=msalFactory(config);
      msal.getTokenCache().deserialize(data.cache);
      const account=await msal.getTokenCache().getAccountByHomeId(data.homeAccountId);
      if(!account)throw fail('Reconnect Outlook to continue.',409);
      let token;try{token=await msal.acquireTokenSilent({account,scopes:EMAIL_SCOPES});}catch{throw fail('Your Outlook connection needs attention. Reconnect to continue.',409);}
      if(!token?.accessToken)throw fail('Reconnect Outlook to continue.',409);
      const cache=msal.getTokenCache().serialize();
      if(cache!==data.cache){
        const saved=await store.update(row.connection_id,row.revision,{sealed_cache:seal({...data,cache},config.key,'cache:'+owner+':'+row.connection_id),revision:row.revision+1});
        if(!saved)continue;
      }
      const live=await store.get();if(live?.connection_id!==row.connection_id)throw fail('The email account changed. Open the list again.',409);
      return {token:token.accessToken,row,data};
    }
    throw fail('The email connection changed. Try again.',409);
  }
  async function callback(request,config){
    const url=new URL(request.url),state=url.searchParams.get('state');
    const attempt=checked(readCookie(request),config.key,'oauth');
    if(state!==attempt.state)throw fail('Microsoft sign-in could not be verified.',403);
    // Validate the app session again; the short-lived cookie contains only an
    // encrypted Road Ready JWT and PKCE verifier, never a Microsoft grant.
    const authRequest=new Request(config.origin+CALLBACK,{headers:{Authorization:attempt.authorization},signal:request.signal});
    const owner=await authorize(authRequest,fetcher);
    if(owner!==attempt.owner)throw fail('Sign in to the same Road Ready account.',403);
    const store=db(authRequest,owner);
    const row=await store.update(attempt.connectionId,0,{pending_hash:null,revision:1},{pending_hash:'eq.'+hash(state)});
    if(!row)throw fail('This sign-in was cancelled or already used.',409);
    if(url.searchParams.has('error'))throw fail('Microsoft sign-in was cancelled. You can connect again.');
    const code=url.searchParams.get('code');
    if(!code||code.length>8192)throw fail('Microsoft sign-in could not be verified.');
    const msal=msalFactory(config);
    const result=await msal.acquireTokenByCode({code,scopes:EMAIL_SCOPES,redirectUri:config.redirectUri,codeVerifier:attempt.verifier,nonce:attempt.nonce});
    if(!result?.accessToken||!result.account?.homeAccountId||result.idTokenClaims?.nonce!==attempt.nonce)throw fail('Microsoft sign-in could not be verified.',403);
    const granted=new Set((result.scopes||[]).map(s=>s.toLowerCase().replace('https://graph.microsoft.com/','')));
    if(!granted.has('mail.read'))throw fail('Allow read access to import Outlook documents.',403);
    const profile=await fetcher('https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName,displayName',{headers:{Authorization:'Bearer '+result.accessToken},redirect:'error',cache:'no-store',signal:request.signal});
    if(!profile.ok)throw fail('Could not verify the Outlook account.',502);
    const me=await profile.json();checkId(me.id);
    const data={cache:msal.getTokenCache().serialize(),homeAccountId:result.account.homeAccountId,account:{id:me.id,email:String(me.mail||me.userPrincipalName||'').slice(0,320),name:String(me.displayName||'').slice(0,160)}};
    if(!await store.update(row.connection_id,1,{sealed_cache:seal(data,config.key,'cache:'+owner+':'+row.connection_id),revision:2}))throw fail('Connection was cancelled. Please connect again.',409);
    return new Response(null,{status:303,headers:{...headers,'Set-Cookie':cookie(),Location:config.origin+'/?emailImport=connected'}});
  }
  async function handle(request){
    request=new Request(request,{signal:AbortSignal.any([request.signal,AbortSignal.timeout(55000)])});
    const config=configuration(env()),url=new URL(request.url),action=url.pathname.split('/').pop();
    try{
      if(action==='callback'){
        if(!config||request.method!=='GET')throw fail('Email connection is unavailable.',503);
        return await callback(request,config);
      }
      if(!['GET','POST'].includes(request.method))throw fail('Method not allowed.',405);
      if(request.method==='POST')requireOrigin(request,config?.origin||'https://owner-op-road-ready.vercel.app');
      const owner=await authorize(request,fetcher),store=db(request,owner);
      if(action==='status'&&request.method==='GET'){
        if(!config)return json({configured:false,connected:false});
        const row=await store.get();
        if(!row?.sealed_cache)return json({configured:true,connected:false});
        try{const data=open(row.sealed_cache,config.key,'cache:'+owner+':'+row.connection_id);return json({configured:true,connected:true,account:data.account,connectionId:row.connection_id});}catch{return json({configured:true,connected:false,reconnect:true});}
      }
      if(action==='disconnect'&&request.method==='POST'){await store.disconnect();return json({disconnected:true},200,{'Set-Cookie':cookie()});}
      if(!config)throw fail('Outlook connection is being set up. You can import a PDF or photo now.',503);
      if(action==='connect'&&request.method==='POST'){
        const state=random(),nonce=random(),verifier=random(),connectionId=randomUUID();
        const challenge=createHash('sha256').update(verifier).digest('base64url');
        const sealed=seal({owner,authorization:request.headers.get('authorization'),state,nonce,verifier,connectionId,expires:now()+600000},config.key,'oauth');
        if(sealed.length>3700)throw fail('Please sign in to Road Ready again.',401);
        const msal=msalFactory(config),authorizeUrl=await msal.getAuthCodeUrl({scopes:EMAIL_SCOPES,redirectUri:config.redirectUri,state,nonce,codeChallenge:challenge,codeChallengeMethod:'S256',prompt:'select_account',responseMode:'query'});
        await store.start({connection_id:connectionId,revision:0,pending_hash:hash(state),sealed_cache:null});
        return json({authorizeUrl},200,{'Set-Cookie':cookie(sealed,600)});
      }
      if(action==='ack'&&request.method==='POST'){
        const input=await body(request),proof=checked(input.receipt,config.key,'receipt:'+owner);
        if(typeof input.documentId!=='string'||!input.documentId||input.documentId.length>200)throw fail('Save the document first.');
        await store.mark({...proof,documentId:input.documentId});return json({saved:true});
      }
      if(request.method!=='POST'||!['list','read'].includes(action))throw fail('Not found.',404);
      const input=await body(request),{token,row,data}=await access(store,config,owner);
      if(input.connectionId!==row.connection_id)throw fail('The email account changed. Open the list again.',409);
      const adapter=createMicrosoftDocumentImport({getAccessToken:async()=>token,fetcher});
      if(action==='list'){
        const folder=input.folder==='sentitems'?'sentitems':'inbox';let cursor;
        if(input.cursor){const value=checked(input.cursor,config.key,'cursor:'+owner+':'+row.connection_id);if(value.folder!==folder)throw fail('Open this folder again.');cursor=value.url;}
        const result=await adapter.list({folder,cursor,signal:request.signal});
        if((await store.get())?.connection_id!==row.connection_id)throw fail('The email account changed. Open the list again.',409);
        return json({...result,nextCursor:result.nextCursor?seal({url:result.nextCursor,folder,expires:now()+900000},config.key,'cursor:'+owner+':'+row.connection_id):null});
      }
      const result=await adapter.read({accountId:data.account.id,messageId:checkId(input.messageId),attachmentId:checkId(input.attachmentId),signal:request.signal});
      if((await store.get())?.connection_id!==row.connection_id)throw fail('The email account changed. Open the list again.',409);
      const previous=await store.imported(data.account.id,result.provenance.sha256);
      if(previous)return json({duplicate:true,documentId:previous.document_id});
      const receipt=seal({...result.provenance,expires:now()+30*86400000},config.key,'receipt:'+owner);
      return new Response(result.file.stream(),{headers:{...headers,'Content-Type':result.file.type,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(result.file.name)}`,'X-Email-Receipt':receipt,'X-Email-Provenance':encodeURIComponent(JSON.stringify(result.provenance))}});
    }catch(error){
      const status=error.status||502;
      const message=error.status?error.message:'Could not read email documents. Please try again or reconnect Outlook.';
      if(action==='callback')return new Response('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect Outlook</title><main style="font:18px system-ui;max-width:460px;margin:15vh auto;padding:24px"><h1>Outlook connection paused</h1><p>Sign-in could not be completed. Return to Road Ready and choose Connect Outlook again.</p><a href="/">Return to Road Ready</a></main>',{status:400,headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",'Set-Cookie':cookie()}});
      // Never return provider errors, codes, token caches or email contents.
      return json({error:status===401?'Sign in to Road Ready to connect email.':message},status);
    }
  }
  return {handle};
}
