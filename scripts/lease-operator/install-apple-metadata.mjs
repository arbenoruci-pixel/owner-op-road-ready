import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

// The legacy build reconstructs the root layout with hard-coded iOS metadata.
// Let Next render those fields from the effective metadata for each route.
const file = 'app/layout.jsx';
const layout = readFileSync(file, 'utf8');
const manualTags = [
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-title" content="Road Ready" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
];
assert.ok(layout.includes('appleWebApp:') && layout.includes('apple-mobile-web-app-capable'));
const next = layout.split('\n').filter(line => !manualTags.includes(line.trim())).join('\n');
if (next !== layout) writeFileSync(file, next);
