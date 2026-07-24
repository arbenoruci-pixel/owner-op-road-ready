export const RATE_CON_RISK_REVIEW_VERSION = '109.7.0';

function text(value=''){ return String(value ?? '').replace(/\s+/g,' ').trim(); }
function moneyFrom(match){ const n=Number(String(match || '').replace(/[^0-9.]/g,'')); return Number.isFinite(n)?n:0; }
function item(id,severity,title,detail,amount=0){ return { id,severity,title,detail,amount }; }

export function analyzeRateConRiskV10970(input={}) {
  const source = text(input.text || input.rawText || input.fields?.rawText || '');
  const lower = source.toLowerCase();
  if (!source) return { version:RATE_CON_RISK_REVIEW_VERSION, scanned:false, blocking:true, items:[item('no-text','critical','Full-document review unavailable','Road Ready could not verify text from every page. Review the original before booking.')] };
  const items=[];
  const hasPre=/pre[ -]?trip\s+(?:inspection|inspection form)|complete\s+a\s+pre[ -]?trip/i.test(source);
  const hasPost=/post[ -]?trip\s+(?:inspection|inspection form)|complete\s+(?:a\s+)?post[ -]?trip/i.test(source);
  const inspectionPenalty=source.match(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)\s+(?:administrative\s+)?charge\s+for\s+each\s+missing\s+inspection/i);
  const directDeduction=/administrative\s+charges?.{0,80}(?:deducted|deduction).{0,80}(?:rate\s+confirmation|carrier\s+pay|payment)/i.test(source) || /can\s+and\s+will\s+be\s+deducted\s+from\s+this\s+rate\s+confirmation/i.test(source);
  const holdForApproval=/remain\s+on\s+site.{0,120}(?:approval|confirms?\s+approval)\s+to\s+depart|do\s+not\s+depart.{0,120}(?:approval|authorization)/i.test(source);
  const fourKites=/fourkites/i.test(source);
  const dhlApp=/dhl\s+mobile\s+(?:fleet\s+)?app/i.test(source);
  const tracking=/tracking.{0,80}(?:required|active|uninterrupted)|(?:required|active|uninterrupted).{0,80}tracking/i.test(source);
  const urlMatches=source.match(/https?:\/\/[^\s)\]}]+|www\.[^\s)\]}]+/gi) || [];
  const inspectionLink=urlMatches.find(url=>/inspect|form|survey|jotform|google|typeform|safety/i.test(url)) || '';
  const quickPay=source.match(/quick\s*pay.{0,100}?(\d+(?:\.\d+)?)\s*%/i);
  const genericPenalty=/penalt|chargeback|administrative\s+charge|rate\s+adjustment|deduct|offset|forfeiture/i.test(lower);

  if(hasPre) items.push(item('pretrip','critical','Pre-trip inspection required','Complete the pickup inspection before departure.'));
  if(hasPost) items.push(item('posttrip','critical','Post-trip inspection required','Complete the delivery inspection before leaving the final delivery.'));
  if(inspectionPenalty){ const amount=moneyFrom(inspectionPenalty[1]); items.push(item('inspection-penalty','critical',`$${amount.toFixed(0)} deduction per missing inspection`,`Missing both inspections could cost $${(amount*2).toFixed(0)}.`,amount)); }
  if(directDeduction) items.push(item('direct-deduction','critical','Charges may be deducted from carrier pay','The agreement permits administrative charges to be taken directly from the rate confirmation.'));
  if((hasPre||hasPost) && !inspectionLink) items.push(item('missing-inspection-link','critical','Inspection link is missing from the PDF','Obtain and test the broker’s working inspection link before pickup.'));
  if(holdForApproval) items.push(item('departure-approval','critical','Do not depart without broker approval','Remain on site until Red Lightning confirms approval to leave.'));
  if(dhlApp) items.push(item('dhl-app','warning','DHL Mobile Fleet App required','Install and activate it before arrival.'));
  if(fourKites) items.push(item('fourkites','warning','FourKites tracking required','Tracking must remain active throughout the load.'));
  if(tracking && !fourKites && !dhlApp) items.push(item('tracking','warning','Load tracking required','Confirm the required tracking platform and keep it active.'));
  if(quickPay) items.push(item('quick-pay','warning',`Quick-pay fee: ${quickPay[1]}%`,'Confirm whether the fee applies before accepting payment terms.'));
  if(genericPenalty && !items.some(x=>x.id==='direct-deduction')) items.push(item('other-financial-risk','warning','Additional penalty or chargeback language found','Open the full clauses and confirm every possible deduction before booking.'));

  const critical=items.filter(x=>x.severity==='critical');
  return {
    version:RATE_CON_RISK_REVIEW_VERSION,
    scanned:true,
    pageCoverage:'all-extracted-pages',
    blocking:critical.length>0,
    items,
    critical,
    warningText: critical.length ? 'WARNING: This rate confirmation contains inspection, departure, tracking, or payment-deduction obligations that must be acknowledged before booking.' : '',
    inspectionLinkPresent:Boolean(inspectionLink),
    inspectionLink,
  };
}
