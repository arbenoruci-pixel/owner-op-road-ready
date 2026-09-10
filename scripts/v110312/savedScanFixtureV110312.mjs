export const instructionTextV110312=`DRIVER/CARRIER INFORMATION SHEET
TQL PO# 76543210
Pickup Dates: 09/08/2026 Delivery Dates: 09/10/2026 09/17/2026
TQL CONTACT INFO
PICKUPS
SHED CITY STATE ZIP PU# DATE TIME
EXAMPLE FACTORY
FCFS 08:00 to
Howe IN 46746 87654321 09/08/2026
16:00
Information:
100 Example Road
Howe IN 46746
DROPS
CONSIGNEE CITY STATE ZIP DELIVERY PO# DATE TIME
123456 -
EXAMPLE RECEIVER
Smithfield RI 02917 09/10/2026 Appt 06:00 to
07:00
Information:
200 Example Avenue
Smithfield RI 02917
EXAMPLE FACTORY
FCFS 08:00 to
Howe IN 46746 09/17/2026
16:00
Information:
100 Example Road
Howe IN 46746
HOOK/LIVE UNLOAD - LOAD OUT RETURN
Driver Must Accept MacroPoint
POD emailed to example@example.invalid w/in 24 hrs
Picture of load loaded - submitted at pickup
Toll Fees may be subject to administrative fees ranging from $5.00-$100.00.`;
export const instructionResultV110312={type:{id:'load_tender',label:'Load Tender / Instructions'},text:instructionTextV110312,fields:{loadNo:'76543210',orderNo:'76543210',broker:'Total Quality Logistics (TQL)',documentDate:'2026-09-08'},confidence:.95,needsReview:true};
// A real, uncompressed PDF fixture; native PDF.js reads these positioned text rows.
export function instructionPdfV110312(){
 const content='BT /F1 10 Tf 12 TL 40 790 Td\n'+instructionTextV110312.split('\n').map((line,i)=>(i?'T* ':'')+'('+line.replace(/[\\()]/g,'\\$&')+') Tj').join('\n')+'\nET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
 let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((obj,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
 const start=pdf.length;pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
 return new TextEncoder().encode(pdf);
}
