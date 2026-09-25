const pickupHeading = /^(?:initial\s+pickup|pick\s*up|load\s+at|ship\s+from|origin|shipper)(?:\s+(?:information|address|location))?(?:\s*:\s*|\s+|$)(.*)$/i;
const deliveryHeading = /^(?:stop\s*#?\s*1\s*\(delivery\)|first\s+delivery|delivery|deliver\s+to|ship\s+to|destination|consignee)(?:\s+(?:information|address|location))?(?:\s*:\s*|\s+|$)(.*)$/i;
const cityState = /\b([A-Z][A-Za-z.' -]{2,40},\s*[A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\b/i;

export function invalidRateRouteLocation(value = '') {
  const text = String(value || '').trim();
  return !text
    || /^(?:(?:pick\s*up|delivery)\s+)?(?:time|date|information|instructions?|appointment|reference|ref)(?:\s*[:#-]|\s*$)/i.test(text)
    || /\b(?:time of delivery|for payment of freight|freight charges|count and inspect|condition of (?:the )?load|carrier is responsible)\b/i.test(text);
}

// A time label or a sentence in the contract is not a stop heading.
function headingMatch(row, pattern) {
  const match = row.match(pattern);
  if (!match) return null;
  const value = match[1].trim();
  return value && invalidRateRouteLocation(value) ? null : match;
}

export function rateRouteLocation(text = '', role = 'pickup', existing = '') {
  if (!invalidRateRouteLocation(existing)) return existing;
  const rows = String(text || '').split(/\r?\n/).map(row => row.trim()).filter(Boolean);
  const heading = role === 'pickup' ? pickupHeading : deliveryHeading;
  for (let index = 0; index < rows.length; index += 1) {
    const match = headingMatch(rows[index], heading);
    if (!match) continue;
    const inline = match[1].match(cityState);
    if (inline) return inline[1].trim();
    for (let next = index + 1; next < Math.min(rows.length, index + 10); next += 1) {
      // Never borrow a city from the other stop's block.
      if (headingMatch(rows[next], pickupHeading) || headingMatch(rows[next], deliveryHeading)) break;
      const location = rows[next].replace(/^(?:address|city(?:\s*\/\s*state)?)\s*:\s*/i, '').match(cityState);
      if (location) return location[1].trim();
    }
  }
  return '';
}
