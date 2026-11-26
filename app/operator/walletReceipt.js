// This output is rendered as a React text node. Never interpret a receipt as DOM or load remote resources.
export function emailReceiptText({ content_type, content }) {
  if (content_type.toLowerCase() !== 'html') return content;
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return content
    .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\s*(?:br\b[^>]*|\/(?:p|div|tr|h[1-6]|li|table))\s*\/?>/gi, '\n')
    .replace(/<\/t[dh]\s*>/gi, '  ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi, (literal, key) => {
      key = key.toLowerCase();
      if (key[0] !== '#') return entities[key];
      const value = key.startsWith('#x') ? parseInt(key.slice(2), 16) : Number(key.slice(1));
      return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : literal;
    })
    .replace(/\n[\t ]*\n(?:[\t ]*\n)+/g, '\n\n').trim();
}
