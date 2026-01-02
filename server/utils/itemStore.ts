import { nanoid } from 'nanoid';
import type { ItemInput, ItemRecord } from '../types/items';
import { ensureSchema, getSql } from './db';
import { parsePositionValue, parseRoomsValue } from './itemParsing.js';

const toItemRecord = (row: any): ItemRecord => ({
  id: String(row.id),
  name: row.name || '',
  description: row.description || '',
  url: row.url || '',
  dateAdded: row.date_added || '',
  rooms: parseRoomsValue(row.rooms),
  position: parsePositionValue(row.position),
  createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined
});

export const itemStore = {
  async list() {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`SELECT * FROM items ORDER BY created_at ASC;`;
    return rows.map(toItemRecord);
  },

  async add(input: ItemInput) {
    await ensureSchema();
    const sql = getSql();
    const record: ItemRecord = {
      id: nanoid(10),
      name: input.name,
      description: input.description || '',
      url: input.url || '',
      dateAdded: input.dateAdded || new Date().toISOString().slice(0, 10),
      rooms: input.rooms || [],
      position: input.position,
      createdAt: new Date().toISOString()
    };
    const rows = await sql`
      INSERT INTO items (
        id,
        name,
        description,
        url,
        date_added,
        rooms,
        position,
        created_at
      )
      VALUES (
        ${record.id},
        ${record.name},
        ${record.description},
        ${record.url},
        ${record.dateAdded},
        ${JSON.stringify(record.rooms)}::jsonb,
        ${JSON.stringify(record.position)}::jsonb,
        ${record.createdAt}
      )
      RETURNING *;
    `;
    return rows[0] ? toItemRecord(rows[0]) : record;
  },

  async update(id: string, input: Partial<ItemInput>) {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      UPDATE items
      SET
        name = COALESCE(${input.name ?? null}, name),
        description = COALESCE(${input.description ?? null}, description),
        url = COALESCE(${input.url ?? null}, url),
        date_added = COALESCE(${input.dateAdded ?? null}, date_added),
        rooms = COALESCE(${input.rooms !== undefined ? JSON.stringify(input.rooms) : null}::jsonb, rooms),
        position = COALESCE(${input.position !== undefined ? JSON.stringify(input.position) : null}::jsonb, position),
        updated_at = ${new Date().toISOString()}
      WHERE id = ${id}
      RETURNING *;
    `;
    if (!rows[0]) return null;
    return toItemRecord(rows[0]);
  },

  async remove(id: string) {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`DELETE FROM items WHERE id = ${id} RETURNING id;`;
    return rows.length > 0;
  },

  async clear() {
    await ensureSchema();
    const sql = getSql();
    await sql`DELETE FROM items;`;
  }
};
