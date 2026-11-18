// @ts-check
// Refresh the "lists" part of supplied-names.json from a checkout of bitsocialnet/lists: every string
// in its JSON files that ends in .bso or .eth, such as community addresses and board owners. The
// "owners" part, names that owners sent the maintainers, is kept as it is.
//
// Usage: node assets/bsip-13/collect-list-names.mjs <path to a bitsocialnet/lists checkout>
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
if (!root) {
  console.error('Usage: node assets/bsip-13/collect-list-names.mjs <path to bitsocialnet/lists>');
  process.exit(2);
}
const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' }).trim()) {
  console.error(`${root} has uncommitted changes; the names must come from a published commit`);
  process.exit(1);
}

const names = new Set();
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.jsonc?$/.test(entry.name)) {
      for (const [, name] of readFileSync(path, 'utf8').matchAll(/"([^"\s/\\:]+\.(?:bso|eth))"/gi)) names.add(name);
    }
  }
};
walk(root);

const file = new URL('./supplied-names.json', import.meta.url);
const supplied = JSON.parse(readFileSync(file, 'utf8'));
supplied.lists = {
  repository: 'https://github.com/bitsocialnet/lists',
  commit,
  names: [...names].sort(),
};
writeFileSync(file, JSON.stringify(supplied, null, 2) + '\n');
console.error(`${names.size} names from bitsocialnet/lists at ${commit}`);
