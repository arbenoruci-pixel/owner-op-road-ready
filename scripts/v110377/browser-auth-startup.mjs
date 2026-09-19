import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium, webkit } from 'playwright';

const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000';
const output='browser-test-results/auth-startup-v110377';
fs.mkdirSync(output,{recursive:true});

const user={
  id:'00000000-0000-4000-8000-000000000077',
  email:'approved-driver@example.test',
  email_confirmed_at:'2026-01-01T00:00:00Z',
  aud:'authenticated',
  role:'authenticated',
  app_metadata:{provider:'email'},
  user_metadata:{},
};
const authKey='owner-op-prototype-auth-v1';
const approvalKey='owner-op-approved-device-v1:'+user.id;

function session(expired=true){
  return {
    access_token:'synthetic-access',
    refresh_token:'synthetic-refresh',
    token_type:'bearer',
    expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+(expired?-3600:3600),
    user,
  };
}

async function prepare(context,{approved}){
  await context.addInitScript(({authKey,approvalKey,user,approved,session})=>{
    const nativeFetch=window.fetch.bind(window);
    window.fetch=(input,init)=>{
      const url=String(typeof input==='string'?input:input?.url||'');
      if(url.includes('ghwkcgczuwctzxsxmqzx.supabase.co')) return new Promise(()=>{});
      return nativeFetch(input,init);
    };
    localStorage.setItem(authKey,JSON.stringify(session));
    if(approved){
      localStorage.setItem(approvalKey,JSON.stringify({userId:user.id,email:user.email,verifiedAt:Date.now()}));
    }else{
      localStorage.removeItem(approvalKey);
    }
  },{authKey,approvalKey,user,approved,session:session(true)});
}

const results=[];
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch({headless:true});
  try{
    {
      const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
      await prepare(context,{approved:true});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      const started=Date.now();
      await page.goto(origin,{waitUntil:'domcontentloaded'});
      await page.getByRole('button',{name:'Account security'}).waitFor({timeout:3500});
      const elapsed=Date.now()-started;
      assert.equal(await page.getByText('Checking secure session…',{exact:true}).count(),0,'approved device leaves loading screen');
      await page.getByText('Secure cached session',{exact:true}).waitFor({timeout:1000});
      assert.ok(elapsed<3500,'approved cached device opens before auth network can settle');
      assert.deepEqual(errors,[]);
      await page.screenshot({path:`${output}/${name}-approved-fast.png`,fullPage:true});
      results.push({browser:name,case:'approved-fast',passed:true,elapsedMs:elapsed});
      await context.close();
    }
    {
      const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
      await prepare(context,{approved:false});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      const started=Date.now();
      await page.goto(origin,{waitUntil:'domcontentloaded'});
      await page.getByRole('heading',{name:'Internet check required'}).waitFor({timeout:5000});
      const elapsed=Date.now()-started;
      assert.ok(elapsed<5000,'unapproved device leaves loading screen after bounded session timeout');
      assert.match(await page.locator('.owner-auth-error').innerText(),/taking too long/i);
      assert.equal(await page.getByText('Checking secure session…',{exact:true}).count(),0);
      assert.deepEqual(errors,[]);
      await page.screenshot({path:`${output}/${name}-timeout-fallback.png`,fullPage:true});
      results.push({browser:name,case:'timeout-fallback',passed:true,elapsedMs:elapsed});
      await context.close();
    }
  }catch(error){
    results.push({browser:name,passed:false,error:String(error),stack:error.stack});
    throw error;
  }finally{
    await browser.close();
  }
}
fs.writeFileSync(`${output}/results.json`,JSON.stringify(results,null,2));
assert.ok(results.every(row=>row.passed),JSON.stringify(results));
console.log('PASS — cached approved startup and bounded timeout in Chromium + WebKit');
