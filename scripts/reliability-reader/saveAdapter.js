'use client';
import Dexie from 'dexie';
import {getOwnerOpDb} from '../../../../lib/local-db/dexie.js';
import {saveDocument} from './documentSave.js';
import {uploadDocumentOriginal} from './cloudOriginal.js';
export function saveScannedDocumentReliable(options){
  const type=options.classification?.selectedType||options.extracted?.type||options.type;
  return saveDocument({...options,type},{db:getOwnerOpDb(),waitFor:promise=>Dexie.waitFor(promise),upload:uploadDocumentOriginal});
}
