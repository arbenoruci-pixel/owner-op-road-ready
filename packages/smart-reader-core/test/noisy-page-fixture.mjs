import {mixedPacketInput} from './mixed-packet-fixture.mjs';
export function noisyPageInput(){
  const input=mixedPacketInput();
  const first=input.pages[0].observations[0].lines;
  const title=first.find(l=>l.text.startsWith('BILL OF LADING'));
  title.text='Xq '+title.text;title.confidence=.62;
  const shipping=input.pages[1],original=shipping.observations[0];
  const terms=original.lines.find(l=>l.text.startsWith('This Bill of Lading'));
  original.lines=original.lines.filter(l=>l!==terms);
  const retry=structuredClone(original);retry.id='clean';
  retry.lines=retry.lines.filter(l=>!l.text.startsWith('TOTAL NET WEIGHT'));
  retry.lines.push({...terms,text:'The original bill of lading must accompany this shipment.'});
  shipping.observations.push(retry);
  const receipt=input.pages[2].observations[0].lines;
  receipt.find(l=>l.text==='LOAD DETAILS').text="' LOAD DETAILS";
  receipt.find(l=>l.text==='RELAY PAYMENT DETAILS').text='| RELAY PAYMENT DETAILS';
  return input;
}
