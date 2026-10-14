import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

// Reuse the application's tested adapter when tests share the saved local bridge.
const adapter = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${ts.transpileModule(
  readFileSync(new URL('../../lib/database/local-statement-cleanup.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText}\n})`)(createRequire(import.meta.url), adapter, adapter.exports);

const identifier = value => `"${value.replaceAll('"', '""')}"`;
export function fixtureWriter(pool) {
  const address = pool.options?.connectionString ? new URL(pool.options.connectionString) : null;
  const localBridge = address && ['localhost', '127.0.0.1'].includes(address.hostname) && address.port === '51214';
  if (localBridge) adapter.exports.installLocalStatementCleanup(pool);
  let sequence = 0;
  const query = (text, values = []) => {
    const name = localBridge
      ? `bttb_${process.pid.toString(36)}_${(++sequence).toString(36)}_${randomUUID().replaceAll('-', '').slice(0,16)}`
      : `fixture_${randomUUID().replaceAll('-', '')}`;
    return pool.query({ name, portal: name, text, values });
  };
  async function insertRows(table, rows) {
    if (!rows.length) return;
    const columns = Object.keys(rows[0]);
    if (!columns.length) throw new Error('Fixture rows need columns');
    if (rows.some(row => Object.keys(row).length !== columns.length || columns.some(key => !Object.hasOwn(row, key)))) {
      throw new Error('Fixture rows must have the same columns');
    }
    const batchSize = Math.max(1, Math.min(250, Math.floor(5000 / columns.length)));
    for (let offset = 0; offset < rows.length; offset += batchSize) {
      const values = [];
      const placeholders = rows.slice(offset, offset + batchSize).map(row =>
        `(${columns.map(key => { values.push(row[key]); return `$${values.length}`; }).join(',')})`
      );
      await query(`INSERT INTO ${identifier(table)} (${columns.map(identifier).join(',')}) VALUES ${placeholders.join(',')}`, values);
    }
  }
  return { query, insertRows };
}
