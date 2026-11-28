import {maintenanceHeader} from './maintenanceReceiptHeader.js';
import {readSmallPrintRegion} from './maintenanceSmallPrint.js';

// The form reference and merchant are printed on neighboring lines. A strong
// reference identifies where to reread the merchant even when a viewer
// control covers the separate shop logo.
const orderCaption = /^OTC Order\s*#\s*(\d{2,6})[ -]+(\d{4,12})\s*$/i;

export async function readSmallPrintHeader(file, page, recognize, options, readRegion = readSmallPrintRegion) {
  const current = maintenanceHeader([page]);
  if (current.orderReferences.length || current.vendor && current.vendor !== 'TA Truck Service') return;
  for (const read of [...(page.supplemental || []),page]) {
    const size = read.imageSize;
    if (!size?.width || !size.height || read.region) continue;
    for (const row of (read.lines || []).slice(0,40)) {
      const order = orderCaption.exec(row.text.trim());
      if (!order || !Number.isFinite(row.confidence) || row.confidence < 85 ||
          !(row.top >= 0 && row.top < size.height*.3 && row.left >= 0 && row.left < size.width && row.height > 0 && row.width > 0)) continue;
      const left = Math.max(0,(row.left-row.height*1.1)/size.width);
      const top = Math.max(0,(row.top-row.height)/size.height);
      const area = {left,top,width:Math.min(1-left,row.width*1.67/size.width),
        height:Math.min(1-top,row.height*4.8/size.height)};
      const detail = await readRegion(file,area,recognize,{...options,aspect:.85,pageSegMode:'6'});
      if (!detail) return;
      const verified = maintenanceHeader([detail]);
      // Adjacent digits or a similar-looking name cannot introduce a vendor
      // or replace the original order number.
      if (verified.vendor === 'TA Truck Service' && verified.orderReferences.length === 1 &&
          verified.orderReferences[0] === 'OTC Order #' + order[1] + ' ' + order[2]) {
        (page.supplemental ||= []).push({...detail,region:'printed-merchant'});
      }
      return;
    }
  }
}
