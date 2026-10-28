import {load as loadScan} from '../test-scan-io-loader-v11037.mjs';
export function load(url,context,nextLoad){
 if(url.endsWith('.css'))return {format:'module',source:'export default {};',shortCircuit:true};
 return loadScan(url,context,nextLoad);
}
