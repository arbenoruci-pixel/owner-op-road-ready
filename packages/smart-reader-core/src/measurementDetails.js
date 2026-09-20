// A single-row crop has its own coordinates: its label and value can span
// the entire image, and an adjacent border can enlarge the numeric box.
// Recognize only this bounded shape; whole-page column/row guards still apply.
export function isolatedMeasurementMatch(lines,spec){
  if(spec.kind!=='shipping_weight'||!spec.rightLabel||!spec.valuePattern)return null;
  const meaningful=lines.filter(line=>/[\p{L}\p{N}]/u.test(line.text));
  if(meaningful.length!==2||meaningful.some(line=>!line.box||line.box.height<.12))return null;
  const labels=meaningful.filter(line=>spec.rightLabel.test(line.text));
  if(labels.length!==1)return null;
  const labelLine=labels[0],line=meaningful.find(line=>line!==labelLine),a=labelLine.box,b=line.box;
  const gap=b.x-(a.x+a.width),short=Math.min(a.height,b.height);
  if(gap<-.003||gap>.5||Math.max(a.height,b.height)>short*3
    ||Math.abs(a.y+a.height/2-b.y-b.height/2)>short*.75
    ||Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)<short*.5)return null;
  const start=line.text.length-line.text.trimStart().length;
  const token=spec.valuePattern.exec(line.text.slice(start));
  // A complete observed number may end at a table border, never at a lost
  // digit, extra number, letter or different measurement label.
  if(!token||!/^[\s|)\]}]*$/.test(line.text.slice(start+token[0].length)))return null;
  return {line,start,end:start+token[0].length,labelLine,
    issue:'layout_needs_review',supportMethod:'isolated_measurement_detail'};
}
