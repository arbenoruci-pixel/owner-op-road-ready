import {nativeFooterInput} from './native-footer-fixture.mjs';
export function brokerTermsInput(){
 const input=nativeFooterInput(),o=input.pages[1].observations[0];
 const text=[
  '**DETENTION APPROVAL:**EXAMPLE LOGISTICS MUST BE NOTIFIED OF APPROACHING DETENTION PRIOR TO',
  'THE TWO HOUR LIMIT. SIGNED BOL WITH IN/OUT TIMES MUST BE PROVIDED.',
  'ISSUES, ETC. MUST BE COMMUNICATED TO EXAMPLE LOGISTICS. CARRIER WILL MAKE NO DIRECT CONTACT',
  'WITH SHIPPER/RECEIVER OUTSIDE OF CHECKING IN.',
  'Actual carrier name must be listed on BOLs',
  'Please email afterhours@example-logistics.com for any issues.',
  'Upload POD upon delivery or email a copy to accounts@example-logistics.com for prompt payment.',
  'Drivers must check in as OTHER CARRIER at SAMPLE FACILITY.',
 ];
 o.lines.push(...text.map((text,i)=>({id:'terms-'+i,text,confidence:1,box:{x:.08,y:.25+i*.03,width:.84,height:.012}})));
 return input;
}
