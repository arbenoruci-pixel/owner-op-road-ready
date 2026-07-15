const US_STATES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']);

function clean(value = '') {
  return String(value || '')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function lines(value = '') {
  return String(value || '').split(/\r?\n/).map(clean).filter(Boolean);
}

function money(value = '') {
  const number = Number(String(value || '').replace(/[^0-9.-]/g, '').replace(/,/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function integer(value = '') {
  const number = Number(String(value || '').replace(/[^0-9]/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function unique(values = []) {
  return [...new Set(values.map(value => clean(value)).filter(Boolean))];
}

function normalizeDate(value = '') {
  const match = String(value || '').match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
  if (!match) return '';
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${String(match[1]).padStart(2, '0')}/${String(match[2]).padStart(2, '0')}/${year}`;
}

function normalizeTime(value = '') {
  const match = String(value || '').match(/\b(\d{1,2}):(\d{2})(?:\s*([AP]M))?\b/i);
  if (!match) return '';
  return `${String(match[1]).padStart(2, '0')}:${match[2]}${match[3] ? ` ${match[3].toUpperCase()}` : ''}`;
}

function first(text = '', patterns = []) {
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return '';
}

function cityStateZip(value = '') {
  const source = clean(value);
  const match = source.match(/\b([A-Za-z][A-Za-z .'-]{1,45}),?\s+([A-Z]{2})\s*(\d{5}(?:-\d{4})?)\b/i);
  if (!match) return null;
  const state = match[2].toUpperCase();
  if (!US_STATES.has(state)) return null;
  let city = clean(match[1]);
  // When a whole address was placed on one text line, keep the words after the
  // street suffix as the city name.
  const street = city.match(/\b(?:Road|Rd\.?|Avenue|Ave\.?|Street|St\.?|Drive|Dr\.?|Lane|Ln\.?|Boulevard|Blvd\.?|Highway|Hwy\.?|Parkway|Pkwy\.?|Court|Ct\.?|Circle|Cir\.?|Way|Route|Rte\.?)\s+(.+)$/i);
  if (street?.[1]) city = clean(street[1]);
  city = city.replace(/^(?:I|l|1)\s+(?=[A-Z])/i, '');
  return { city, state, zip:match[3], cityState:`${city}, ${state}` };
}

function sectionMarker(line = '') {
  const value = clean(line);
  if (/^Load\s+At(?:\s+Pieces\s+Weight)?$/i.test(value)) return 'pickup';
  if (/^Deliver\s+To(?:\s+Pieces\s+Weight)?$/i.test(value)) return 'delivery';
  return '';
}

function stopCompany(sectionLines = []) {
  for (const source of sectionLines) {
    let line = clean(source)
      .replace(/\s+Earliest\s+date\s*:.*$/i, '')
      .replace(/\s+Latest\s+date\s*:.*$/i, '')
      .replace(/\s+[\d,]+\s+CA\s+[\d,]+\s+LBS.*$/i, '')
      .trim();
    if (!line) continue;
    if (/^(?:Pieces|Weight|Contact|Phone|Instructions|Directions|Pickup|PO Number|Commodity|Temp|Carrier|Reference|Stop Information|Earliest|Latest)/i.test(line)) continue;
    if (/^\d{1,6}\s+/.test(line)) continue;
    if (cityStateZip(line)) continue;
    if ((line.match(/[A-Za-z]{2,}/g) || []).length >= 1) return line;
  }
  return '';
}

function stopStreet(sectionLines = [], cityLineIndex = -1) {
  const streetPattern = /^\d{1,6}\s+[A-Za-z0-9][A-Za-z0-9 .#'&/-]{2,80}$/;
  if (cityLineIndex > 0) {
    const previous = clean(sectionLines[cityLineIndex - 1]);
    if (streetPattern.test(previous)) return previous;
  }
  return clean(sectionLines.find(line => streetPattern.test(clean(line))) || '');
}

function parseStop(type = 'delivery', sectionLines = []) {
  const joined = sectionLines.join('\n');
  let location = null;
  let cityLineIndex = -1;
  sectionLines.some((line, index) => {
    const parsed = cityStateZip(line);
    if (!parsed) return false;
    location = parsed;
    cityLineIndex = index;
    return true;
  });
  if (!location) location = cityStateZip(joined);

  const dateTimes = [...joined.matchAll(/(?:Earliest|Latest)\s+date\s*:\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})(?:\s+(\d{1,2}:\d{2}))?/gi)];
  const earliest = dateTimes[0] || null;
  const latest = dateTimes[1] || null;
  const quantities = joined.match(/([\d,]+)\s+CA\s+([\d,]+)\s+LBS/i);
  const pickupNumber = first(joined, [/Pickup\s*#\s*:\s*([A-Z0-9-]{4,30})/i]);
  const poNumber = first(joined, [/PO\s+Number\s*:\s*([A-Z0-9-]{2,30})/i]);
  const commodity = first(joined, [/Commodity\s*:\s*([^\n]{2,100})/i]);
  const phone = first(joined, [/Phone\s*:\s*([0-9() .-]{7,24})/i]);
  const company = stopCompany(sectionLines);
  const street = stopStreet(sectionLines, cityLineIndex);
  const date = normalizeDate(earliest?.[1] || '');
  const time = normalizeTime(earliest?.[2] || '');
  const latestDate = normalizeDate(latest?.[1] || '');
  const latestTime = normalizeTime(latest?.[2] || '');

  return {
    type,
    company,
    street,
    city:location?.city || '',
    state:location?.state || '',
    zip:location?.zip || '',
    cityState:location?.cityState || '',
    address:[street, location ? `${location.city}, ${location.state} ${location.zip}` : ''].filter(Boolean).join(', '),
    date,
    time,
    latestDate,
    latestTime,
    appointment:[date, time].filter(Boolean).join(' '),
    pieces:quantities ? integer(quantities[1]) : 0,
    weight:quantities ? integer(quantities[2]) : 0,
    pickupNumber,
    poNumber,
    commodity,
    phone,
  };
}

export function parseRateConfirmationStopsV102(text = '') {
  const sourceLines = lines(text);
  const stops = [];
  for (let index = 0; index < sourceLines.length; index += 1) {
    const type = sectionMarker(sourceLines[index]);
    if (!type) continue;
    const block = [];
    for (let cursor = index + 1; cursor < sourceLines.length; cursor += 1) {
      if (sectionMarker(sourceLines[cursor])) break;
      if (/^(?:Remarks|Order Remarks|Carrier agrees|Pay Information|Confirmation of Contract|CONTINUOUS SEAL RECORD|TRAILER INCIDENT REPORT)$/i.test(sourceLines[cursor])) break;
      if (/^\[\[PAGE:\d+\]\]$/i.test(sourceLines[cursor])) continue;
      if (/^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M\s+\d+\s+of\s+\d+$/i.test(sourceLines[cursor])) continue;
      if (/^H\s*&\s*N\s+Logistics,\s*LLC\b/i.test(sourceLines[cursor]) && block.length) break;
      block.push(sourceLines[cursor]);
    }
    const stop = parseStop(type, block);
    if (stop.company || stop.cityState || stop.appointment) stops.push(stop);
  }

  const seen = new Set();
  return stops.filter(stop => {
    const key = `${stop.type}|${stop.company}|${stop.cityState}|${stop.appointment}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function brokerName(text = '') {
  return first(text, [
    /(?:^|\n)\s*(H\s*&\s*N\s+Logistics,\s*LLC)\b/i,
    /(?:broker|brokerage|customer)\s*[:#-]\s*([^\n]{3,80})/i,
    /(?:^|\n)\s*([A-Z][A-Za-z0-9 &'.-]{2,70}(?:Logistics|Transport|Transportation|Freight|Brokerage)(?:,?\s*(?:LLC|Inc\.?|Corp\.?))?)/m,
  ]);
}

function routeSummary(stops = []) {
  return stops.map((stop, index) => {
    const role = stop.type === 'pickup' ? 'PU' : `D${stops.slice(0, index + 1).filter(item => item.type === 'delivery').length}`;
    return `${role} ${stop.appointment || ''} - ${stop.company || stop.cityState}${stop.cityState && stop.company ? `, ${stop.cityState}` : ''}`.replace(/\s+/g, ' ').trim();
  }).join('\n');
}

export function parseRateConfirmationV102(text = '', baseFields = {}) {
  const source = String(text || '');
  const stops = parseRateConfirmationStopsV102(source);
  const pickup = stops.find(stop => stop.type === 'pickup') || null;
  const deliveries = stops.filter(stop => stop.type === 'delivery');
  const firstDelivery = deliveries[0] || null;
  const finalDelivery = deliveries.at(-1) || firstDelivery;
  const orderNo = first(source, [
    /\bOrder\s*(?:Number|No\.?|#)\s*[:#-]?\s*([A-Z0-9-]{3,30})/i,
    /\bLoad\s*(?:Number|No\.?|#)\s*[:#-]?\s*([A-Z0-9-]{3,30})/i,
    /\bBroker(?:'s)?\s+reference\s+number\s*([A-Z0-9-]{3,30})/i,
  ]).toUpperCase();
  const legNo = first(source, [/\bLeg\s*(?:Number|No\.?|#)\s*[:#-]?\s*([A-Z0-9-]{3,30})/i]).toUpperCase();
  const total = money(first(source, [
    /Total\s+Pay\s*(?:\(US\$\))?\s*:\s*\$?\s*([\d,]+(?:\.\d{2})?)/i,
    /Total\s+Carrier\s+Pay\s*[:#-]?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i,
    /All[- ]?in\s+rate\s*[:#-]?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i,
  ]));
  const linehaul = money(first(source, [
    /Load\s+Broker\s+Line\s+Haul[^\n$]{0,80}\$\s*([\d,]+(?:\.\d{2})?)/i,
    /Line\s*haul\s*[:#-]?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i,
  ])) || total;
  const fuelSurcharge = money(first(source, [/Fuel\s+Surcharge\s*[:#-]?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i, /\bFSC\s*[:#-]?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i]));
  const carrierName = first(source, [/Carrier\s*:\s*([^\n]{3,80})/i]);
  const mcNumber = first(source, [/MC\s+Number\s*:\s*(MC\s*\d{4,12})/i]).replace(/\s+/g, '');
  const equipment = first(source, [/(?:Trailer\s+Type|Equipment)\s*:\s*([^\n]{2,60})/i]);
  const broker = brokerName(source);
  const brokerPhone = first(source, [/(?:Agent[\s\S]{0,160}?)Phone\s*:\s*([0-9() .-]{7,24})/i]);
  const brokerEmail = first(source, [/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i]);
  const documentDate = normalizeDate(first(source, [/(?:^|\n)\s*(\d{1,2}\/\d{1,2}\/\d{4})\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M/i, /(?:confirmation\s+date|date)\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i]));
  const pickupNumbers = unique(stops.map(stop => stop.pickupNumber));
  const poNumbers = unique(stops.map(stop => stop.poNumber));
  const commodities = unique(stops.map(stop => stop.commodity));
  const totalPieces = pickup?.pieces || integer(first(source, [/Remarks\s+([\d,]+)\s+CA\s+[\d,]+\s+LBS/i]));
  const weight = pickup?.weight || integer(first(source, [/Remarks\s+[\d,]+\s+CA\s+([\d,]+)\s+LBS/i]));
  const pickupDate = pickup?.date || documentDate;
  const deliveryDate = finalDelivery?.date || firstDelivery?.date || '';
  const origin = pickup?.cityState || '';
  const destination = finalDelivery?.cityState || firstDelivery?.cityState || '';
  const nextStop = firstDelivery?.cityState || '';
  const trackingProvider = /\bFourKites\b/i.test(source) ? 'FourKites' : (/\bMacroPoint\b/i.test(source) ? 'MacroPoint' : '');
  const evidenceItems = [orderNo, total, broker, pickup, deliveries.length, pickupDate, deliveryDate, equipment];
  const evidence = evidenceItems.filter(Boolean).length / evidenceItems.length;

  return {
    ...baseFields,
    date:documentDate || pickupDate,
    loadNo:orderNo || legNo,
    orderNo,
    legNo,
    broker,
    brokerPhone,
    brokerEmail,
    carrierName,
    mcNumber,
    origin,
    destination,
    nextStop,
    pickupDate,
    deliveryDate,
    firstDeliveryDate:firstDelivery?.date || '',
    total,
    grossPay:total,
    linehaul,
    fuelSurcharge,
    equipment,
    pickupNumber:pickupNumbers[0] || '',
    pickupNumbers,
    poNumber:poNumbers[0] || '',
    poNumbers,
    commodity:commodities.join(' · '),
    totalPieces,
    weight,
    stops,
    stopCount:stops.length,
    deliveryCount:deliveries.length,
    routeSummary:routeSummary(stops),
    trackingProvider,
    documentEvidence:evidence,
    needsFieldReview:evidence < .75 || !orderNo || !total || !pickup || !deliveries.length,
  };
}
