// The core accepts observations, never image providers or application state.
// Boxes use the normalized coordinates of the observation's named source image.
export function normalizeInput(input) {
  if (!input || typeof input.documentId !== 'string' || !input.documentId.trim()) throw new Error('documentId is required');
  if (!Array.isArray(input.pages) || !input.pages.length || input.pages.length > 200) throw new Error('Supply between 1 and 200 pages');
  const pageIds = new Set();
  let characters = 0;
  const pages = input.pages.map((page, index) => {
    const id = String(page.id || `page-${index+1}`);
    if (pageIds.has(id)) throw new Error('Duplicate page ID');
    pageIds.add(id);
    const number = page.number ?? index+1;
    if (!Number.isInteger(number) || number < 1) throw new Error('Invalid page number');
    if (!Array.isArray(page.observations) || page.observations.length > 12) throw new Error('Invalid observations');
    const observationIds = new Set();
    const observations = page.observations.map((observation, oi) => {
      const observationId = String(observation.id || `read-${oi+1}`);
      if (observationIds.has(observationId)) throw new Error('Duplicate observation ID');
      observationIds.add(observationId);
      if (!Array.isArray(observation.lines) || observation.lines.length > 10000) throw new Error('Invalid observation lines');
      const lineIds = new Set();
      const lines = observation.lines.map((line, li) => {
        const lineId = String(line.id || `line-${li+1}`);
        if (lineIds.has(lineId)) throw new Error('Duplicate line ID');
        lineIds.add(lineId);
        if (typeof line.text !== 'string' || /[\r\n]/.test(line.text)) throw new Error('Each line must contain one text line');
        characters += line.text.length;
        if (characters > 2000000) throw new Error('Document text exceeds the reader limit');
        const confidence = line.confidence == null ? null : line.confidence;
        if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) throw new Error('Confidence must be in [0, 1]');
        let box = null;
        if (line.box != null) {
          const {x,y,width,height} = line.box;
          if (![x,y,width,height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || x+width > 1.000001 || y+height > 1.000001 || !observation.sourceImageId) throw new Error('Invalid source box or missing sourceImageId');
          box = {x,y,width,height};
        }
        return {id:lineId,text:line.text,box,confidence};
      });
      return {id:observationId,source:String(observation.source || 'unspecified'),sourceImageId:observation.sourceImageId || null,lines};
    });
    return {id,number,observations};
  });
  if (new Set(pages.map(p=>p.number)).size !== pages.length) throw new Error('Duplicate page number');
  return {documentId:input.documentId,pages};
}

export function textObservation(text, {id='text', source='text-input'}={}) {
  return {id,source,lines:String(text).split(/\r?\n/).map((text,i)=>({id:`line-${i+1}`,text}))};
}

export function evidenceFor(page, observation, line, start, end) {
  if (start < 0 || end <= start || end > line.text.length) throw new Error('Invalid evidence range');
  return {
    pageId:page.id,pageNumber:page.number,observationId:observation.id,lineId:line.id,
    start,end,quote:line.text.slice(start,end),source:observation.source,
    sourceImageId:observation.sourceImageId,box:line.box ? {...line.box} : null,
    boxScope:line.box ? 'line' : null,recognizerConfidence:line.confidence,
  };
}

export function resolveEvidence(result, evidence) {
  const page = result.pages.find(p=>p.id===evidence.pageId);
  const observation = page?.observations.find(o=>o.id===evidence.observationId);
  const line = observation?.lines.find(l=>l.id===evidence.lineId);
  if (!line || evidence.start < 0 || evidence.end <= evidence.start || line.text.slice(evidence.start,evidence.end)!==evidence.quote) throw new Error('Evidence does not match this document');
  return {page,observation,line};
}
