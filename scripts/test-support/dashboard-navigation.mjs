// Exercise the current visible navigation, without changing app or stored state.
const secondaryTools = new Set([
 'Active Load','Billing','Documents','Drive','Export & Backup','Import','Maintenance',
 'Manage load details','My month','Settings','Wallet',
]);

export async function missionPage(page){
 const mission=page.locator('.rr-driver-mission');
 const driver=page.getByRole('navigation',{name:'Driver navigation'});
 const home=page.getByRole('button',{name:/Home/i}).first();
 await mission.or(driver).or(home).first().waitFor();
 if(!await mission.isVisible()){
  if(!await driver.isVisible())await home.click();
  await (await homeControl(page,'Active Load')).click();
 }
 await mission.waitFor();
 return page;
}

export async function homeControl(page,name){
 const control=page.getByRole('button',{name,exact:true});
 if(await page.locator('.rr-driver-mission').isVisible()&&!await control.isVisible()){
  await page.getByRole('button',{name:'Back to Home',exact:true}).click();
 }
 const nav=page.getByRole('navigation',{name:'Driver navigation'});
 if(['Smart Scan','Continue saved scan','DOT Mode'].includes(name)&&!await control.isVisible()){
  const more=nav.getByRole('button',{name:'More tools',exact:true});
  if(await more.isVisible()&&await more.getAttribute('aria-current')==='page'){
   await nav.getByRole('button',{name:'Today',exact:true}).click();
  }
 }
 if(secondaryTools.has(name)){
  const more=nav.getByRole('button',{name:'More tools',exact:true});
  await control.or(more).first().waitFor();
  if(!await control.isVisible())await more.click();
 }
 return control;
}

export async function searchContrast(locator){
 return locator.evaluate(el=>{
  const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number);
  const lum=value=>rgb(value).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const style=getComputedStyle(el),a=lum(style.color),b=lum(style.backgroundColor);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
 });
}

export async function readingDetails(region){
 const toggle=region.getByRole('button',{name:'All reading details',exact:true});
 const exported=region.getByRole('button',{name:'Export reading review',exact:true});
 await toggle.or(exported).first().waitFor();
 if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
 return region;
}
