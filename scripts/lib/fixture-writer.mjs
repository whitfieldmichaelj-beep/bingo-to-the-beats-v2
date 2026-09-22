import { randomUUID } from 'node:crypto';

const identifier = value => `"${value.replaceAll('"', '""')}"`;
export function fixtureWriter(pool) {
  const query = (text, values = []) => pool.query({
    name: `fixture_${randomUUID().replaceAll('-', '')}`,
    text,
    values,
  });
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
