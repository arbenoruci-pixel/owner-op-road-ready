// Explicit one-shot worker; never connects unless invoked by a trusted host.
// Supply short-lived delegated read tokens and a verified carrier/allowlisted
// mailbox. No secret in command-line args, Git, logs, or browser state.
import { createClient } from '@supabase/supabase-js';
import { createMailboxReader, runMailboxWindow } from '../../lib/rr-lease/email-pipeline.js';
const env=process.env;
const required=['RR_MAIL_PROVIDER','RR_MAILBOX','RR_CARRIER_ID','RR_MAIL_ACCESS_TOKEN','RR_MAIL_WINDOW_END','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
if(required.some(k=>!env[k]))throw Error('Missing authorized worker configuration');
if(!['gmail','outlook'].includes(env.RR_MAIL_PROVIDER))throw Error('Unsupported mailbox');
const db=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const provider=env.RR_MAIL_PROVIDER,mailbox=env.RR_MAILBOX.toLowerCase();
const reader=createMailboxReader({provider,mailbox,getAccessToken:async()=>env.RR_MAIL_ACCESS_TOKEN});
// No model service is assumed or secretly contacted. The host can supply a
// separately authorized extractor to runMailboxWindow; fallback is unknown/DRAFT.
const result=await runMailboxWindow({db,carrier:env.RR_CARRIER_ID,provider,mailbox,reader,initialStart:env.RR_MAIL_INITIAL_START,end:env.RR_MAIL_WINDOW_END});
console.log(JSON.stringify({items:result.items??null,checkedThrough:result.checkedThrough,replay:result.replay}));
