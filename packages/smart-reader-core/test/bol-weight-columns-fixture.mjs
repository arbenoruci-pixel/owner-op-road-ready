const line=(text,x,y,width=.15,height=.012,confidence=.96)=>({text,confidence,box:{x,y,width,height}});
export const bolWeightColumnsInput=()=>({documentId:'sanitized-weight-table',pages:[{number:1,observations:[{id:'page-ocr',source:'existing-phone-ocr',sourceImageId:'original-1',lines:[
 line('STRIAGHT BILL OF LADING-SHORT FORM ORIGINAL - NOT NEGOTIABLE',.01,.145,.7),
 line('CARRIER: Example Logistics',.01,.178,.32),line('DATE',.65,.125,.05),line('10-08-26',.78,.121,.1),
 line('TO',.015,.308,.025,.008),line('FROM: SHIPPER',.64,.311,.11,.008),
 line('Example Receiver',.148,.322,.2),line('Example Printer',.763,.325,.2),
 line('DESTINATION',.016,.371,.1,.008),line('ORIGIN - CITY, STATE, ZIP',.64,.376,.24,.008),
 line('KIND OF PACKAGING, DESCRIPTION OF ARTICLES, SPECIAL MARKS',.148,.434,.35,.008),
 line('WEIGHT"',.556,.438,.043,.006,.35),line('CHARGES',.784,.438,.05,.006),line('UNITS',.018,.442,.028,.006),
 line('Class',.636,.446,.032,.008),line('12',.082,.457,.022),line('31,246',.56,.461,.068,.015),line('60',.694,.462,.024),
]}]}]});
