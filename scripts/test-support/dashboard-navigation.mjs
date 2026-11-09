// Exercise the current visible navigation, without changing app or stored state.
export async function missionPage(page){
 await page.getByRole('button',{name:'Active Load',exact:true}).or(page.getByRole('button',{name:'Back to Home',exact:true})).or(page.getByRole('button',{name:/Home/i})).first().waitFor();
 if(!await page.locator('.rr-driver-mission').isVisible()){
  if(!await page.locator('.rr-driver-home').isVisible())await page.getByRole('button',{name:/Home/i}).first().click();
  await page.getByRole('button',{name:'Active Load',exact:true}).click();
 }
 await page.locator('.rr-driver-mission').waitFor();
 return page;
}
export async function homeControl(page,name){
 const control=page.getByRole('button',{name,exact:true});
 if(await page.locator('.rr-driver-mission').isVisible()&&!await control.isVisible())await page.getByRole('button',{name:'Back to Home',exact:true}).click();
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
