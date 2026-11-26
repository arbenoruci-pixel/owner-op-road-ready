import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const chunkSize = 49_152;
export const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const kinds = new Set(['ratecon', 'bol', 'pod', 'supporting', 'invoice']);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export function mimeType(bytes) {
  if (bytes.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.toString('ascii', 4, 8) === 'ftyp') {
    const brand = bytes.toString('ascii', 8, 12);
    if (['heic', 'heix', 'hevc', 'hevx'].includes(brand)) return 'image/heic';
    if (['mif1', 'msf1'].includes(brand)) return 'image/heif';
  }
  throw new Error('Unsupported original or missing file signature.');
}

export async function prepareOriginal(source, directory, operator, load, kind) {
  assert(uuid.test(operator) && uuid.test(load), 'Expected operator and load UUIDs.');
  assert(kinds.has(kind), 'Unsupported document kind.');
  const bytes = await readFile(source);
  assert(bytes.length > 0 && bytes.length <= 33_554_432, 'Original must be 1 byte–32 MiB.');
  const mime = mimeType(bytes);
  assert(kind !== 'invoice' || mime === 'application/pdf', 'Invoice packet must be a PDF.');
  const sha = hash(bytes);
  // Replays that see no prior row generate the same ID on every worker.
  const seed = hash([operator.toLowerCase(),load.toLowerCase(),kind,sha].join('/')).slice(0,32);
  const id = [seed.slice(0,8),seed.slice(8,12),'8'+seed.slice(13,16),'8'+seed.slice(17,20),seed.slice(20)].join('-');
  const name = basename(source);
  assert(name.length > 0 && [...name].length <= 255, 'Invalid filename.');
  const fileNameSQL = "convert_from(decode('" + Buffer.from(name).toString('hex') + "','hex'),'UTF8')";
  const condition = "load_id='" + load + "' and kind='" + kind + "' and sha256='" + sha + "'";
  const target = "(select id from public.rr_lease_documents where " + condition + ")";
  const storagePath = [operator.toLowerCase(),load.toLowerCase(),id].join('/');
  // mkdir without recursive prevents reusing an old directory of chunk statements.
  await mkdir(directory, { mode:0o700 });
  const save = (name, sql) => writeFile(join(directory,name),sql+'\n',{mode:0o600,flag:'wx'});
  await save('000-init.sql',
    'begin;\ninsert into public.rr_lease_documents(id,load_id,kind,file_name,mime_type,byte_size,sha256,storage_backend,storage_path) ' +
    "values('"+id+"','"+load+"','"+kind+"',"+fileNameSQL+",'"+mime+"',"+bytes.length+",'"+sha+"','database','"+storagePath+"') " +
    'on conflict(load_id,kind,sha256) do nothing;\n' +
    'select id,byte_size,sha256,is_ready from public.rr_lease_documents where '+condition+';\ncommit;');
  let count = 0;
  for (let start=0; start<bytes.length; start+=chunkSize) {
    const b64 = bytes.subarray(start,start+chunkSize).toString('base64');
    await save('100-part-'+String(count).padStart(4,'0')+'.sql',
      'select public.rr_lease_put_chunk('+target+','+count+",'"+b64+"');");
    count++;
  }
  await save('200-finish.sql','select public.rr_lease_finish_original('+target+');\n' +
    'select id,byte_size,sha256,is_ready from public.rr_lease_documents where '+condition+';');
  return {sha256:sha,bytes:bytes.length,parts:count};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args=process.argv.slice(2);
  if (args.length !== 5) throw new Error('Usage: node original.mjs SOURCE NEW_PRIVATE_DIR OPERATOR_UUID LOAD_UUID KIND');
  console.log(JSON.stringify(await prepareOriginal(...args)));
}
