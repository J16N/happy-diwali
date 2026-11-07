// Fingerprints every script and stylesheet so browsers can never mix old and
// new files after a deploy:
//   - index.html loads css/styles.css?v=<hash> and js/main.js?v=<hash>
//   - every relative import inside the modules is rewritten to
//     module.js?v=<hash>, including dynamic import() and the simulation
//     worker's new URL(...). (An import map would be simpler, but browsers
//     ignore import maps inside workers.)
// A module's hash covers its own text with its imports already rewritten, so
// it changes exactly when the module or anything it imports changes.
// Run it on a copy of the site before publishing (the GitHub Pages workflow
// does this), never on the source tree you commit:
//
//   node tools/stamp.mjs --root _site                                   # fingerprints only
//   node tools/stamp.mjs --root _site --site https://you.github.io/repo/  # + absolute preview-image URLs

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : '');
const root = arg('--root') || new URL('..', import.meta.url).pathname;
const read = (file) => readFileSync(join(root, file), 'utf8');
const digest = (text) => createHash('sha256').update(text).digest('hex').slice(0, 10);
const hashFile = (file) => digest(readFileSync(join(root, file)));

function walk(dir) {
  return readdirSync(join(root, dir)).flatMap((f) => {
    const p = join(dir, f);
    return statSync(join(root, p)).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}

// from './x.js' · import './x.js' · import('./x.js') · new URL('./x.js', import.meta.url)
const SPEC = /(\bfrom\s*|\bimport\s*\(?\s*|\bnew URL\(\s*)(['"])(\.{1,2}\/[^'"?]+?\.js)(?:\?v=\w+)?\2/g;

const modules = walk('js').sort();
const stamped = {}; // module path -> rewritten source
const version = {}; // module path -> hash
const visiting = new Set();

function stamp(file) {
  if (version[file]) return version[file];
  if (visiting.has(file)) throw new Error(`Import cycle through ${file}: fingerprints need an acyclic graph.`);
  visiting.add(file);
  const src = read(file).replace(SPEC, (all, pre, q, spec) => {
    const target = posix.normalize(posix.join(dirname(file), spec));
    if (!modules.includes(target)) throw new Error(`${file} imports missing ${spec}`);
    return `${pre}${q}${spec}?v=${stamp(target)}${q}`;
  });
  visiting.delete(file);
  stamped[file] = src;
  version[file] = digest(src);
  return version[file];
}

modules.forEach(stamp);
for (const m of modules) if (stamped[m] !== read(m)) writeFileSync(join(root, m), stamped[m]);

let html = read('index.html');
html = html.replace(/(<script type="module" src=")js\/main\.js(\?v=\w+)?"/, `$1js/main.js?v=${version['js/main.js']}"`);

// Let the browser fetch every module in parallel instead of discovering them
// one import level at a time (the worker's modules too: they land in the HTTP
// cache before the worker asks). The QR decoder is loaded on demand, so it is
// left out.
const preload = modules
  .filter((m) => m !== 'js/main.js' && !m.startsWith('js/vendor/'))
  .map((m) => `  <link rel="modulepreload" href="${m}?v=${version[m]}">`)
  .join('\n');
html = html.replace(/(\n  <link rel="modulepreload"[^>]*>)+/g, '');
html = html.replace(/(\n  <!-- tools\/stamp\.mjs adds modulepreload links here[^>]*-->)/, `$1\n${preload}`);
html = html.replace(/(<link rel="stylesheet" href=")css\/styles\.css(\?v=\w+)?"/, `$1css/styles.css?v=${hashFile('css/styles.css')}"`);

const site = arg('--site');
if (site) {
  const base = site.endsWith('/') ? site : `${site}/`;
  // Chat apps only show a preview image from an absolute URL.
  html = html.replace(/(<meta property="og:image" content=")[^"]*"/, `$1${base}og-image.jpg?v=${hashFile('og-image.jpg')}"`);
  html = html.replace(/(<meta name="twitter:image" content=")[^"]*"/, `$1${base}og-image.jpg?v=${hashFile('og-image.jpg')}"`);
  if (/<meta property="og:url"/.test(html)) html = html.replace(/(<meta property="og:url" content=")[^"]*"/, `$1${base}"`);
  else html = html.replace(/(<meta property="og:type"[^>]*>)/, `$1\n  <meta property="og:url" content="${base}">`);
}

writeFileSync(join(root, 'index.html'), html);
console.log(`Stamped ${modules.length} modules, styles and entry point${site ? ` for ${site}` : ''}.`);
