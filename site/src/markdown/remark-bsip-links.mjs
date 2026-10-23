// @ts-check
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The BSIP markdown links to other BSIPs and repo files with relative paths so it reads correctly
// on GitHub. Rewrite those links for the site: BSIP files become site routes, and any other repo
// file points at GitHub. A relative link to a file that does not exist fails the build.

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BSIPS_DIR = path.join(REPO_ROOT, 'BSIPS');
const GITHUB_BLOB = 'https://github.com/bitsocialnet/BSIPs/blob/master/';
const GITHUB_RAW = 'https://raw.githubusercontent.com/bitsocialnet/BSIPs/master/';

const isRelative = (url) => !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(url);

function rewrite(url, fromDir, isImage) {
  const hashIndex = url.indexOf('#');
  const target = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex);
  const resolved = path.resolve(fromDir, decodeURI(target));

  if (!resolved.startsWith(REPO_ROOT) || !existsSync(resolved)) {
    throw new Error(`Broken relative link "${url}" (resolved to ${resolved})`);
  }

  const bsip = path.dirname(resolved) === BSIPS_DIR && /^(bsip-\d+)\.md$/.exec(path.basename(resolved));
  if (bsip && !isImage) return `/${bsip[1]}${hash}`;

  const repoPath = path.relative(REPO_ROOT, resolved).split(path.sep).join('/');
  return (isImage ? GITHUB_RAW : GITHUB_BLOB) + encodeURI(repoPath) + (isImage ? '' : hash);
}

export default function remarkBsipLinks() {
  return (tree, file) => {
    const fromDir = path.dirname(file.path);
    const walk = (node) => {
      if ((node.type === 'link' || node.type === 'image' || node.type === 'definition') && isRelative(node.url)) {
        node.url = rewrite(node.url, fromDir, node.type === 'image');
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}
