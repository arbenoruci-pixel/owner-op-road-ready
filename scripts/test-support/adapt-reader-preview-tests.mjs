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

// The preview wrapper can mount before the disclosure button. Never use an
// instantaneous isVisible() result to decide whether source details need opening.
for(const [name,indent,previous] of [
  ['openDetail','    ','await openDetail.waitFor();await openDetail.click();'],
  ['joinedOpen','    ',"await page.locator('.owned-reader-preview').waitFor();if(await joinedOpen.isVisible())await joinedOpen.click();"],
  ['open','      ',"await page.locator('.owned-reader-preview').waitFor();if(await open.isVisible())await open.click();"]
]){
  patch('scripts/browser-owned-reader.mjs',
    `${indent}const ${name}=page.getByRole('button',{name:/^(?:All reading details|Reader preview · Check source)$/});\n${indent}${previous}`,
    `${indent}const ${name}=page.getByRole('button',{name:/^(?:All reading details|Reader preview · (?:Check source|Close))$/});
${indent}await ${name}.waitFor();
${indent}if(await ${name}.getAttribute('aria-expanded')==='false')await ${name}.click();`);
}

console.log('PASS — reader-preview test disclosures adapted; source and evidence assertions preserved');
