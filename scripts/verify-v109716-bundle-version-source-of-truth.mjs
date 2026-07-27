import fs from 'node:fs';
import './verify-v109717-authoritative-production-version.mjs';

fs.rmSync('.next', { recursive:true, force:true });
console.log('PASS — stale restored .next output removed before compiling v109.7.17');
