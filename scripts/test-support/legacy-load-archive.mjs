// Historical archive tests must enter the retained archive through visible controls.
// Do not bypass the new Loads landing page or change application/stored state.
export async function openLegacyLoadArchive(page){
 const archive=page.locator('.rr-docs-browser');
 await page.locator('.rr-smart, .rr-docs-browser').first().waitFor();
 if(!await archive.isVisible()){
  const options=page.locator('.rr-smart-options');
  if(!await options.evaluate(el=>el.open))await options.locator('summary').click();
  await options.getByRole('button',{name:'Organize files, weekly archive & exports',exact:true}).click();
 }
 await archive.waitFor();
}
export async function openRecordsFiles(page){
 await page.getByRole('navigation',{name:'Records views'}).getByRole('button',{name:'Files',exact:true}).click();
 await page.getByPlaceholder('Load, receipt, truck or name').waitFor();
}
