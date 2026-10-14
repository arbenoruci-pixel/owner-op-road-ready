// Use the same visible controls as a driver; never set React or stored state.
export const loadFolderTrigger=page=>page.getByRole('button',{name:'Choose load folder',exact:true});
export async function selectedLoadFolder(page){
 const label=await loadFolderTrigger(page).locator('strong').innerText();
 return label==='Choose a load'?'':label.replace(/^Load /,'');
}
export async function chooseLoadFolder(page,loadNo){
 await loadFolderTrigger(page).click();
 const picker=page.getByRole('dialog',{name:'Choose load folder',exact:true});
 if(!loadNo){await picker.getByRole('button',{name:'Choose later — save without a load',exact:true}).click();return;}
 const label=picker.getByText('Load '+loadNo,{exact:true});
 if(await label.count())await label.click();
 else await picker.getByRole('button',{name:'Create Load '+loadNo,exact:true}).click();
}
