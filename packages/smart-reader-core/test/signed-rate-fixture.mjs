import {routeTableInput} from './rate-vocabulary-fixture.mjs';
import {textObservation} from '../src/index.js';

// Synthetic signature text only: this fixture is not a cryptographic signature.
export const sertifiStamp='E-Signed : 10/08/2026 03:55 PM CDT\nSertifi Electronic Signature\nDoc ID: 20261008111222333';
export function signedRateInput({heading='Rate Agreement',signed=true,split=false,certificate=true}={}){
 const input=routeTableInput();input.documentId='synthetic-signed-rate';
 for(const page of input.pages){
  page.observations[0].lines.find(l=>l.text==='Rate Confirmation').text=heading;
  if(signed){
   const stamp=textObservation(sertifiStamp,{id:'signature-crop',source:'pdf-text-layer'});
   stamp.sourceImageId='synthetic-'+page.id;
   stamp.lines.forEach((l,i)=>{l.id='stamp-'+i;l.confidence=1;l.box={x:.08,y:(page.number===1?.07:.12)+i*.025,width:.40,height:.014};});
   if(split)page.observations.push(stamp);else page.observations[0].lines.push(...stamp.lines);
  }
 }
 if(certificate)input.pages.push({id:'page-3',number:3,observations:[textObservation(heading+'\n'+sertifiStamp+'\nSample Signer\nsigner@example.test\nIP: 192.0.2.1',{id:'certificate',source:'pdf-text-layer'})]});
 return input;
}
