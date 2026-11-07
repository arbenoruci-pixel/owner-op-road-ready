// Run after historical materializers and the final navigation adapter.
// Only reveal existing source-review controls; retain every evidence assertion.
import assert from 'node:assert/strict';
import fs from 'node:fs';

function patch(file,before,after){
  const source=fs.readFileSync(file,'utf8');
  if(source.includes(after)){
    assert.equal(source.split(after).length,2,`Duplicate reader-preview adaptation: ${file}`);
    return;
  }
  assert.equal(source.split(before).length,2,`Reader-preview test anchor: ${file}`);
  fs.writeFileSync(file,source.replace(before,()=>after));
}

patch('scripts/browser-owned-reader.mjs',
  "    await review.getByText('3 pages · 3 documents',{exact:true}).waitFor();",
  `    const packetDetails=page.getByRole('button',{name:/^(?:All reading details|Reader preview · (?:Check source|Close))$/});
    await packetDetails.waitFor();
    if(await packetDetails.getAttribute('aria-expanded')!=='true')await packetDetails.click();
    await review.getByText('3 pages · 3 documents',{exact:true}).waitFor();`);

patch('scripts/browser-ratecon-structure-v110388.mjs',
  "const previewToggle=page.getByRole('button',{name:/^Reader preview · (?:Check source|Close)$/});",
  "const previewToggle=page.getByRole('button',{name:/^(?:All reading details|Reader preview · (?:Check source|Close))$/});");

console.log('PASS — reader-preview test disclosures adapted; source and evidence assertions preserved');
