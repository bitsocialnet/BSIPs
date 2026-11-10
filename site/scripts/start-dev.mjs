// `yarn start`: the Astro dev server behind portless at https://bsips.localhost, like 5chan and
// bitsocial-web. On a branch other than master, or when bsips.localhost is taken, the branch becomes a
// subdomain (https://<branch>.bsips.localhost). With PORTLESS=0, or where portless is unavailable, it
// runs Astro directly on localhost.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { get as httpsGet } from 'node:https';
import net from 'node:net';
import { delimiter, join } from 'node:path';

const APP_NAME = 'bsips';
const isWindows = process.platform === 'win32';
const binDir = join(process.cwd(), 'node_modules', '.bin');
const suffix = isWindows ? '.cmd' : '';
const portlessBin = join(binDir, `portless${suffix}`);
const astroBin = join(binDir, `astro${suffix}`);
const usePortless = process.env.PORTLESS !== '0' && !isWindows && existsSync(portlessBin);
const proxyPort = process.env.PORTLESS_PORT || '443';
const astroArgs = ['dev', '--root', 'site'];

const env = { ...process.env, PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}` };
const portlessEnv = {
  ...env,
  PORTLESS_PORT: proxyPort,
  PORTLESS_HTTPS: process.env.PORTLESS_HTTPS ?? '1',
  PORTLESS_LAN: process.env.PORTLESS_LAN ?? '0',
};

const sanitizeLabel = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

function currentBranch() {
  const result = spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() || null : null;
}

function activeRouteHosts() {
  const result = spawnSync(portlessBin, ['list'], { encoding: 'utf8', env: portlessEnv });
  if (result.status !== 0) return new Set();
  const urls = result.stdout.match(/https?:\/\/[a-z0-9.-]+\.localhost(?::\d+)?/g) ?? [];
  return new Set(urls.map((url) => new URL(url).hostname));
}

function portlessAppName() {
  const hosts = activeRouteHosts();
  const busy = (name) => hosts.has(`${name}.localhost`);
  const branch = currentBranch();
  const branchName = `${sanitizeLabel(branch || 'current')}.${APP_NAME}`;
  const preferred = (branch && branch !== 'master' && branch !== 'main') || busy(APP_NAME) ? branchName : APP_NAME;
  if (!busy(preferred)) return preferred;
  for (let n = 2; n < 1000; n += 1) {
    if (!busy(`${preferred}-${n}`)) return `${preferred}-${n}`;
  }
  return `${preferred}-${Date.now()}`;
}

function portIsFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port);
  });
}

async function waitForUrl(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const ready = await new Promise((resolve) => {
      const request = httpsGet(url, { rejectUnauthorized: false }, (response) => {
        response.resume();
        resolve((response.statusCode ?? 500) < 400);
      });
      request.on('error', () => resolve(false));
      request.setTimeout(2_000, () => {
        request.destroy();
        resolve(false);
      });
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function openInBrowser(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : isWindows ? ['cmd', ['/c', 'start', '""', url]] : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
}

let child;
if (usePortless) {
  const proxy = spawnSync(portlessBin, ['proxy', 'start', '--port', proxyPort, '--https'], { env: portlessEnv, stdio: 'inherit' });
  if (proxy.status !== 0) process.exit(proxy.status ?? 1);

  const appName = portlessAppName();
  const url = `https://${appName}.localhost${proxyPort === '443' ? '' : `:${proxyPort}`}`;
  console.log(`Starting the BSIPs site at ${url}`);
  child = spawn(portlessBin, [appName, 'astro', ...astroArgs], { stdio: 'inherit', env: portlessEnv });

  if (process.env.BROWSER !== 'none') {
    waitForUrl(url, 60_000)
      .then(() => openInBrowser(url))
      .catch((error) => console.warn(`Could not open ${url}: ${error.message}`));
  }
} else {
  let port = Number(process.env.PORT) || 4321;
  while (!(await portIsFree(port))) port += 1;
  if (process.env.PORTLESS !== '0') console.warn('portless is unavailable here, so Astro runs directly.');
  console.log(`Starting the BSIPs site at http://localhost:${port}`);
  child = spawn(astroBin, [...astroArgs, '--host', '127.0.0.1', '--port', String(port)], { stdio: 'inherit', env });
}

// Pass a stop signal sent to this launcher alone (kill, a process manager) on to the dev server, so Astro or portless
// does not keep running and holding the route. portless cleans up (stops its detached Astro, frees the route) only on
// SIGINT and SIGTERM, so it gets SIGHUP as SIGTERM. A closed terminal also hangs up portless directly, which this
// cannot cover. Ctrl-C already reaches the child through the process group, and a repeated SIGINT is harmless.
const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const forward = (signal) => child.kill(usePortless && signal === 'SIGHUP' ? 'SIGTERM' : signal);
for (const signal of signals) process.on(signal, forward);

child.on('exit', (code, signal) => {
  for (const s of signals) process.off(s, forward);
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
