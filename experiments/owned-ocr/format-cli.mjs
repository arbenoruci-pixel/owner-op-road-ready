#!/usr/bin/env node
import fs from 'node:fs';
import {learnFormat,applyFormat} from './format-memory.mjs';

const [command,inputFile,optionsFile,outputFile]=process.argv.slice(2);
if(!['learn','apply'].includes(command)||!inputFile||!optionsFile||!outputFile){
  throw new Error('Usage: node format-cli.mjs learn|apply input.json confirmation-or-memory.json output.json');
}
const input=JSON.parse(fs.readFileSync(inputFile,'utf8'));
const options=JSON.parse(fs.readFileSync(optionsFile,'utf8'));
const output=command==='learn'?{
  formatKey:options.formatKey,documentKind:options.documentKind,memories:[learnFormat(input,options)],
}:options.memories.flatMap(memory=>applyFormat(input,memory,options));
fs.writeFileSync(outputFile,JSON.stringify(output,null,2)+'\n');
