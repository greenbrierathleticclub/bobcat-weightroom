// Builds dist-demo/: the whole app running in one browser tab, for sharing as a link.
// Same screens and same store.js; SQLite runs in the browser via sql.js.
//
//   npm pack sql.js@1.10.2 && tar -xzf sql.js-1.10.2.tgz   (once, anywhere)
//   node scripts/build-demo.js path/to/package/dist/sql-asm.js
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-demo');
const sqljs = process.argv[2] || join(root, 'node_modules', 'sql.js', 'dist', 'sql-asm.js');
if (!existsSync(sqljs)) {
  console.error(`Need sql-asm.js from sql.js 1.10.2. Pass its path: node scripts/build-demo.js <path>`);
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
for (const d of ['app/css', 'app/js', 'app/img', 'engine']) mkdirSync(join(out, d), { recursive: true });
const read = (...p) => readFileSync(join(root, ...p), 'utf8');
const write = (p, text) => writeFileSync(join(out, p), text);

// Engine: the real server logic, unchanged.
for (const f of ['store', 'scheme', 'scoring', 'csv', 'tx', 'setup', 'routes', 'demo-data']) copyFileSync(join(root, 'src', `${f}.js`), join(out, 'engine', `${f}.js`));
for (const f of ['boot', 'sqlite-adapter']) copyFileSync(join(root, 'demo-src', `${f}.js`), join(out, 'engine', `${f}.js`));
write('engine/schema.js', `export default ${JSON.stringify(read('src', 'schema.sql'))};\n`);
copyFileSync(sqljs, join(out, 'engine', 'sql-asm.js'));

// Screens: same files, with root paths made relative and the demo shim loaded first.
const relink = (s) => s
  .replace(/(["'(])\/(css|js|img)\//g, '$1$2/')
  .replace(/href="\/tv"/g, 'href="tv.html"')
  .replace(/href="\/coach"/g, 'href="coach.html"')
  .replace(/href="\/rack\/\$\{i \+ 1\}"/g, 'href="rack.html?rack=${i + 1}"');
for (const page of ['rack', 'tv', 'coach']) {
  let html = relink(read('public', `${page}.html`)).replace(/<link rel="manifest"[^>]*>\n?/, '');
  const at = html.indexOf('<link rel="stylesheet"');
  html = html.slice(0, at) + '<script src="js/demo-shim.js"></script>\n' + html.slice(at);
  write(`app/${page}.html`, html);
}
for (const f of ['common', 'rack', 'tv', 'coach']) write(`app/js/${f}.js`, relink(read('public', 'js', `${f}.js`)));
copyFileSync(join(root, 'src', 'scheme.js'), join(out, 'app', 'js', 'scheme.js'));
copyFileSync(join(root, 'demo-src', 'demo-shim.js'), join(out, 'app', 'js', 'demo-shim.js'));
copyFileSync(join(root, 'public', 'img', 'shield.svg'), join(out, 'app', 'img', 'shield.svg'));

// Fonts go inline so the page needs nothing but its own files.
const css = read('public', 'css', 'modern.css').replace(/url\('\/fonts\/([^']+)'\)/g, (_, f) =>
  `url('data:font/ttf;base64,${readFileSync(join(root, 'public', 'fonts', f)).toString('base64')}')`);
write('app/css/modern.css', css);
write('app/css/rack.css', relink(read('public', 'css', 'rack.css')));
copyFileSync(join(root, 'demo-src', 'index.html'), join(out, 'index.html'));

const left = [];
for (const f of ['app/rack.html', 'app/tv.html', 'app/coach.html', 'app/js/common.js', 'app/js/rack.js', 'app/js/tv.js', 'app/js/coach.js']) {
  for (const m of readFileSync(join(out, f), 'utf8').matchAll(/["'`(]\/(?!api\/)[a-z][^"'`)\s]*/g)) left.push(`${f}: ${m[0]}`);
}
if (left.length) console.log('Root paths still in the demo (check these):\n  ' + left.join('\n  '));
console.log(`Built ${out}`);
