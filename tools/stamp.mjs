// Fingerprints every script and stylesheet so browsers can never mix old and
// new files after a deploy:
//   - index.html loads css/styles.css?v=<hash> and js/main.js?v=<hash>
//   - an import map points every other module at module.js?v=<hash>
// A file's hash only changes when its content does, so unchanged files stay
// cached. Run it before publishing (the GitHub Pages workflow does this):
//
//   node tools/stamp.mjs                      # fingerprints only
//   node tools/stamp.mjs --site https://you.github.io/repo/   # + absolute preview-image URLs

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const hash = (file) => createHash('sha256').update(readFileSync(join(root, file))).digest('hex').slice(0, 10);

function walk(dir) {
  return readdirSync(join(root, dir)).flatMap((f) => {
    const p = join(dir, f);
    return statSync(join(root, p)).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}

const modules = walk('js').filter((m) => m !== 'js/main.js').sort(); // main.js is the entry point, stamped on its <script> tag
const imports = Object.fromEntries(modules.map((m) => [`./${m}`, `./${m}?v=${hash(m)}`]));
const map = JSON.stringify({ imports }, null, 2).replace(/\n/g, '\n  ');

let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html.replace(
  /<script type="importmap">[\s\S]*?<\/script>/,
  `<script type="importmap">\n  ${map}\n  </script>`,
);
html = html.replace(/(<script type="module" src=")js\/main\.js(\?v=\w+)?"/, `$1js/main.js?v=${hash('js/main.js')}"`);

// Let the browser fetch every module of the start-up graph in parallel
// instead of discovering them one import level at a time. The QR decoder is
// loaded on demand, so it is left out.
const preload = modules
  .filter((m) => !m.startsWith('js/vendor/'))
  .map((m) => `  <link rel="modulepreload" href="${imports[`./${m}`].slice(2)}">`)
  .join('\n');
// (They must come after the import map: a browser ignores an import map
// that appears after any module request has started.)
html = html.replace(/(\n  <link rel="modulepreload"[^>]*>)+/g, '');
html = html.replace(/(<script type="importmap">[\s\S]*?<\/script>)/, `$1\n${preload}`);
html = html.replace(/(<link rel="stylesheet" href=")css\/styles\.css(\?v=\w+)?"/, `$1css/styles.css?v=${hash('css/styles.css')}"`);

const site = process.argv.includes('--site') ? process.argv[process.argv.indexOf('--site') + 1] : '';
if (site) {
  const base = site.endsWith('/') ? site : `${site}/`;
  // Chat apps only show a preview image from an absolute URL.
  html = html.replace(/(<meta property="og:image" content=")[^"]*"/, `$1${base}og-image.jpg?v=${hash('og-image.jpg')}"`);
  html = html.replace(/(<meta name="twitter:image" content=")[^"]*"/, `$1${base}og-image.jpg?v=${hash('og-image.jpg')}"`);
  if (/<meta property="og:url"/.test(html)) html = html.replace(/(<meta property="og:url" content=")[^"]*"/, `$1${base}"`);
  else html = html.replace(/(<meta property="og:type"[^>]*>)/, `$1\n  <meta property="og:url" content="${base}">`);
}

writeFileSync(join(root, 'index.html'), html);
console.log(`Stamped ${modules.length} modules, styles and entry point${site ? ` for ${site}` : ''}.`);
