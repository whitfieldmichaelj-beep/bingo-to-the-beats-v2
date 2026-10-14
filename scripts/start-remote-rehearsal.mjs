import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlayerGateway } from './lib/remote-player-gateway.mjs';
import { buildRemotePlayer } from './build-remote-player.mjs';
import { tunnelExecutable } from './setup-remote-player.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, '.bttb-remote');
const require = createRequire(import.meta.url);
let gateway, connector, ownedBeta, expiry, stopped = false;
async function stop() {
  if (stopped) return; stopped = true; clearTimeout(expiry);
  connector?.kill(); ownedBeta?.kill('SIGTERM');
  gateway?.closeAllConnections(); gateway?.close();
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, stop);
async function health() {
  try { const response = await fetch('http://127.0.0.1:3010/api/beta/health', { signal: AbortSignal.timeout(10000), redirect: 'error' });
    const value = await response.json(); return value.kind === 'bttb-local-private-beta-v1' && value.noLiveCharges === true; } catch { return false; }
}

async function main() {
  const mode = process.argv[2];
  const hours = Number(process.env.BTTB_REMOTE_HOURS || 4);
  if (!Number.isInteger(hours) || hours < 1 || hours > 12) throw new Error('Invitation duration must be 1–12 hours.');
  const expiresAt = Date.now() + hours * 60 * 60 * 1000;
  if (!['--check', '--local', '--share'].includes(mode)) throw new Error('Choose --check, --local (laptop test), or --share (start a private internet invitation).');
  const game = JSON.parse(await fs.readFile(path.join(runtime, 'rehearsal.json'), 'utf8'));
  if (!/^[a-f0-9-]{36}$/.test(game.id) || !/^[A-Z0-9]{4,12}$/.test(game.joinCode)) throw new Error('Choose a saved free practice game before starting.');
  if (!await health()) {
    if (mode === '--check') throw new Error('Start BTTB Private Beta before the rehearsal check.');
    console.log('Starting the existing BTTB private beta in this window…');
    ownedBeta = spawn(process.execPath, [path.join(root, 'scripts/start-private-beta.mjs'), '--no-open'], { cwd: root, stdio: 'inherit', windowsHide: true });
    ownedBeta.on('error', () => { console.error('BTTB could not start.'); void stop(); });
    for (let i = 0; i < 45 && !stopped && !await health(); i++) await new Promise(resolve => setTimeout(resolve, 1000));
    if (stopped || !await health()) throw new Error('The existing BTTB app is not ready. No remote invitation was opened.');
  }
  require('@next/env').loadEnvConfig(root, true, { info() {}, error() {} });
  const { Client } = require('pg');
  const dbUrl = new URL(process.env.DATABASE_URL);
  if (!['127.0.0.1', 'localhost'].includes(dbUrl.hostname)) throw new Error('The rehearsal requires the existing local database.');
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  let saved;
  try {
    await db.connect();
    // Validated UUID/code above; simple-query protocol also works with the saved Prisma bridge.
    saved = (await db.query(`SELECT g."isPractice", g.status, g."maxPlayers", g."playbackConfig", (SELECT COUNT(*)::int FROM "BingoCard" b WHERE b."gameId"=g.id) AS cards FROM "Game" g WHERE g.id='${game.id}' AND g."joinCode"='${game.joinCode}'`)).rows[0];
  } finally { await db.end(); }
  if (!saved || !(saved.isPractice || saved.playbackConfig?.entry?.mode === 'free') || (!saved.isPractice && saved.playbackConfig?.entry?.maxCardsPerPlayer !== 10) || saved.cards < saved.maxPlayers * 10 || saved.maxPlayers > 15 || ['COMPLETED', 'CANCELLED'].includes(saved.status)) throw new Error('Choose an unfinished free game with up to ten cards each, at most fifteen players, and enough cards. No game was changed.');
  if (mode === '--share' || mode === '--check') await fs.access(tunnelExecutable()).catch(() => { throw new Error('The official Cloudflare connector is not installed. Run the remote setup first.'); });
  const assets = await buildRemotePlayer();
  console.log(`PASS free practice ${game.joinCode}: up to ${saved.maxPlayers} players, no live payments; host access stays local`);
  if (mode === '--check') { console.log('READY FOR LOCAL PREVIEW — no public link has been started.'); return; }
  let publicOrigin = mode === '--local' ? 'http://localhost:3030' : null;
  const invite = randomBytes(32).toString('hex');
  gateway = createPlayerGateway({ game, invite, assets, getOrigin: () => publicOrigin, expiresAt });
  gateway.listen(3030, '127.0.0.1'); await once(gateway, 'listening');
  if (mode === '--share') {
    const config = path.join(runtime, 'empty-cloudflare-config.yml');
    await fs.writeFile(config, '{}\n', { mode: 0o600 });
    // Deliberately exclude BTTB/database/host credentials from the connector process.
    const env = Object.fromEntries(['PATH', 'HOME', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
    connector = spawn(tunnelExecutable(), ['tunnel', '--config', config, '--no-autoupdate', '--url', 'http://127.0.0.1:3030', '--metrics', '127.0.0.1:0'], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    await new Promise((resolve, reject) => {
      let output = '', connected = false;
      const timeout = setTimeout(() => reject(new Error('The private internet connection did not become ready. Try again.')), 45000);
      const receive = chunk => { output = (output + chunk.toString()).slice(-16000);
        publicOrigin = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0] || publicOrigin;
        connected ||= output.includes('Registered tunnel connection');
        if (connected && publicOrigin) { clearTimeout(timeout); resolve(); }
      };
      connector.stdout.on('data', receive); connector.stderr.on('data', receive);
      connector.once('error', () => { clearTimeout(timeout); reject(new Error('Unable to start the Cloudflare connector.')); });
      connector.once('exit', () => { clearTimeout(timeout); reject(new Error('The internet connector stopped.')); void stop(); });
    });
  }
  const link = `${publicOrigin}/invite#${invite}`;
  await fs.writeFile(path.join(runtime, 'current-invitation.txt'), `BTTB private rehearsal ${game.joinCode}\n${link}\n\nKeep this entire private link. Reopen it in the same browser to reconnect.\nLink expires in ${hours} hours or when this rehearsal window closes.\n`, { mode: 0o600 });
  console.log(`\n${mode === '--local' ? 'LAPTOP PREVIEW ONLY' : 'PRIVATE PLAYER INVITATION'} — game ${game.joinCode}\n${link}\n\nKeep this window open. Control+C stops this invitation. It expires after ${hours} hours.\nYour DJ Console is http://localhost:3010/dj-console?gameId=${game.id}\n`);
  expiry = setTimeout(() => { console.log('The rehearsal invitation has ended.'); void stop(); }, Math.max(0, expiresAt - Date.now()));
}
main().catch(async error => { console.error(`REHEARSAL STOPPED: ${error.message}`); process.exitCode = 1; await stop(); });
