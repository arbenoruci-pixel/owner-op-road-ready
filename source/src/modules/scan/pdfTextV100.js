function printable(value = '') {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodePdfLiteral(value = '') {
  return String(value || '').replace(/\\([0-7]{1,3}|n|r|t|b|f|\\|\(|\))/g, (_, token) => {
    if (/^[0-7]+$/.test(token)) return String.fromCharCode(parseInt(token, 8));
    return ({ n:'\n', r:'\r', t:'\t', b:'\b', f:'\f', '\\':'\\', '(':'(', ')':')' })[token] || token;
  });
}

function decodeHexString(value = '') {
  const compact = String(value || '').replace(/\s+/g, '');
  if (!compact || compact.length < 2) return '';
  const padded = compact.length % 2 ? `${compact}0` : compact;
  const bytes = [];
  for (let index = 0; index < padded.length; index += 2) {
    const byte = Number.parseInt(padded.slice(index, index + 2), 16);
    if (Number.isFinite(byte)) bytes.push(byte);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = '';
    for (let index = 2; index + 1 < bytes.length; index += 2) out += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
    return out;
  }
  return new TextDecoder('windows-1252').decode(new Uint8Array(bytes));
}

function extractTextOperators(source = '') {
  const text = String(source || '');
  const out = [];
  const literal = /\(((?:\\.|[^\\)])*)\)\s*Tj/g;
  const hex = /<([0-9A-Fa-f\s]+)>\s*Tj/g;
  const array = /\[((?:.|\n|\r)*?)\]\s*TJ/g;
  let match;

  while ((match = literal.exec(text))) out.push(decodePdfLiteral(match[1]));
  while ((match = hex.exec(text))) out.push(decodeHexString(match[1]));
  while ((match = array.exec(text))) {
    const body = match[1] || '';
    const parts = [];
    const token = /\(((?:\\.|[^\\)])*)\)|<([0-9A-Fa-f\s]+)>/g;
    let item;
    while ((item = token.exec(body))) parts.push(item[1] != null ? decodePdfLiteral(item[1]) : decodeHexString(item[2]));
    if (parts.length) out.push(parts.join(''));
  }

  return printable(out.join('\n'));
}

async function inflate(bytes, format = 'deflate') {
  if (typeof DecompressionStream !== 'function') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function streamText(bytes, latin, start, end) {
  const raw = bytes.slice(start, end);
  const prefix = latin.slice(Math.max(0, start - 420), start);
  let decoded = raw;
  if (/\/FlateDecode\b/.test(prefix)) {
    decoded = await inflate(raw, 'deflate') || await inflate(raw, 'deflate-raw') || raw;
  }
  const source = new TextDecoder('windows-1252').decode(decoded);
  return extractTextOperators(source);
}

function visiblePdfStrings(latin = '') {
  const labels = /(rate\s+confirmation|bill\s+of\s+lading|customer\s+p\.?\s*o\.?|mudflap|gallons|fuel|carrier\s+pay|pickup|delivery|settlement|invoice|total)/i;
  const out = [];
  const literal = /\(((?:\\.|[^\\)]){3,180})\)/g;
  let match;
  while ((match = literal.exec(latin))) {
    const value = printable(decodePdfLiteral(match[1]));
    if (labels.test(value) || /\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/.test(value) || /\$\s*\d/.test(value)) out.push(value);
    if (out.length >= 1200) break;
  }
  return printable(out.join('\n'));
}

export function isPdfFileV100(file) {
  return String(file?.type || '').toLowerCase() === 'application/pdf' || /\.pdf$/i.test(String(file?.name || ''));
}

export async function readPdfTextV100(file, options = {}) {
  if (!isPdfFileV100(file)) return null;
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const bridge = typeof window !== 'undefined' ? (window.RoadReadyNative || window.roadReadyNative) : null;
  if (bridge && typeof bridge.extractPdfText === 'function') {
    try {
      const native = await bridge.extractPdfText(file);
      const text = printable(native?.text || native || '');
      if (text) return { text, method:'native-pdf-text', pageCount:Number(native?.pageCount || 0) || undefined };
    } catch {}
  }

  onProgress(.08, 'Opening PDF…');
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > 35 * 1024 * 1024) throw new Error('PDF is larger than 35 MB. Use a smaller export or import the first pages as photos.');
  const bytes = new Uint8Array(buffer);
  const latin = new TextDecoder('windows-1252').decode(bytes);
  const pieces = [];
  const streamPattern = /stream\r?\n/g;
  let match;
  let index = 0;
  while ((match = streamPattern.exec(latin))) {
    const start = match.index + match[0].length;
    const end = latin.indexOf('endstream', start);
    if (end < 0) break;
    const value = await streamText(bytes, latin, start, end);
    if (value) pieces.push(value);
    streamPattern.lastIndex = end + 9;
    index += 1;
    onProgress(Math.min(.86, .12 + index * .025), `Reading PDF text layer ${index}…`);
    if (index >= 80) break;
  }
  const visible = visiblePdfStrings(latin);
  if (visible) pieces.push(visible);
  const text = printable([...new Set(pieces.filter(Boolean))].join('\n'));
  onProgress(.9, text ? 'PDF text extracted' : 'PDF imported for manual review');
  return { text, method:text ? 'pdf-text-v100' : 'pdf-import-no-text', pageCount:(latin.match(/\/Type\s*\/Page\b/g) || []).length || undefined };
}
