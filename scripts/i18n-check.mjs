#!/usr/bin/env node
// i18n check:
//   1. keys present in one locale but missing in another (src/i18n/*.json)
//   2. placeholders ({{name}}) that differ between locales
//   3. Japanese text left in src/ outside src/i18n (comments are ignored)
// A line can opt out with a comment containing "i18n-ignore" (e.g. kaomoji that are content, not UI).
// Exit code 1 when something is found.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'src');
const i18nDir = path.join(srcDir, 'i18n');
// espree is ESLint's parser (ESLint is a devDependency); resolve it through eslint so no extra dependency is needed.
const espree = createRequire(createRequire(import.meta.url).resolve('eslint'))('espree');

let problems = 0;
const report = (msg) => { problems++; console.log(msg); };

// ---- 1 + 2: dictionaries ----
const SOURCE_LOCALE = 'ja'; // the original text; other locales are translations of it
const locales = fs.readdirSync(i18nDir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
  .sort((a, b) => (a === SOURCE_LOCALE ? -1 : b === SOURCE_LOCALE ? 1 : a.localeCompare(b)));
const PLURAL_FORMS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
const isPluralObj = (v) => v && typeof v === 'object' && 'other' in v && Object.entries(v).every(([k, x]) => PLURAL_FORMS.has(k) && typeof x === 'string');
const flatten = (obj, prefix = '', out = {}) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    const isPlural = isPluralObj(v);
    if (v && typeof v === 'object' && !isPlural) flatten(v, key, out);
    else out[key] = isPlural ? Object.values(v).join('\n') : String(v);
  }
  return out;
};
const dicts = Object.fromEntries(locales.map((l) => [l, flatten(JSON.parse(fs.readFileSync(path.join(i18nDir, `${l}.json`), 'utf8')))]));
const allKeys = new Set(Object.values(dicts).flatMap((d) => Object.keys(d)));
const vars = (s) => [...new Set([...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))].sort().join(',');
for (const key of [...allKeys].sort()) {
  const missingIn = locales.filter((l) => !(key in dicts[l]));
  if (missingIn.length) { report(`missing key  ${key}  in ${missingIn.join(', ')}`); continue; }
  const v = locales.map((l) => vars(dicts[l][key]));
  // a translation may drop a placeholder it does not need, but must not invent one
  const base = new Set(v[0].split(',').filter(Boolean));
  locales.forEach((l, i) => {
    const extra = v[i].split(',').filter((x) => x && !base.has(x));
    if (extra.length) report(`placeholder  ${key}  in ${l}: {{${extra.join('}}, {{')}}} not in ${locales[0]}`);
  });
}

// ---- 3: Japanese left in src/ ----
// Hiragana, Katakana (minus the "・" middle dot, used as a separator), CJK ideographs, half-width Katakana.
const JP = /[\u3040-\u30fa\u30fc-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff66-\uff9f]/;
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return p === i18nDir ? [] : walk(p);
  return /\.(jsx?|mjs)$/.test(e.name) ? [p] : [];
});
let leftovers = 0;
for (const file of walk(srcDir)) {
  const src = fs.readFileSync(file, 'utf8');
  if (!JP.test(src)) continue;
  let ast;
  try {
    ast = espree.parse(src, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, comment: true, range: true, loc: true });
  } catch (e) { report(`parse error  ${path.relative(root, file)}: ${e.message}`); continue; }
  // blank out comments, keep line structure
  const chars = src.split('');
  for (const c of ast.comments) for (let i = c.range[0]; i < c.range[1]; i++) if (chars[i] !== '\n') chars[i] = ' ';
  const code = chars.join('').split('\n');
  const raw = src.split('\n');
  code.forEach((line, i) => {
    if (!JP.test(line)) return;
    if (/i18n-ignore/.test(raw[i]) || /i18n-ignore-next-line/.test(raw[i - 1] || '')) return;
    leftovers++;
    report(`japanese     ${path.relative(root, file)}:${i + 1}: ${raw[i].trim().slice(0, 120)}`);
  });
}

console.log(`\n${locales.length} locales (${locales.join(', ')}), ${allKeys.size} keys, ${leftovers} line(s) with Japanese outside src/i18n.`);
console.log(problems ? `✗ ${problems} problem(s)` : '✓ i18n check passed');
process.exit(problems ? 1 : 0);
