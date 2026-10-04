// Keep the installed PWA in place while preparing originals asynchronously.
export function createDocumentPreview(){
 document.querySelector('[data-road-ready-original-preview]')?.dispatchEvent(new Event('close-preview'));
 const panel=document.createElement('dialog');panel.dataset.roadReadyOriginalPreview='true';panel.setAttribute('aria-label','Original document');
 Object.assign(panel.style,{position:'fixed',inset:'0',margin:'0',padding:'0',width:'100vw',height:'100dvh',maxWidth:'100vw',maxHeight:'100dvh',border:'0',background:'#fff',color:'#182b43',zIndex:'2147483646'});
 const wrap=document.createElement('div');Object.assign(wrap.style,{height:'100%',display:'flex',flexDirection:'column',paddingTop:'env(safe-area-inset-top, 0px)',boxSizing:'border-box'});
 const bar=document.createElement('div');Object.assign(bar.style,{display:'flex',alignItems:'center',gap:'14px',padding:'14px',flexWrap:'wrap',borderBottom:'1px solid #d6dfe7'});
 const close=document.createElement('button');close.type='button';close.textContent='Close';
 const title=document.createElement('strong');title.textContent='Preparing original…';Object.assign(title.style,{flex:'1',overflowWrap:'anywhere'});
 const body=document.createElement('div');Object.assign(body.style,{flex:'1',overflow:'auto',minHeight:'0'});body.textContent='Reading the saved file…';
 bar.append(close,title);wrap.append(bar,body);panel.append(wrap);document.body.append(panel);
 let url='',closed=false;
 const dismiss=()=>{if(closed)return;closed=true;panel.remove();if(url)URL.revokeObjectURL(url);};
 close.onclick=dismiss;panel.addEventListener('cancel',dismiss);panel.addEventListener('close-preview',dismiss);
 if(panel.showModal)panel.showModal();else{panel.setAttribute('open','');panel.setAttribute('role','dialog');}
 return {close:dismiss,show(file){
  if(closed)return;url=URL.createObjectURL(file);title.textContent=file.name||'Original document';body.replaceChildren();
  const open=document.createElement('a');open.href=url;open.target='_blank';open.rel='noopener noreferrer';open.textContent='Open file';
  const download=document.createElement('a');download.href=url;download.download=file.name||'document';download.textContent='Download';bar.append(open,download);
  if(file.type.startsWith('image/')){const img=document.createElement('img');img.src=url;img.alt=file.name||'Original document';Object.assign(img.style,{display:'block',width:'100%',height:'auto'});body.append(img);}
  else if(file.type==='application/pdf'){const frame=document.createElement('iframe');frame.title=file.name||'Original PDF';frame.src=url;Object.assign(frame.style,{border:'0',width:'100%',height:'100%',minHeight:'70vh'});body.append(frame);}
  else body.textContent='Your original is ready. Tap Open file or Download.';
 }};
}
