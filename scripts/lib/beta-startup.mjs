import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export const BETA_PORT = 3010;
export const BETA_KEY = 'sk_test_bttb_private_beta_no_charges';
export const BETA_KIND = 'bttb-local-private-beta-v1';

export function privateIPv4(value) {
  if (typeof value !== 'string' || !/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return false;
  const p = value.split('.').map(Number);
  if (p.some(n => n > 255)) return false;
  return p[0] === 10 || (p[0] === 192 && p[1] === 168) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31);
}

export function chooseAddress(interfaces, { requested, configured, preferredInterface } = {}) {
  const entries = Object.entries(interfaces).flatMap(([name, rows]) =>
    (rows || []).filter(row => !row.internal && (row.family === 'IPv4' || row.family === 4) && privateIPv4(row.address))
      .map(row => ({ name, address: row.address })));
  if (requested) {
    if (!entries.some(row => row.address === requested)) throw new Error('The chosen phone address is not a current private-network address on this Mac.');
    return requested;
  }
  const preferred = entries.filter(row => row.name === preferredInterface && !/^(utun|tun|tap|bridge|docker|vbox|vmnet)/i.test(row.name));
  if (preferred.length === 1) return preferred[0].address;
  let configuredHost;
  try { configuredHost = new URL(configured).hostname; } catch { /* A stale URL is not a live network address. */ }
  if (entries.some(row => row.address === configuredHost)) return configuredHost;
  const physical = entries.filter(row => /^(en\d+|eth\d+|wlan\d+|wi-fi|ethernet)$/i.test(row.name));
  const addresses = [...new Set((physical.length ? physical : entries).map(row => row.address))];
  if (addresses.length === 1) return addresses[0];
  throw new Error(addresses.length ? 'More than one private network is active. Choose the network the players will use before starting.' : 'No private Wi-Fi/Ethernet address was found. Connect the Mac and phones to the same trusted network.');
}

export function parseOptions(args) {
  const options = { port: BETA_PORT, check: false, open: true };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') options.check = true;
    else if (args[i] === '--no-open') options.open = false;
    else if (args[i] === '--help') options.help = true;
    else if (args[i] === '--port') {
      const value = args[++i];
      if (!value || !/^\d{4,5}$/.test(value) || Number(value) < 1024 || Number(value) > 65535) throw new Error('Beta port must be a number from 1024 to 65535.');
      options.port = Number(value);
    } else if (args[i] === '--host') {
      const value = args[++i];
      if (!privateIPv4(value)) throw new Error('Beta phone address must be a private IPv4 address.');
      options.host = value;
    } else throw new Error('Unknown beta-startup option. Use --help.');
  }
  return options;
}

export function validateConfiguration(env, nodeVersion) {
  if (Number(nodeVersion.split('.')[0]) < 22) throw new Error('This beta launcher needs the existing Node.js 22 or newer installation. No software was installed.');
  let db;
  try { db = new URL(env.DATABASE_URL); } catch { throw new Error('Local DATABASE_URL is missing or invalid. No database settings were changed.'); }
  if (!['postgres:', 'postgresql:'].includes(db.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(db.hostname)) throw new Error('This no-charge beta launcher only uses a local PostgreSQL database. Hosted database settings were left untouched.');
  for (const name of ['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY', 'BTTB_LOCAL_LIBRARY_OWNER_ID']) {
    if (!env[name]?.trim()) throw new Error(`${name} is not configured. Supported host setup is required before starting.`);
  }
  if ((env.BTTB_PLAYER_SESSION_SECRET?.trim().length || 0) < 32) throw new Error('A player-session secret of at least 32 characters is required. No secret was displayed or generated.');
}

export function betaEnvironment(original, host, port, runId = randomBytes(16).toString('hex')) {
  if (!privateIPv4(host) || !Number.isInteger(port) || port < 1024 || port > 65535 || !/^[a-f0-9]{32}$/.test(runId)) throw new Error('Invalid private-beta launch configuration.');
  return { ...original, NODE_ENV: 'development', BTTB_PHONE_TEST: '1', BTTB_PRIVATE_BETA: '1',
    BTTB_BETA_RUN_ID: runId, BTTB_HOST_SUBSCRIPTIONS_ENABLED: 'false', BTTB_DEV_PAYMENT_BYPASS: 'false',
    STRIPE_SECRET_KEY: BETA_KEY, STRIPE_WEBHOOK_SECRET: `whsec_${randomBytes(32).toString('hex')}`,
    NEXT_PUBLIC_APP_URL: `http://${host}:${port}`, WATCHPACK_POLLING: 'true' };
}

export function sourceFingerprint(root) {
  const hash = createHash('sha256');
  hash.update(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }));
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root }).toString().split('\0');
  for (const file of [...new Set(files)].sort()) {
    if (!file || !/\.(?:tsx?|m?js|json|css|svg|command)$/.test(file) || /(^|\/)\.env/.test(file)) continue;
    hash.update(file);
    try { hash.update(readFileSync(path.join(root, file))); }
    catch { hash.update('<missing>'); }
  }
  return hash.digest('hex');
}

export function redactor(env) {
  const values = Object.entries(env).filter(([key, value]) => /SECRET|PASSWORD|TOKEN|DATABASE_URL/i.test(key) && typeof value === 'string' && value.length >= 8)
    .map(([, value]) => value).sort((a, b) => b.length - a.length);
  return text => {
    let safe = String(text);
    for (const value of values) safe = safe.split(value).join('[redacted]');
    return safe.replace(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]+/g, '[payment key redacted]')
      .replace(/\b(?:postgres|postgresql):\/\/[^\s"']+/g, '[database URL redacted]')
      .replace(/\b(?:whsec|sk_clerk)_[A-Za-z0-9_]+/g, '[secret redacted]');
  };
}

export async function portAvailable(port) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', error => error.code === 'EADDRINUSE' ? resolve(false) : reject(error));
    probe.listen(port, '0.0.0.0', () => probe.close(() => resolve(true)));
  });
}

export async function readReady(port, runId, fetcher = fetch) {
  try {
    const response = await fetcher(`http://localhost:${port}/api/beta/health`, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(4000) });
    if (!response.ok) return false;
    const data = await response.json();
    return data.kind === BETA_KIND && data.runId === runId && data.noLiveCharges === true;
  } catch { return false; }
}

export async function awaitReady(port, runId, isStopped, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (isStopped()) throw new Error('The beta server stopped before it became ready. Review its Terminal message.');
    if (await readReady(port, runId)) return;
    await delay(500);
  }
  throw new Error('Beta startup timed out. Only the newly started beta process will be stopped; the database and other app windows are left alone.');
}
