function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function pointDistance(a, b) {
  return Math.hypot(Number(a?.x || 0) - Number(b?.x || 0), Number(a?.y || 0) - Number(b?.y || 0));
}

function polygonArea(points = []) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    sum += (a.x * b.y) - (b.x * a.y);
  }
  return Math.abs(sum) / 2;
}

function orderedCorners(points = []) {
  if (points.length !== 4) return null;
  const sorted = points.map(point => ({ x:Number(point.x), y:Number(point.y) })).sort((a,b)=>(a.x+a.y)-(b.x+b.y));
  const topLeft = sorted[0];
  const bottomRight = sorted[3];
  const middle = sorted.slice(1,3).sort((a,b)=>(a.y-a.x)-(b.y-b.x));
  const topRight = middle[0];
  const bottomLeft = middle[1];
  return { topLeft, topRight, bottomLeft, bottomRight };
}

function candidateScore(corners, width, height) {
  const points = [corners.topLeft,corners.topRight,corners.bottomRight,corners.bottomLeft];
  const areaRatio = polygonArea(points) / Math.max(1,width*height);
  if (areaRatio < .018 || areaRatio > .985) return -Infinity;
  const top = pointDistance(corners.topLeft,corners.topRight);
  const bottom = pointDistance(corners.bottomLeft,corners.bottomRight);
  const left = pointDistance(corners.topLeft,corners.bottomLeft);
  const right = pointDistance(corners.topRight,corners.bottomRight);
  const avgWidth = (top+bottom)/2;
  const avgHeight = (left+right)/2;
  const aspect = Math.min(avgWidth,avgHeight)/Math.max(avgWidth,avgHeight);
  if (aspect < .12) return -Infinity;
  const oppositeBalance = 1 - Math.min(1,(Math.abs(top-bottom)/Math.max(top,bottom,1))+(Math.abs(left-right)/Math.max(left,right,1)));
  const centerX = points.reduce((sum,p)=>sum+p.x,0)/4/width;
  const centerY = points.reduce((sum,p)=>sum+p.y,0)/4/height;
  const centerScore = 1-Math.min(1,Math.hypot(centerX-.5,centerY-.5)/.72);
  const edgeDistances = points.flatMap(p=>[p.x/width,1-p.x/width,p.y/height,1-p.y/height]);
  const edgeMin = Math.min(...edgeDistances);
  const fullFramePenalty = areaRatio>.88 && edgeMin<.025 ? .46 : areaRatio>.94 ? .58 : 0;
  const paperShape = aspect>=.18 && aspect<=.88 ? 1 : .55;
  const usableArea = Math.min(1,areaRatio/.34);
  const smallReceiptBoost = aspect<.42 && areaRatio>.035 ? .18 : 0;
  return usableArea*.44 + oppositeBalance*.18 + centerScore*.17 + paperShape*.14 + smallReceiptBoost - fullFramePenalty;
}

function contourPoints(cv, approximation) {
  const points = [];
  for (let row=0; row<approximation.rows; row+=1) {
    const ptr = approximation.intPtr(row,0);
    points.push({ x:ptr[0], y:ptr[1] });
  }
  return points;
}

export function detectBestDocumentQuadV102(cv, canvas) {
  if (!cv?.Mat || !canvas) return null;
  const source = cv.imread(canvas);
  const gray = new cv.Mat();
  const blur = new cv.Mat();
  const edges = new cv.Mat();
  const closed = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(7,7));
  let best = null;
  try {
    cv.cvtColor(source,gray,cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray,blur,new cv.Size(5,5),0,0,cv.BORDER_DEFAULT);
    const median = cv.mean(blur)[0] || 128;
    const low = Math.max(25,Math.round(median*.48));
    const high = Math.max(low+35,Math.round(median*1.35));
    cv.Canny(blur,edges,low,high,3,false);
    cv.morphologyEx(edges,closed,cv.MORPH_CLOSE,kernel,new cv.Point(-1,-1),2);
    cv.findContours(closed,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
    const candidates = [];
    for (let index=0; index<contours.size(); index+=1) {
      const contour = contours.get(index);
      const area = Math.abs(cv.contourArea(contour,false));
      if (area < canvas.width*canvas.height*.015) { contour.delete(); continue; }
      candidates.push({ contour,area });
    }
    candidates.sort((a,b)=>b.area-a.area);
    for (const item of candidates.slice(0,60)) {
      const perimeter = cv.arcLength(item.contour,true);
      for (const epsilonFactor of [.018,.024,.032]) {
        const approx = new cv.Mat();
        try {
          cv.approxPolyDP(item.contour,approx,perimeter*epsilonFactor,true);
          if (approx.rows!==4 || !cv.isContourConvex(approx)) continue;
          const points = contourPoints(cv,approx);
          const ordered = orderedCorners(points);
          if (!ordered) continue;
          const score = candidateScore(ordered,canvas.width,canvas.height);
          if (!best || score>best.score) best={ corners:ordered,score,areaRatio:item.area/(canvas.width*canvas.height) };
        } finally { approx.delete(); }
      }
    }
    candidates.forEach(item=>item.contour.delete());
  } finally {
    source.delete();gray.delete();blur.delete();edges.delete();closed.delete();contours.delete();hierarchy.delete();kernel.delete();
  }
  if (!best || best.score<.35) return null;
  return {
    topLeft:{x:clamp(best.corners.topLeft.x/canvas.width),y:clamp(best.corners.topLeft.y/canvas.height)},
    topRight:{x:clamp(best.corners.topRight.x/canvas.width),y:clamp(best.corners.topRight.y/canvas.height)},
    bottomLeft:{x:clamp(best.corners.bottomLeft.x/canvas.width),y:clamp(best.corners.bottomLeft.y/canvas.height)},
    bottomRight:{x:clamp(best.corners.bottomRight.x/canvas.width),y:clamp(best.corners.bottomRight.y/canvas.height)},
    score:best.score,
    areaRatio:best.areaRatio,
  };
}

function fallbackOcrEnhance(canvas) {
  const context = canvas.getContext('2d',{willReadFrequently:true});
  const image = context.getImageData(0,0,canvas.width,canvas.height);
  const data = image.data;
  let min=255,max=0;
  for(let index=0;index<data.length;index+=16){
    const gray=(data[index]*.299)+(data[index+1]*.587)+(data[index+2]*.114);
    min=Math.min(min,gray);max=Math.max(max,gray);
  }
  const range=Math.max(36,max-min);
  for(let index=0;index<data.length;index+=4){
    const gray=(data[index]*.299)+(data[index+1]*.587)+(data[index+2]*.114);
    let value=((gray-min)*255/range);
    value=((value-128)*1.28)+140;
    if(value>205)value=255-((255-value)*.3);
    if(value<72)value*=.72;
    value=Math.max(0,Math.min(255,value));
    data[index]=value;data[index+1]=value;data[index+2]=value;
  }
  context.putImageData(image,0,0);
  return canvas;
}

export function enhanceOcrCanvasV102(canvas,cv) {
  if (!canvas) return canvas;
  if (!cv?.Mat) return fallbackOcrEnhance(canvas);
  const src=cv.imread(canvas);
  const gray=new cv.Mat();
  const background=new cv.Mat();
  const normalized=new cv.Mat();
  const contrast=new cv.Mat();
  const sharpened=new cv.Mat();
  let clahe=null;
  try{
    cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);
    const kernel=Math.max(31,Math.min(101,Math.round(Math.min(canvas.width,canvas.height)/18)|1));
    cv.GaussianBlur(gray,background,new cv.Size(kernel,kernel),0,0,cv.BORDER_DEFAULT);
    cv.divide(gray,background,normalized,255);
    if(typeof cv.CLAHE==='function'){
      clahe=new cv.CLAHE(3.2,new cv.Size(8,8));
      clahe.apply(normalized,contrast);
    }else cv.equalizeHist(normalized,contrast);
    const soft=new cv.Mat();
    cv.GaussianBlur(contrast,soft,new cv.Size(0,0),1.05);
    cv.addWeighted(contrast,1.72,soft,-.72,10,sharpened);
    soft.delete();
    cv.imshow(canvas,sharpened);
    return canvas;
  }catch{
    return fallbackOcrEnhance(canvas);
  }finally{
    try{clahe?.delete?.();}catch{}
    src.delete();gray.delete();background.delete();normalized.delete();contrast.delete();sharpened.delete();
  }
}

export function receiptOutputSizeV102(rawWidth=1,rawHeight=1){
  const long=Math.max(rawWidth,rawHeight,1);
  const short=Math.max(1,Math.min(rawWidth,rawHeight));
  let scale=Math.max(1,Math.min(3.2,4200/long));
  if(short*scale<1100)scale=Math.min(3.8,1100/short);
  if(long*scale>5200)scale=5200/long;
  return {width:Math.max(900,Math.round(rawWidth*scale)),height:Math.max(1100,Math.round(rawHeight*scale)),scale};
}
