export function wordLayoutFixture(){
  const words=[],lines=[];
  function row(parts,y){
    const line=lines.length+1,group=[];
    for(const [text,left] of parts)group.push({text,left,top:y,width:text.length*6,height:12,confidence:96,page:1,block:1,paragraph:1,line,word:group.length+1});
    const left=Math.min(...group.map(w=>w.left)),right=Math.max(...group.map(w=>w.left+w.width));
    lines.push({text:group.map(w=>w.text).join(' '),left,top:y,width:right-left,height:12,confidence:96});words.push(...group);
  }
  row([['BILL',50],['OF',80],['LADING',98],['-',140],['NOT',152],['NEGOTIABLE',176]],50);
  row([['SHIP',150],['FROM',180],['Bill',570],['of',600],['Lading',618],['Number:',660],['B-17',708]],100);
  row([['Example',50],['Foods',98],['Inc.',134],['Customer',570],['P.O.',624],['Number:',654],['ORDER-77',702]],125);
  row([['SHIP',150],['TO',180]],180);
  row([['Example',50],['Market',98]],200);
  row([['CARRIER:',50],['Example',200],['Logistics',248],['SALES',620],['ORDER:',656],['SO-55',698]],280);
  return {id:'word-layout',page:1,text:lines.map(l=>l.text).join('\n'),confidence:.96,words,lines,imageSize:{width:1000,height:1000}};
}
