import { analyzeFuelReceiptV1 } from '../../scan/engines/fuelReceiptEngineV1.js';
import { engineResultV1 } from '../../scan/engines/documentEngineContractV1.js';
import { parseFuelStatement, fuelStatementFields } from './fuelStatementV1103.js';

export function analyzeFuelReceiptV1103(input = {}) {
  const statement=parseFuelStatement(input.text || '');
  if(!statement)return analyzeFuelReceiptV1(input);
  return engineResultV1({engineId:'fuel-receipt-engine',version:'1.1.0',typeId:'fuel_receipt',qualified:statement.valid,
    score:statement.valid?100:50,confidence:statement.valid?0.99:0.5,
    fields:fuelStatementFields(statement),missingFields:statement.valid?[]:['statementReview'],
    groups:[{id:'transaction-table',weight:100,matched:true,detail:statement.transactionCount+' fuel transactions'}],
    reasons:statement.valid?['Transaction rows reconcile to statement totals']:statement.issues.map(issue=>issue.code),penalties:[]});
}
