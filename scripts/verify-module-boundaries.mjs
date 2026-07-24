import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('source/src/modules');
const failures = [];

const protectedModules = [
  'scanner-core',
  'document-pipeline',
  'document-readers/rate-confirmation',
  'document-readers/bol',
  'document-readers/pod',
  'document-readers/fuel-receipt',
  'records-vault',
];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function importsFrom(source) {
  const results = [];
  const pattern = /(?:import|export)\s+(?:[^'\"]+?\s+from\s+)?['\"]([^'\"]+)['\"]/g;
  let match;
  while ((match = pattern.exec(source))) results.push(match[1]);
  return results;
}

for (const file of walk(root).filter(file => /\.(js|jsx|mjs|ts|tsx)$/.test(file))) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  const owner = protectedModules.find(module => relative === module || relative.startsWith(`${module}/`));
  if (!owner) continue;

  const source = fs.readFileSync(file, 'utf8');
  for (const specifier of importsFrom(source)) {
    if (!specifier.startsWith('.')) continue;
    const resolved = path.resolve(path.dirname(file), specifier).replaceAll('\\', '/');
    const modulesRoot = root.replaceAll('\\', '/');
    if (!resolved.startsWith(modulesRoot)) continue;

    const targetRelative = path.relative(root, resolved).replaceAll('\\', '/');
    const target = protectedModules.find(module => targetRelative === module || targetRelative.startsWith(`${module}/`));
    if (!target || target === owner) continue;

    const usesPublicApi = /\/public-api(?:\.js)?$/.test(resolved);
    const allowedContractImport = owner.startsWith('document-readers/')
      && target === 'document-pipeline'
      && /\/contracts(?:\.js)?$/.test(resolved);

    if (!usesPublicApi && !allowedContractImport) {
      failures.push(`${relative} imports private internals from ${target}: ${specifier}`);
    }

    if (owner.startsWith('document-readers/') && target.startsWith('document-readers/')) {
      failures.push(`${relative} imports another document reader: ${specifier}`);
    }

    if (owner === 'scanner-core' && target !== 'scanner-core') {
      failures.push(`${relative} makes Scanner depend on ${target}: ${specifier}`);
    }
  }

  if (owner.startsWith('document-readers/') && /(setEventsByDay|saveAppSnapshot|logbook|duty status)/i.test(source)) {
    failures.push(`${relative} contains forbidden Logbook mutation language`);
  }
}

if (failures.length) {
  console.error('Module boundary verification failed:\n');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Module boundary verification passed.');
