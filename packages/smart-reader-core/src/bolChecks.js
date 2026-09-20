import {validateBolWeights} from './bolMeasurements.js';
import {bolBarcodeChecks} from './barcodeEvidence.js';
export function validateBol(pages,fields){return [...validateBolWeights(fields),...bolBarcodeChecks(pages,fields)];}
