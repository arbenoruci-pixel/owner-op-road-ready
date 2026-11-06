import {hasRateTitle} from './rateVocabulary.js';
import {isDocumentParty} from './fieldGuards.js';
import {partyKey} from './partyEvidence.js';

const strong=line=>line.confidence==null||line.confidence>=.8;
const approval=/\bDETENTION APPROVAL:\s*\**\s*([A-Z][A-Z0-9 &'().,-]{1,79}?)\s+MUST BE NOTIFIED OF APPROACHING DETENTION\b/id;
const contact=/\bMUST BE COMMUNICATED TO\s+([A-Z][A-Z0-9 &'().,-]{1,79}?)\.\s*CARRIER WILL MAKE NO DIRECT CONTACT\b/id;
const companyDomain=name=>name.replace(/,?\s+(?:LLC|INC\.?|LTD\.?|CORP\.?)$/i,'').toLowerCase().replace(/[^a-z0-9]/g,'');

// A domain alone never supplies a company name. These native terms explicitly
// name the party approving detention and coordinating the carrier, and direct
// POD payment to its matching corporate domain. Every supporting quote stays
// in the same observation; the engine's existing page-envelope checks decide
// whether this terms page belongs to the rate confirmation being filed.
export function nativeRateBrokerMatches(page,spec){
 if(spec.rateParty!=='broker')return [];
 const matches=[];
 for(const observation of page.observations){
  if(observation.source!=='pdf-text-layer')continue;
  const lines=observation.lines;
  const title=lines.slice(0,20).find(l=>hasRateTitle([l])&&strong(l));
  const terms=lines.find(l=>/^\s*TERMS AND CONDITIONS\s*$/i.test(l.text)&&strong(l));
  if(!title||!terms)continue;
  const approvals=lines.flatMap(line=>{const m=approval.exec(line.text);return m&&strong(line)&&isDocumentParty(m[1])?[{line,m}]:[];});
  const contacts=lines.flatMap((line,i)=>{
   const m=contact.exec(line.text);if(!m||!strong(line))return [];
   const tail=lines[i+1],body=line.text.slice(m.index)+ ' '+(tail?.text||'');
   if(!/CARRIER WILL MAKE NO DIRECT CONTACT\s+WITH SHIPPER\s*\/\s*RECEIVER\b/i.test(body)||tail&&!strong(tail))return [];
   return [{line,tail,m}];
  });
  // Conflicting named coordinators cannot be resolved by a convenient email.
  if(!approvals.length||!contacts.length||new Set([...approvals,...contacts].map(v=>partyKey(v.m[1]))).size!==1)continue;
  const owner=approvals[0],coordinator=contacts[0],name=owner.m[1],domain=companyDomain(name);
  if(domain.length<4)continue;
  const payment=lines.find(line=>strong(line)&&/\b(?:PODs?|invoice|billing)\b/i.test(line.text)&&/\bpayment\b/i.test(line.text)
   &&[...line.text.matchAll(/[A-Z0-9._%+-]+@([A-Z0-9.-]+)/gi)].some(m=>{
    const host=m[1].replace(/\.$/,'').toLowerCase().split('.');
    return host.length===2&&/^(?:com|net|org|us|ca)$/.test(host[1])&&host[0].replace(/-/g,'')===domain;
   }));
  if(!payment)continue;
  matches.push({observation,line:owner.line,start:owner.m.indices[1][0],end:owner.m.indices[1][1],
   labelLine:terms,extraLabelLines:[title,coordinator.line,...(coordinator.tail?[coordinator.tail]:[]),payment],supportMethod:'native_rate_broker_terms'});
 }
 return matches;
}
