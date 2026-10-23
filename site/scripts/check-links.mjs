// @ts-check
// Fail the build when a page links to a site page or #anchor that does not exist.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));

const htmlFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? htmlFiles(path.join(dir, d.name)) : d.name.endsWith('.html') ? [path.join(dir, d.name)] : [],
  );

// Map each route (/, /bsip-1, /404) to the set of ids on that page.
const routeOf = (file) => '/' + path.relative(DIST, file).replace(/(^|\/)index\.html$/, '').replace(/\.html$/, '');
const pages = new Map();
for (const file of htmlFiles(DIST)) {
  const html = readFileSync(file, 'utf8');
  pages.set(routeOf(file).replace(/\/$/, '') || '/', { html, ids: new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])) });
}

const broken = [];
for (const [route, { html }] of pages) {
  for (const [, href] of html.matchAll(/\shref="([^"]+)"/g)) {
    if (!href.startsWith('/') && !href.startsWith('#')) continue;
    if (href.startsWith('//')) continue;
    const [pathname, hash] = href.split('#');
    const target = pathname === '' ? route : pathname.replace(/\/$/, '') || '/';
    if (/\.[a-z0-9]+$/i.test(target)) continue; // static files from public/
    const page = pages.get(target);
    if (!page) broken.push(`${route}: ${href} (no such page)`);
    else if (hash && !page.ids.has(decodeURIComponent(hash))) broken.push(`${route}: ${href} (no such anchor)`);
  }
}

if (broken.length) {
  console.error(`Broken internal links:\n  ${broken.join('\n  ')}`);
  process.exit(1);
}
console.log(`Checked internal links across ${pages.size} pages.`);
