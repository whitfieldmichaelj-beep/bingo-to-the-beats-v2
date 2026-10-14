import { promises as fs } from 'node:fs';
import path from 'node:path';
import { platformPaths } from './platform.mjs';
import { createServer } from 'node:net';

export async function databaseResponds(Pool, connectionString) {
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000, query_timeout: 5000 });
  let connection;
  try {
    connection = await pool.connect();
    await connection.query('SELECT 1');
    return true;
  } catch { return false; }
  finally { if (connection) connection.release(true); await pool.end(); }
}

export function savedDatabaseOptions(connectionString, saved) {
  let url;
  try { url = new URL(connectionString); } catch { throw new Error('The local database configuration is invalid.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Only the existing local database can be started.');
  }
  if (saved?.name !== 'default' || saved?.version !== '1' || Number(url.port) !== saved.databasePort) {
    throw new Error('The saved database does not match this project. Nothing was created or reset.');
  }
  let streamsPort = 51216;
  if (saved.experimental?.streams?.serverUrl) {
    try { streamsPort = Number(new URL(saved.experimental.streams.serverUrl).port); }
    catch { throw new Error('The saved database service settings are invalid.'); }
  }
  const ports = [saved.port, saved.databasePort, saved.shadowDatabasePort, streamsPort];
  if (ports.some(port => !Number.isInteger(port) || port < 1024 || port > 65535) || new Set(ports).size !== ports.length) {
    throw new Error('The saved database ports are invalid. Nothing was changed.');
  }
  return { name: 'default', persistenceMode: 'stateful', debug: false,
    port: saved.port, databasePort: saved.databasePort, shadowDatabasePort: saved.shadowDatabasePort, streamsPort };
}

async function portFree(port) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', error => error.code === 'EADDRINUSE' ? resolve(false) : reject(error));
    probe.listen(port, () => probe.close(() => resolve(true)));
  });
}

// Only called by the operator's launcher. Never creates a replacement database.
export async function ensureSavedDatabase({ connectionString, probe, start, checkOnly = false,
  dataDirectory = platformPaths().database,
  readFile = fs.readFile, access = fs.access, isPortFree = portFree, log = console.log }) {
  if (await probe()) {
    log('PASS saved database is already running');
    return null;
  }
  if (checkOnly) throw new Error('The saved database is stopped. Open the BTTB Private Beta launcher normally to start it. No database changes were made by this check.');
  let saved;
  try {
    saved = JSON.parse(await readFile(path.join(dataDirectory, 'server.json'), 'utf8'));
    await access(path.join(dataDirectory, '.pglite', 'PG_VERSION'));
  } catch { throw new Error('The saved database files could not be read. Nothing was created or reset.'); }
  const options = savedDatabaseOptions(connectionString, saved);
  for (const port of [options.port, options.databasePort, options.shadowDatabasePort, options.streamsPort]) {
    if (!await isPortFree(port)) throw new Error(`Database port ${port} is occupied. No existing service was stopped. Close the older BTTB window and reopen this launcher.`);
  }
  log('Starting your existing saved database. No reset or migration...');
  const server = await start(options);
  try {
    if (!await probe()) throw new Error('The saved database started but its connection check failed.');
    log('PASS saved database is running');
    return server;
  } catch (error) {
    await server.close();
    throw error;
  }
}
