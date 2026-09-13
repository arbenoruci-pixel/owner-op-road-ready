import {processDocument} from './processDocumentV110330.js';
self.onmessage=async event=>{
  try {const value=await processDocument(event.data.file,event.data.source);self.postMessage({ok:true,value});}
  catch(error){self.postMessage({ok:false,error:error?.message||'The photo could not be processed.'});}
};
