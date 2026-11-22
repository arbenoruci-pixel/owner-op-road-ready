export async function load(url,context,nextLoad) {
  if(url.endsWith('/documentActionsV110415.js'))return {format:'module',shortCircuit:true,source:`export async function openSource(doc){globalThis.openedFile=doc;} export async function sourceFile(){return new Blob(['fixture']);} export async function prepareLoadFiles(){return [new File(['fixture'],'fixture.pdf')];}`};
  if(/\/(ManualDocument|ManualLoadForm)\.jsx$/.test(url))return {format:'module',shortCircuit:true,source:'export default function Form(){return null;}'};
  return nextLoad(url,context);
}
