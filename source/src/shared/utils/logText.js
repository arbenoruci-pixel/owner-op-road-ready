const GENERIC_EQUIPMENT_LABEL_RE = /^(new|old|no|none|n\/?a)\s*(trailer|equipment|container|chassis)?$/i;
const GENERIC_EQUIPMENT_ACTION_RE = /^(dropped|hooked)\s+(new|old|no|none|n\/?a)\s*(trailer|equipment|container|chassis)?$/i;

function cleanPart(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function isPlaceholderEquipmentLabel(value = '') {
  return GENERIC_EQUIPMENT_LABEL_RE.test(cleanPart(value));
}

export function cleanEquipmentLabel(value = '') {
  const text = cleanPart(value);
  if (!text || isPlaceholderEquipmentLabel(text)) return '';
  return text;
}

function splitLogParts(value = '') {
  return cleanPart(value)
    .split(/\s+[·•|]\s+|\s*\n\s*/g)
    .map(part => cleanPart(part))
    .filter(Boolean);
}

function normalizeActionPart(part = '') {
  const text = cleanPart(part);
  if (!text) return '';
  if (GENERIC_EQUIPMENT_ACTION_RE.test(text)) return '';
  if (GENERIC_EQUIPMENT_LABEL_RE.test(text)) return '';
  return text
    .replace(/\bdropped\s+(new|old|no|none|n\/?a)\s*(trailer|equipment|container|chassis)?\b/ig, '')
    .replace(/\bhooked\s+(new|old|no|none|n\/?a)\s*(trailer|equipment|container|chassis)?\b/ig, '')
    .replace(/\b(new|old|no|none|n\/?a)\s+(trailer|equipment|container|chassis)\b/ig, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeLogText(value = '') {
  const rawParts = splitLogParts(value);
  if (!rawParts.length) return '';
  const hadDropHook = rawParts.some(part => /^drop\s*&\s*hook$/i.test(part) || /drop\s*&\s*hook/i.test(part));
  const hadGenericEquipmentAction = rawParts.some(part => GENERIC_EQUIPMENT_ACTION_RE.test(part));
  const parts = [];
  for (const rawPart of rawParts) {
    const part = normalizeActionPart(rawPart);
    if (!part) continue;
    if (!parts.some(existing => existing.toLowerCase() === part.toLowerCase())) parts.push(part);
  }
  const hasRealEquipmentAction = parts.some(part => /^(dropped|hooked)\s+/i.test(part));
  if (hadDropHook && hadGenericEquipmentAction && !hasRealEquipmentAction && !parts.some(part => /^equipment changed$/i.test(part))) {
    const insertAt = parts.findIndex(part => /drop\s*&\s*hook/i.test(part));
    if (insertAt >= 0) parts.splice(insertAt + 1, 0, 'equipment changed');
    else parts.unshift('equipment changed');
  }
  return parts.join(' · ');
}

export function combineLogText(...values) {
  const out = [];
  for (const value of values) {
    for (const part of splitLogParts(sanitizeLogText(value))) {
      if (!out.some(existing => existing.toLowerCase() === part.toLowerCase())) out.push(part);
    }
  }
  return out.join(' · ');
}
