// OCR-only correction for narrow receipts photographed at an angle. Text on folded
// or tilted paper can have a different baseline at the top and bottom of the page.
function paperBounds(data, width, height) {
  const bright = (x,y) => data[(y*width+x)*4+1] > 172;
  let first = 0, last = -1, top = 0, bottom = 0;
  for (let y = 0; y < height; y++) {
    let votes = 0;
    for (let j = 2; j <= 8; j++) votes += bright(Math.floor(width*j/10),y);
    if (votes >= 5) {
      if (y-last > Math.max(3,width*.035)) first = y;
      last = y;
      if (last+1-first > bottom-top) [top,bottom] = [first,last+1];
    }
  }
  if (bottom-top < height*.42) return null;
  const columns = [];
  for (let x = 0; x < width; x++) {
    let votes = 0;
    for (let j = 1; j < 12; j++) votes += bright(x,Math.floor(top+(bottom-top)*j/12));
    if (votes >= 8) columns.push(x);
  }
  if (columns.length < width*.4) return null;
  const left = columns[0], right = columns.at(-1)+1;
  const ratio = (right-left)/(bottom-top);
  return ratio >= .22 && ratio < .76 ? {left,top,width:right-left,height:bottom-top} : null;
}

function localContrast(image) {
  const {data,width,height} = image;
  const stride = width+1;
  const sum = new Uint32Array(stride*(height+1));
  const output = new Uint8Array(width*height);
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += data[(y*width+x)*4+1];
      sum[(y+1)*stride+x+1] = sum[y*stride+x+1]+row;
    }
  }
  const radius = Math.max(4,Math.round(width*.017));
  for (let y = 0; y < height; y++) {
    const t = Math.max(0,y-radius), b = Math.min(height,y+radius+1);
    for (let x = 0; x < width; x++) {
      const l = Math.max(0,x-radius), r = Math.min(width,x+radius+1);
      const average = (sum[b*stride+r]-sum[b*stride+l]-sum[t*stride+r]+sum[t*stride+l])/((b-t)*(r-l));
      output[y*width+x] = Math.max(0,average-data[(y*width+x)*4+1]);
    }
  }
  return output;
}

function baselineSamples(image) {
  const {width,height,data} = image;
  const ink = localContrast(image);
  const samples = [];
  for (let band = 1; band <= 11; band++) {
    const center = height*band/12, xs = [], ys = [];
    const low = Math.max(Math.round(height*.015),Math.round(center-height*.068));
    const high = Math.min(Math.round(height*.98),Math.round(center+height*.068));
    for (let y = low; y < high; y++) {
      for (let x = Math.ceil(width*.025); x < width*.975; x++) {
        const i = y*width+x;
        if (ink[i] > 35 && data[i*4+1] < 150) {
          xs.push(x-width/2);
          ys.push(y-low);
        }
      }
    }
    if (xs.length < width*.8) continue;
    // Horizontal ink accumulates in a few scanlines when their angle matches
    // the printed baseline. Score row transitions, including projecting at zero tilt.
    const margin = Math.ceil(width*.26)+2;
    const counts = new Uint32Array(high-low+2*margin+4);
    let best = 0, slope = 0, zero = 0;
    for (let step = -25; step <= 25; step++) {
      counts.fill(0);
      const angle = step*.02;
      for (let i = 0; i < xs.length; i++) counts[Math.round(ys[i]-angle*xs[i])+margin]++;
      let score = 0;
      for (let i = 2; i < counts.length-2; i++) {
        const diff = counts[i+1]+counts[i+2]-counts[i-1]-counts[i-2];
        score += diff*diff;
      }
      if (!step) zero = score;
      if (score > best) { best = score; slope = angle; }
    }
    if (best > zero*1.22) samples.push({y:center/height,slope});
  }
  return samples;
}

function median(numbers) {
  const sorted = numbers.sort((a,b) => a-b);
  return sorted.length%2 ? sorted[Math.floor(sorted.length/2)] :
    (sorted[sorted.length/2]+sorted[sorted.length/2-1])/2;
}

function baselineFit(samples) {
  const rates = [];
  for (const a of samples) for (const b of samples) {
    if (b.y-a.y > .3) rates.push((b.slope-a.slope)/(b.y-a.y));
  }
  if (samples.length < 4 || !rates.length) return null;
  // Median estimates tolerate a fold, edge or divider winning one band.
  const rate = median(rates);
  const initial = median(samples.map(p => p.slope-p.y*rate));
  const supporters = samples.filter(p => Math.abs(p.slope-initial-rate*p.y) < .055);
  if (supporters.length < Math.max(4,samples.length*.65) || Math.max(Math.abs(initial),Math.abs(initial+rate)) < .095) return null;
  return {initial,rate};
}

export async function straightenThermalReceipt(file,signal) {
  signal?.throwIfAborted();
  const image = new Image(), url = URL.createObjectURL(file);
  const canvas = document.createElement('canvas'), output = document.createElement('canvas');
  try {
    image.src = url;
    await image.decode();
    signal?.throwIfAborted();
    const iw = image.naturalWidth, ih = image.naturalHeight;
    if (iw >= ih || iw < 160) return null;
    const scale = Math.min(1,360/iw,800/ih);
    canvas.width = Math.round(iw*scale);
    canvas.height = Math.round(ih*scale);
    const ctx = canvas.getContext('2d',{alpha:false,willReadFrequently:true});
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const preview = ctx.getImageData(0,0,canvas.width,canvas.height);
    const bounds = paperBounds(preview.data,preview.width,preview.height);
    if (!bounds) return null;
    const fit = baselineFit(baselineSamples(ctx.getImageData(bounds.left,bounds.top,bounds.width,bounds.height)));
    if (!fit) return null;
    const sx = iw/preview.width, sy = ih/preview.height;
    const size = Math.min(1,850/(bounds.width*sx),1750/(bounds.height*sy));
    const w = canvas.width = Math.round(bounds.width*sx*size);
    const h = canvas.height = Math.round(bounds.height*sy*size);
    ctx.drawImage(image,bounds.left*sx,bounds.top*sy,bounds.width*sx,bounds.height*sy,0,0,w,h);
    const original = ctx.getImageData(0,0,w,h);
    const source = localContrast(original);
    // Retain filled strokes as well as edges when evening out folds or shadows.
    for (let i = 0; i < source.length; i++) {
      source[i] = Math.round(.3*source[i]+.7*(255-original.data[i*4+1]));
    }
    const flat = ctx.createImageData(w,h);
    for (let y = 0; y < h; y++) {
      const slope = fit.initial+fit.rate*y/h;
      for (let x = 0; x < w; x++) {
        const srcY = y+slope*(x-w/2);
        const y0 = Math.floor(srcY), frac = srcY-y0;
        const i = y0*w+x;
        const ink = y0 < 0 || y0+1 >= h ? 0 : source[i]*(1-frac)+source[i+w]*frac;
        const level = 255-1.4*Math.max(0,ink-15);
        const target = (y*w+x)*4;
        flat.data[target] = flat.data[target+1] = flat.data[target+2] = level;
        flat.data[target+3] = 255;
      }
    }
    ctx.putImageData(flat,0,0);
    // Perspective compresses characters across the roll. Widen this OCR copy.
    output.width = Math.round(w*1.85);
    output.height = h;
    const paint = output.getContext('2d',{alpha:false});
    paint.imageSmoothingQuality = 'high';
    paint.drawImage(canvas,0,0,output.width,output.height);
    signal?.throwIfAborted();
    return await new Promise(resolve => output.toBlob(resolve,'image/png'));
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = output.width = output.height = 1;
  }
}
