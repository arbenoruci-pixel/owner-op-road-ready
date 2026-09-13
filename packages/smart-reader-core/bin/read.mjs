#!/usr/bin/env node
import fs from 'node:fs';
import {readDocument,buildRereadRequests} from '../src/index.js';
try {
  const input=JSON.parse(fs.readFileSync(process.argv[2]||0,'utf8'));
  const result=readDocument(input);
  process.stdout.write(JSON.stringify({...result,rereadRequests:buildRereadRequests(result)},null,2)+'\n');
} catch(error) {
  process.stderr.write('Document reading failed: '+error.message+'\n');
  process.exitCode=1;
}
