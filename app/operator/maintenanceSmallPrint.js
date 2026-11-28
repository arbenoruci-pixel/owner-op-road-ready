// Read a narrow band of small print at character scale. The saved photo keeps
// its original pixels. Map words back into page coordinates for table parsing.
export async function readSmallPrintRegion(file, area, recognize, {
  signal, aspect = .85, pageSegMode = '11', charWhitelist = '', removeRules = false,
} = {}) {
  signal?.throwIfAborted();
  const image = new Image(), url = URL.createObjectURL(file);
  const canvas = document.createElement('canvas');
  try {
    image.src = url;
    await image.decode();
    const imageSize = {width:image.naturalWidth, height:image.naturalHeight};
    const x = Math.max(0, Math.floor(area.left * imageSize.width));
    const y = Math.max(0, Math.floor(area.top * imageSize.height));
    const w = Math.min(imageSize.width - x, Math.ceil(area.width * imageSize.width));
    const h = Math.min(imageSize.height - y, Math.ceil(area.height * imageSize.height));
    if (w < 3 || h < 3) return null;
    const scale = Math.min(charWhitelist ? 6 : 5, 4000/w, Math.sqrt(2400000/(w*h*aspect)));
    const rw = Math.round(w*scale), rh = Math.round(h*scale*aspect);
    const marginX = 18, marginY = 10;
    canvas.width = rw + 2*marginX;
    canvas.height = rh + 2*marginY;
    const ctx = canvas.getContext('2d', {alpha:false, willReadFrequently:true});
    ctx.fillStyle = 'white';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, x,y,w,h, marginX,marginY,rw,rh);
    const pixels = ctx.getImageData(0,0,canvas.width,canvas.height);
    const original = new Uint8ClampedArray(pixels.data);
    const stride = canvas.width * 4, radius = 3;
    for (let row=radius; row<canvas.height-radius; row++) {
      for (let col=radius; col<canvas.width-radius; col++) {
        const i = row*stride + col*4, value = original[i];
        const surround = (original[i-4*radius] + original[i+4*radius] +
          original[i-stride*radius] + original[i+stride*radius])/4;
        pixels.data[i] = pixels.data[i+1] = pixels.data[i+2] = value + 3*(value-surround);
      }
    }
    if (removeRules) {
      // The bottom grid rule on a service ledger sometimes touches the word
      // 'Tax'. Remove long, connected horizontal strokes in this cell only.
      for (let row=0; row<canvas.height; row++) {
        const offset = row*stride;
        for (let col=0; col<canvas.width; col++) {
          if (pixels.data[offset+col*4] >= 145) continue;
          const start = col;
          while (col<canvas.width && pixels.data[offset+col*4] <145) col++;
          if (col-start < Math.max(28,rw*.12)) continue;
          pixels.data.fill(255,offset+4*start,offset+4*col);
        }
      }
    }
    ctx.putImageData(pixels,0,0);
    const input = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    signal?.throwIfAborted();
    if (!input) return null;
    const read = await recognize(input, {signal,returnLayout:true,pageSegMode,charWhitelist});
    if (!read?.words?.length) return null;
    const reposition = word => {
      const left = x + (word.left-marginX)*w/rw, top = y + (word.top-marginY)*h/rh;
      const width = word.width*w/rw, height = word.height*h/rh;
      return {...word,left,top,width,height,right:left+width,bottom:top+height};
    };
    return {...read,region:'small-print',imageSize,words:read.words.map(reposition),lines:read.lines.map(reposition)};
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 1;
  }
}

const totalWord = word => /^total[dp]?[.:$§►▸]*$/i.test(word.text);
const moneyWord = word => /^\$?(?:\d+|\d{1,3}(?:,\d{3})+)\.\d{2}$/.test(word.text);
const centerY = word => word.top + word.height/2;

// A ledger may also have "Total" for parts or labor. Start only at a final
// total caption beside a currency sign, with another summary label nearby.
function footerAnchor(page) {
  for (const read of page.supplemental || []) {
    const words = read.words || [], size = read.imageSize;
    if (!size || read.region) continue;
    for (const word of words.filter(totalWord)) {
      const neighbors = words.filter(next => next.left > word.left &&
        Math.abs(centerY(next)-centerY(word)) < word.height*.85);
      if (!neighbors.some(next => next.left < word.right + word.height*3 && /[$§►▸>]/.test(next.text))) continue;
      const summary = words.filter(next=>Math.abs(next.top-word.top)<7*word.height);
      if (!summary.some(next => /^(?:change|tendered|returned)\b/i.test(next.text)) &&
          !(summary.some(next=>/^tax\W*$/i.test(next.text)) && summary.some(next=>/^(?:parts|labor|discount|taxable)\W*$/i.test(next.text)))) continue;
      return {x:word.left/size.width, y:centerY(word)/size.height, height:word.height/size.height};
    }
  }
  return null;
}

function totalPair(read, anchor) {
  if (!read) return null;
  const {width,height} = read.imageSize;
  const label = read.words.find(word => totalWord(word) &&
    Math.abs(word.left/width-anchor.x)<.025 && Math.abs(centerY(word)/height-anchor.y)<anchor.height);
  if (!label) return null;
  const values = read.words.filter(word => moneyWord(word) && word.left>label.right &&
    word.left-label.right<width*.35 && Math.abs(centerY(word)-centerY(label))<Math.max(label.height*.8,word.height*.9));
  if (values.length!==1) return null;
  return {label, value:values[0]};
}

export async function readSmallPrintTotal(file,page,recognize,options) {
  const anchor = footerAnchor(page);
  if (!anchor || anchor.height*(page.imageSize?.height || 0) > 16) return;
  const top = Math.max(0,anchor.y-anchor.height*6.5);
  const area = {left:0,top,width:1,height:Math.min(1-top,anchor.height*10.5)};
  const readings = [];
  for (const [aspect,pageSegMode] of [[.65,'11'],[.85,'6']]) {
    const read = await readSmallPrintRegion(file,area,recognize,{...options,aspect,pageSegMode});
    const pair = totalPair(read,anchor);
    if (pair) readings.push({...pair, read});
  }
  if (!readings.length) return;
  const {value,label,read} = readings[0];
  const {width,height} = read.imageSize;
  const marginX = Math.max(3,value.height*.85), marginY = Math.max(2,value.height*.7);
  const amountCell = {left:(value.left-marginX)/width,top:(value.top-marginY)/height,
    width:(value.width+marginX*2)/width,height:(value.height+marginY*2)/height};
  const digitRead = await readSmallPrintRegion(file,amountCell,recognize,{...options,aspect:.75,pageSegMode:'7',charWhitelist:'0123456789.'});
  const digits = digitRead?.words?.length===1 && moneyWord(digitRead.words[0]) ? digitRead.words[0] : null;
  const evidence = smallTotalEvidence(readings,digits);
  if (!evidence) return;
  page.suggestedTotalCents = evidence.cents;
  if (!evidence.printed) return;
  for (const {read,label,value} of readings) {
    const text = label.text+' '+value.text;
    page.supplemental.push({...read, region:'small-total',text,words:[label,value],
      lines:[{text,confidence:Math.min(label.confidence,value.confidence)}]});
  }
}

// Conflicting readings of the printed amount always keep it out of the form.
// A digits-only crop can corroborate a suggestion. Automatic use requires
// independent full caption/value readings, including a strong value score.
export function smallTotalEvidence(readings,digits) {
  if (!readings.length) return null;
  const words = [...readings.map(pair=>pair.value), ...(digits ? [digits] : [])];
  if (!words.every(moneyWord)) return null;
  const amounts = new Set(words.map(word=>Number(word.text.replace(/[$,.]/g,''))));
  if (amounts.size !== 1 || words.filter(word=>word.confidence>=50).length<2 ||
      Math.max(...readings.map(pair=>pair.label.confidence))<65) return null;
  const [cents] = amounts;
  if (!Number.isSafeInteger(cents)) return null;
  return {cents,printed:readings.length>=2 && Math.max(...readings.map(pair=>pair.value.confidence))>=80};
}

// On service ledgers the bottom of the Tax label can touch the grid rule.
// Locate the physical cell under Taxable and require the independently read
// positive printed tax to reconcile to both the purchases and printed total.
export async function readRuledTax(file,page,receipt,recognize,options) {
  if (receipt.taxCents != null || receipt.itemizedCents == null || receipt.printedTotalCents == null) return;
  const money = word => Number(word.text.replace(/[$,.]/g,''));
  for (const source of page.supplemental || []) {
    if (source.region || !source.imageSize) continue;
    const words = source.words || [], {width,height} = source.imageSize;
    const heading = words.find(word=>/^taxable[:.]?$/i.test(word.text) && word.confidence>=75);
    if (!heading) continue;
    const base = words.find(word=>moneyWord(word) && word.left>heading.right && word.left-heading.right<width*.24 &&
      Math.abs(centerY(word)-centerY(heading))<heading.height && word.confidence>=85 && money(word)===receipt.itemizedCents);
    if (!base) continue;
    const tax = words.find(word=>moneyWord(word) && word.confidence>=85 && money(word)>0 &&
      Math.abs(word.right-base.right)<base.width*.35 && word.top>base.bottom && word.top-base.bottom<base.height*3);
    if (!tax || money(tax)+money(base)!==receipt.printedTotalCents) continue;
    const area = {left:(heading.left-heading.height)/width,top:(tax.top-1.2*tax.height)/height,
      width:(heading.width+2*heading.height)/width,height:tax.height*3.5/height};
    const confirmed = await readSmallPrintRegion(file,area,recognize,{...options,aspect:.7,pageSegMode:'11',removeRules:true});
    const label = confirmed?.words.find(word=>/^tax[:.]?$/i.test(word.text) && word.confidence>=70 &&
      Math.abs(centerY(word)/confirmed.imageSize.height-centerY(tax)/height)<tax.height/height);
    if (!label) continue;
    const sx = width/confirmed.imageSize.width, sy = height/confirmed.imageSize.height;
    const text = label.text+' '+tax.text;
    const mapped = {...label,left:label.left*sx,top:label.top*sy,width:label.width*sx,height:label.height*sy,
      right:label.right*sx,bottom:label.bottom*sy};
    page.supplemental.push({region:'small-tax',text, imageSize:source.imageSize,words:[mapped,tax],
      lines:[{text,confidence:Math.min(label.confidence,tax.confidence)}]});
    return;
  }
}
