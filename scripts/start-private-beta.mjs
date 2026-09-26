import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { parseOptions, validateConfiguration, chooseAddress, betaEnvironment, sourceFingerprint, redactor, portAvailable, readReady, awaitReady } from './lib/beta-startup.mjs';

const root = await fs.realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const require = createRequire(path.join(root, 'package.json'));
let scrub = text => String(text), child = null, lease = null, runId = null, stopping = false;
let releaseTimer;

async function releaseLease() {
  if (!lease) return;
  try {
    const owner = JSON.parse(await fs.readFile(path.join(lease, 'owner.json'), 'utf8'));
    if (owner.pid === process.pid && owner.runId === runId) {
      await fs.unlink(path.join(lease, 'owner.json'));
      await fs.rmdir(lease);
    }
  } catch { /* Never remove another launcher's files. */ }
}

function stopOwnedServer() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    // This process group was created by this invocation; never signal a saved PID.
    if (process.platform === 'win32') child.kill('SIGTERM');
    else process.kill(-child.pid, 'SIGTERM');
  } catch (error) { if (error.code !== 'ESRCH') console.error('The beta process could not be stopped automatically. Close its Terminal window.'); }
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  stopOwnedServer();
  releaseTimer = setTimeout(() => {
    console.error('Waiting for the beta process to close. The database and other app processes were not stopped.');
  }, 8000);
  releaseTimer.unref();
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, shutdown);
function alive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

function openDashboard(port) {
  const url = `http://localhost:${port}/dashboard`;
  const browser = spawn('/usr/bin/open', [url], { stdio: 'ignore' });
  browser.on('error', () => console.log(`Open this address in your browser: ${url}`));
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log('BTTB private-beta startup (Mac, trusted local network, no live charges)\n--check: preflight only\n--no-open: do not open a browser\n--port NUMBER: default 3010\n--host PRIVATE_IP: choose a current local interface');
    return;
  }
  if (process.platform !== 'darwin') throw new Error('This supported launcher is currently for macOS. Windows hardware startup has not been verified.');
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  if (pkg.name !== 'bingo-to-the-beats-v2') throw new Error('This is not the expected BTTB project. Nothing was changed.');
  require('@next/env').loadEnvConfig(root, true, { info() {}, error() {} });
  scrub = redactor(process.env);
  validateConfiguration(process.env, process.versions.node);
  await fs.access(path.join(root, 'app/generated/prisma/client.ts'));
  const next = require.resolve('next/dist/bin/next');
  let preferredInterface;
  try { preferredInterface = execFileSync('/sbin/route', ['-n', 'get', 'default'], { encoding: 'utf8', timeout: 3000 }).match(/interface:\s+(\S+)/)?.[1]; } catch { /* Fall back to current private interfaces, not stale configured IPs. */ }
  const host = chooseAddress(os.networkInterfaces(), { requested: options.host, configured: process.env.NEXT_PUBLIC_APP_URL, preferredInterface });
  const env = betaEnvironment(process.env, host, options.port);
  runId = env.BTTB_BETA_RUN_ID;
  console.log('\nBINGO TO THE BEATS — PRIVATE BETA\nNo live payments. Use a five-player free-practice game.\n');
  console.log('PASS installed project, authentication settings, library-owner setting, and player-session configuration');
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000, query_timeout: 5000 });
  let connection;
  try {
    connection = await pool.connect();
    await connection.query({ name: `bttb_beta_${runId}`, text: 'SELECT 1' });
  } catch { throw new Error('The local database is not responding. It was not reset or restarted. The operator must restore the existing database service before beta startup.'); }
  finally { if (connection) connection.release(true); await pool.end(); }
  console.log('PASS local database responds (read-only check)');
  console.log(`Phone-network address: http://${host}:${options.port}`);
  console.log('Existing .env files and music libraries are unchanged.');
  if (options.check) {
    console.log(`Port ${options.port}: ${(await portAvailable(options.port)) ? 'available' : 'already occupied; normal startup will verify ownership before reusing it'}`);
    console.log('PREFLIGHT COMPLETE — no server started and no browser opened.');
    return;
  }
  const fingerprint = sourceFingerprint(root);
  const identity = createHash('sha256').update(root).digest('hex').slice(0, 20);
  const parent = path.join(os.homedir(), 'Library', 'Application Support', 'BTTB Beta', identity);
  await fs.mkdir(parent, { recursive: true, mode: 0o700 });
  lease = path.join(parent, 'running');
  try { await fs.mkdir(lease, { mode: 0o700 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let owner;
    try { owner = JSON.parse(await fs.readFile(path.join(lease, 'owner.json'), 'utf8')); }
    catch { throw new Error('Another beta launcher is starting or its status needs review. No process was stopped.'); }
    if (alive(owner.pid)) {
      if (owner.root !== root || owner.fingerprint !== fingerprint || owner.host !== host || owner.port !== options.port) throw new Error('A beta session is already open with different source/network settings. Close only that beta Terminal with Control+C, then start it again. No other app was stopped.');
      if (!await readReady(owner.port, owner.runId)) throw new Error('The existing beta session is starting or not responding. Wait for its Terminal message; it was not replaced.');
      console.log('Your existing verified no-charge beta session is already running.');
      if (options.open) openDashboard(owner.port);
      lease = null;
      return;
    }
    // Preserve a stopped launcher's record for diagnosis; never signal its saved PID.
    await fs.rename(lease, path.join(parent, `stale-${Date.now()}-${runId}`));
    await fs.mkdir(lease, { mode: 0o700 });
  }
  await fs.writeFile(path.join(lease, 'owner.json'), JSON.stringify({ version: 1, root, pid: process.pid, runId, port: options.port, host, fingerprint }), { flag: 'wx', mode: 0o600 });
  if (!await portAvailable(options.port)) throw new Error(`Port ${options.port} belongs to another process. It was left alone. No duplicate server was launched.`);
  if (stopping) return;
  child = spawn(process.execPath, [next, 'dev', '--webpack', '--hostname', '0.0.0.0', '--port', String(options.port)], {
    cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  let spawnError = null;
  child.on('error', error => { spawnError = error; });
  const closed = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  for (const stream of [child.stdout, child.stderr]) {
    const lines = createInterface({ input: stream });
    lines.on('line', line => console.log(scrub(line)));
  }
  try {
    await awaitReady(options.port, runId, () => stopping || spawnError || child.exitCode !== null || child.signalCode !== null);
    console.log(`\nREADY — Host: http://localhost:${options.port}/dashboard`);
    console.log(`Players: http://${host}:${options.port}/join`);
    console.log('Keep this Terminal open. Control+C stops only this beta app, not the database or your DJ software.');
    console.log('Use the same trusted network. A phone must still confirm that this address is reachable.');
    if (options.open && !stopping) openDashboard(options.port);
    const result = await closed;
    if (!stopping && result.code !== 0) throw new Error('The beta server stopped unexpectedly. Its existing games remain in the database.');
  } finally {
    stopOwnedServer();
    await closed;
  }
}

try { await main(); }
catch (error) { console.error(`\nBETA STARTUP STOPPED: ${scrub(error.message)}`); process.exitCode = 1; }
finally {
  if (releaseTimer) clearTimeout(releaseTimer);
  await releaseLease();
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.off(signal, shutdown);
}
