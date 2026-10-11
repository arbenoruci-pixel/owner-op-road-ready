import {PDFDocument,StandardFonts} from 'pdf-lib';
import {signedRateInput} from '../../packages/smart-reader-core/test/signed-rate-fixture.mjs';

export async function rateAgreementPdf({signed=true}={}){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
 for(const input of signedRateInput({signed}).pages){
  const page=pdf.addPage([612,792]);
  for(const [index,line]of input.observations[0].lines.entries()){
   const box=line.box||{x:.08,y:.06+index*.035,width:.7};
   const size=Math.min(11,box.width*612/font.widthOfTextAtSize(line.text,1));
   page.drawText(line.text,{x:box.x*612,y:(1-box.y)*792-size,size,font});
  }
 }
 return Buffer.from(await pdf.save());
}
