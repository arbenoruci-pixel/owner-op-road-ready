import {receiptWordRows} from './maintenanceReceiptLayout.js';

// Sparse OCR places neighboring invoice cells in separate text blocks. Match
// printed values on the same physical baseline to their column headings.
const centerX = word => word.left + word.width / 2;
const label = word => word?.text.toLowerCase().replace(/[^a-z]/g, '') || '';
const printedMoney = /^\$?(?:\d+|\d{1,3}(?:,\d{3})+)\.\d{2}$/;
const printedQuantity = /^\d{1,6}(?:\.\d{1,3})?$/;
const moneyCents = text => Number(text.replace(/[$,.]/g, ''));

function itemColumns(row) {
  const headings = row.filter(word => word.confidence >= 65);
  const description = headings.find(word => label(word) === 'description')
    || headings.find(word => label(word) === 'item');
  const quantity = headings.find(word => /^(?:quantity|[qo][tr]y)$/.test(label(word)));
  const extended = headings.findLast(word => /^(?:amount|extension|extended|total)$/.test(label(word)));
  const prices = headings.filter(word => label(word) === 'price');
  if (!description || !quantity || !extended || !prices.length) return null;

  // Regular or list price may appear alongside the actual selling price.
  const salePrices = prices.filter(word => {
    const prefix = headings[headings.indexOf(word) - 1];
    return !/^(?:reg|regular|list)$/.test(label(prefix));
  });
  if (!salePrices.length) return null;

  const numeric = [...salePrices, quantity, extended].sort((a, b) => a.left - b.left);
  if (numeric[0].left < description.left) return null;
  const boundaries = numeric.map(heading => {
    const distances = numeric.filter(other => other !== heading)
      .map(other => Math.abs(centerX(other) - centerX(heading)));
    const radius = Math.min(...distances) / 2;
    return {heading, min: centerX(heading) - radius, max: centerX(heading) + radius};
  });
  const prior = headings.findLast(word => word.left < description.left && /^(?:number|part|code|sku|item)$/.test(label(word)));
  return {
    descStart: prior ? (centerX(prior) + centerX(description)) / 2 : -Infinity,
    descEnd: Math.min(...prices.map(word => word.left), quantity.left, extended.left),
    salePrices, quantity, extended, boundaries,
  };
}

function tableLine(columns, row, descriptionConfidence) {
  const values = new Map();
  for (const {heading, min, max} of columns.boundaries) {
    const format = heading === columns.quantity ? printedQuantity : printedMoney;
    const cells = row.filter(word => centerX(word) >= min && centerX(word) < max && format.test(word.text));
    if (cells.length !== 1 || cells[0].confidence < 80) return null;
    values.set(heading, cells[0].text);
  }
  const quantity = Number(values.get(columns.quantity));
  const amountCents = moneyCents(values.get(columns.extended));
  // An abbreviated regular-price header can be illegible. Its column is
  // harmless only when every plausible printed unit price is identical.
  const prices = columns.salePrices.map(heading => moneyCents(values.get(heading)));
  const unitPriceCents = prices[0];
  if (!prices.every(price => price === unitPriceCents)) return null;
  if (!quantity || !Number.isSafeInteger(amountCents) || !Number.isSafeInteger(unitPriceCents) ||
      Math.round(quantity * unitPriceCents) !== amountCents) return null;

  const description = row.filter(word => centerX(word) >= columns.descStart && centerX(word) < columns.descEnd &&
    /[a-z]/i.test(word.text) && !/^(?:ea|each|pcs?|hrs?)$/i.test(word.text));
  if (!description.length || description.some(word => word.confidence < descriptionConfidence)) return null;
  return {description: description.map(word => word.text).join(' '), quantity, unitPriceCents, amountCents};
}

function itemTable(observation, fallbackHeading = null) {
  const words = observation.words || observation.lines?.flatMap(line => line.words || []);
  const table = {items: [], heading: null, dataRows: [], reread: false};
  if (!words?.length || words.length > 4000) return table;
  let columns = fallbackHeading && itemColumns(fallbackHeading);
  for (const row of receiptWordRows({words: words.filter(word => word.confidence >= 55)})) {
    const heading = itemColumns(row);
    if (heading) {
      columns = fallbackHeading ? itemColumns(fallbackHeading) : heading;
      table.heading = row;
      continue;
    }
    if (!columns) continue;
    if (row.some(word => /^(?:subtotal|taxable|tendered|balance|total)$/.test(label(word)))) {
      columns = null;
      continue;
    }
    const item = tableLine(columns, row, fallbackHeading ? 70 : 75);
    const pricesPresent = row.filter(word => printedMoney.test(word.text)).length >= 2;
    if (item || pricesPresent) {
      table.dataRows.push(row);
      // Short trailing fragments are common where a table grid crosses a word.
      if (!item || /(?:^| )[A-Z]{1,2}$/i.test(item.description)) table.reread = true;
    }
    if (item) table.items.push(item);
  }
  return table;
}

// Coordinates refer to the full normalized page, regardless of OCR raster size.
export function maintenanceItemRegion(page) {
  const reads = [].concat(page.supplemental || [], page);
  for (const observation of reads) {
    const {width, height} = observation.imageSize || {};
    if (!width || !height || observation.region) continue;
    const {heading, dataRows, reread} = itemTable(observation);
    if (!reread || !heading || !dataRows.length || dataRows.length > 8) continue;
    const words = [...heading, ...dataRows.flat()];
    const padding = 2 * Math.max(...heading.map(word => word.height));
    const left = Math.max(0, Math.min(...words.map(word => word.left)) - padding) / width;
    const top = Math.max(0, Math.min(...words.map(word => word.top)) - padding) / height;
    const right = Math.min(width, Math.max(...words.map(word => word.left + word.width)) + padding) / width;
    const bottom = Math.min(height, Math.max(...words.map(word => word.top + word.height)) + padding) / height;
    if (bottom - top <= .32) return {left, top, width: right - left, height: bottom - top};
  }
  return null;
}

export function maintenanceTableItems(page) {
  const observations = [page, ...[].concat(page.supplemental || [])];
  const full = observations.filter(read => read.region !== 'items');
  const tables = full.map(read => itemTable(read));
  const readings = tables.map(table => table.items).filter(items => items.length);
  if (!readings.length) return [];
  const first = readings[0];
  if (!readings.every(lines => JSON.stringify(lines) === JSON.stringify(first))) return [];
  const regional = observations.find(read => read.region === 'items');
  if (!regional) return first;
  const source = full.findIndex((read, index) => tables[index].heading &&
    read.imageSize?.width === regional.imageSize?.width && read.imageSize?.height === regional.imageSize?.height);
  if (source < 0) return first;
  const retry = itemTable(regional, tables[source].heading).items;
  // Repair a clipped word only when both reads show the same purchases. Use
  // only letters actually recognized on the corresponding regional read.
  if (retry.length !== first.length) return first;
  if (retry.some((line, index) => line.quantity !== first[index].quantity ||
      line.unitPriceCents !== first[index].unitPriceCents || line.amountCents !== first[index].amountCents)) return [];
  return first.map((item, index) => {
    const second = retry[index];
    const compatible = second.description.toLowerCase().startsWith(item.description.toLowerCase()) &&
      /^\p{L}{1,12}$/u.test(second.description.slice(item.description.length));
    return compatible ? second : item;
  });
}

// A vertical table rule crossing small print can split the last word in a
// description. Interpolate only thin, near-continuous ruling in the OCR crop.
export function suppressItemGrid(image) {
  const {width, height, data} = image;
  if (width < 64 || height < 16 || width * height > 2200000) return;
  const ruled = new Uint8Array(width);
  for (let x = 0; x < width; x++) {
    let dark = 0;
    for (let offset = x * 4; offset < data.length; offset += width * 4) {
      if (data[offset + 1] < 157) dark++;
    }
    ruled[x] = dark > height * .60;
  }
  const margin = Math.max(1, Math.round(width * .0015));
  const maxRuleWidth = Math.max(2, Math.min(18, Math.round(width * .005)));
  for (let x = 1; x < width - 1; x++) {
    if (!ruled[x]) continue;
    let end = x + 1;
    while (end < width - 1 && ruled[end]) end++;
    const left = Math.max(0, x - margin);
    const right = Math.min(width - 1, end + margin);
    const span = end - x;
    x = end;
    if (span > maxRuleWidth) continue;
    for (let y = 0; y < height; y++) {
      const offset = y * width * 4;
      const before = data[offset + 4 * left + 1];
      const after = data[offset + 4 * right + 1];
      for (let column = left + 1; column < right; column++) {
        const pixel = offset + column * 4;
        const value = before + (after - before) * (column - left) / (right - left);
        data[pixel] = data[pixel + 1] = data[pixel + 2] = value;
      }
    }
  }
}
