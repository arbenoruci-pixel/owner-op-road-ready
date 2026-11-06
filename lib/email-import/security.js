import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';

export const EMAIL_SCOPES=Object.freeze(['https://graph.microsoft.com/Mail.Read','https://graph.microsoft.com/User.Read','offline_access']);
export const CALLBACK='/api/email-import/callback';
export const COOKIE='__Host-road-ready-email';
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const random=()=>randomBytes(32).toString('base64url');
export function configuration(env=process.env){
  const clientId=env.EMAIL_IMPORT_MICROSOFT_CLIENT_ID,secret=env.EMAIL_IMPORT_MICROSOFT_CLIENT_SECRET;
  const key=Buffer.from(env.EMAIL_IMPORT_ENCRYPTION_KEY||'','base64');
  if(!/^[a-f0-9-]{36}$/i.test(clientId||'')||!secret||key.length!==32)return null;
  const origin=env.EMAIL_IMPORT_ORIGIN||'https://owner-op-road-ready.vercel.app';
  const url=new URL(origin);
  if(url.protocol!=='https:'||url.origin!==origin)throw Error('Invalid email origin');
  return {clientId,secret,key,origin,redirectUri:origin+CALLBACK};
}
export function seal(value,key,purpose){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from(purpose));
  return Buffer.concat([iv,cipher.update(JSON.stringify(value)),cipher.final(),cipher.getAuthTag()]).toString('base64url');
}
export function open(value,key,purpose){
  if(typeof value!=='string'||value.length>1000000)throw Error('Invalid sealed data');
  const bytes=Buffer.from(value,'base64url');
  if(bytes.length<29)throw Error('Invalid sealed data');
  const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));
  decipher.setAAD(Buffer.from(purpose));decipher.setAuthTag(bytes.subarray(-16));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]).toString('utf8'));
}
export function cookie(value='',maxAge=0){return `${COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;}
export function readCookie(request){return (request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';}
export function requireOrigin(request,origin){if(request.headers.get('origin')!==origin)throw Object.assign(Error('Open Road Ready to continue.'),{status:403});}
