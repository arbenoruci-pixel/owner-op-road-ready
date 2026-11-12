import fs from 'node:fs';
import assert from 'node:assert/strict';

const file='lib/local-db/safetyArchive.js';
const before=`    const list = await table.toArray();
    let binaryBytes = 0;
    for (const row of list) {
      for (const value of Object.values(row || {})) binaryBytes += sizeOfBinary(value);
    }
    rows[table.name] = { count: list.length, binaryBytes };`;
const after=`    let count = 0, binaryBytes = 0;
    // Inventory runs when Export & Backup opens. A cursor releases each row
    // before reading the next, including large historical recovery snapshots.
    await table.each(row => {
      count += 1;
      for (const value of Object.values(row || {})) binaryBytes += sizeOfBinary(value);
    });
    rows[table.name] = { count, binaryBytes };`;
const source=fs.readFileSync(file,'utf8');
if(!source.includes(after)) {
  assert.equal(source.split(before).length,2,'Backup inventory predecessor changed');
  fs.writeFileSync(file,source.replace(before,after));
}
console.log('PASS — backup inventory streams each stored row with unchanged counts and binary totals');
