// Twemoji（@twemoji/svg）の SVG を public/twemoji/ にコピーする。
// vite.config.js のプラグインから dev / build のたびに呼ばれる（コピー済みなら何もしない）。
// 単体でも実行できる: node scripts/copy-twemoji.mjs
// Twemoji graphics: Copyright Twitter, Inc. and other contributors, CC-BY 4.0
// https://creativecommons.org/licenses/by/4.0/
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function copyTwemoji({ quiet = false } = {}) {
  const srcDir = path.dirname(require.resolve('@twemoji/svg/package.json'));
  const { version } = JSON.parse(fs.readFileSync(path.join(srcDir, 'package.json'), 'utf8'));
  const outDir = path.join(root, 'public', 'twemoji');
  const stamp = path.join(outDir, '.version');
  if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === version) return;

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  let n = 0;
  for (const f of fs.readdirSync(srcDir)) {
    if (!f.endsWith('.svg')) continue;
    fs.copyFileSync(path.join(srcDir, f), path.join(outDir, f));
    n++;
  }
  fs.writeFileSync(path.join(outDir, 'LICENSE.txt'),
    'Twemoji graphics by Twitter, Inc. and other contributors (https://github.com/jdecked/twemoji)\n' +
    'Licensed under CC-BY 4.0: https://creativecommons.org/licenses/by/4.0/\n' +
    `Optimized SVG files from @twemoji/svg ${version} (MIT).\n`);
  fs.writeFileSync(stamp, version + '\n');
  if (!quiet) console.log(`[twemoji] copied ${n} SVG files to public/twemoji (v${version})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) copyTwemoji();
