const text=value=>String(value||'').trim();
export function freezeFilingContext(input){
  const kind=text(input?.kind||input?.type),loadNo=text(input?.loadNo);
  if(!kind||kind==='auto'||!loadNo)return null;
  const stopSequence=Number(input.stopSequence||0);
  return Object.freeze({kind,loadNo,stopSequence:Number.isInteger(stopSequence)&&stopSequence>=0?stopSequence:0,
    guideId:text(input.guideId),requestedWeek:text(input.week||input.date),assignment:'driver_requested_context'});
}
export function retainFilingChoice(context,key,proposed){
  if(!context)return proposed;
  if(key==='type')return context.kind;
  if(key==='loadNo')return context.loadNo;
  if(key==='stopSequence')return context.stopSequence;
  if(key==='assignment')return context.assignment;
  if(key==='linkToLogbook')return false;
  return proposed;
}
export function assertFilingContext(context,{type,loadNo,stopSequence=0,linkToLogbook=false}){
  if(context&&(context.kind!==type||context.loadNo!==loadNo||context.stopSequence!==Number(stopSequence)||linkToLogbook))throw Error('The requested document folder changed. Reopen Add from that load.');
}
export function filingContextMessage(context,analysis){
  if(!context)return '';
  const expected=context.kind.toUpperCase().replaceAll('_',' '),source=analysis?.fields?.readerSourceFieldsV110393?.fields?.loadNo?.value;
  const type=analysis?.type?.id;
  return 'Add '+expected+' to Load '+context.loadNo+'. '+(source&&source.toUpperCase()!==context.loadNo.toUpperCase()
    ?'The source shows a different load reference ('+source+'). Check the original before saving here.'
    :type&&type!==context.kind?'The Reader suggests another document type. Check the original before saving it in this requested category.'
    :'This document will stay in the category and load you selected.');
}
