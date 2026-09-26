#!/usr/bin/env node
// Rewrites every JSON file under data/ in one consistent, diff-friendly style:
// flat objects and arrays of plain values stay on one line when short.
//   node scripts/format-data.mjs          # rewrite files
//   node scripts/format-data.mjs --check  # exit 1 if any file would change
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DATA, ROOT } from './lib/data.mjs';

const MAX_INLINE = 110;
const check = process.argv.includes('--check');

const isPrimitive = (v) => v === null || typeof v !== 'object';
const isFlat = (v) => (Array.isArray(v) ? v.every(isPrimitive) : Object.values(v).every(isPrimitive));

function fmt(value, indent = '') {
  if (isPrimitive(value)) return JSON.stringify(value);
  const inner = indent + '  ';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const oneLine = '[' + value.map((v) => fmt(v)).join(', ') + ']';
    if (isFlat(value) && indent.length + oneLine.length <= MAX_INLINE * 1.5) return oneLine;
    return '[\n' + value.map((v) => inner + fmt(v, inner)).join(',\n') + '\n' + indent + ']';
  }
  const entries = Object.entries(value);
  if (entries.length === 0) return '{}';
  const oneLine = '{ ' + entries.map(([k, v]) => `${JSON.stringify(k)}: ${fmt(v)}`).join(', ') + ' }';
  // Short objects stay on one line, including ones with short nested values (e.g. a note).
  if (indent.length + oneLine.length <= MAX_INLINE && !oneLine.includes('\n')) return oneLine;
  return '{\n' + entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${fmt(v, inner)}`).join(',\n') + '\n' + indent + '}';
}

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : f.endsWith('.json') ? [p] : [];
  });
}

let changed = 0;
for (const file of walk(DATA)) {
  const before = readFileSync(file, 'utf8');
  const after = fmt(JSON.parse(before)) + '\n';
  if (before !== after) {
    changed++;
    if (check) console.log('would reformat ' + relative(ROOT, file));
    else writeFileSync(file, after);
  }
}
if (check && changed) process.exit(1);
console.log(check ? 'All data files are formatted.' : `Formatted ${changed} file(s).`);
