import type { ElementRecord, ElementSyncInput, ElementUpdateInput } from '../types/elements';
import { ensureSchema, getSql } from './db';

const toElementRecord = (row: any): ElementRecord => ({
  guid: String(row.guid),
  revitId: Number(row.revit_id),
  name: row.name || '',
  type: row.type || '',
  material: row.material || '',
  yearAdded: row.year_added ?? '',
  softwareOriginator: row.software_originator ?? '',
  comment: row.comment ?? '',
  createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined
});

const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const normalizeSyncInput = (input: ElementSyncInput): ElementSyncInput => ({
  guid: normalizeText(input.guid),
  revitId: Number.isFinite(input.revitId) ? input.revitId : 0,
  name: normalizeText(input.name),
  type: normalizeText(input.type),
  material: normalizeText(input.material),
  softwareOriginator:
    input.softwareOriginator === undefined ? undefined : normalizeText(input.softwareOriginator)
});

const normalizeUpdateInput = (input: ElementUpdateInput): ElementUpdateInput => ({
  yearAdded: input.yearAdded === undefined ? undefined : normalizeText(input.yearAdded),
  softwareOriginator:
    input.softwareOriginator === undefined ? undefined : normalizeText(input.softwareOriginator),
  comment: input.comment === undefined ? undefined : normalizeText(input.comment)
});

export const elementStore = {
  async list() {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`SELECT * FROM elements ORDER BY created_at ASC;`;
    return rows.map(toElementRecord);
  },

  async sync(inputs: ElementSyncInput[]) {
    await ensureSchema();
    const sql = getSql();
    const now = new Date().toISOString();
    const normalizedInputs = inputs
      .map(normalizeSyncInput)
      .filter((input) => !!input.guid);
    const results: ElementRecord[] = [];
    for (const record of normalizedInputs) {
      const softwareOriginator = normalizeText(record.softwareOriginator) || '';
      const rows = await sql`
        INSERT INTO elements (
          guid,
          revit_id,
          name,
          type,
          material,
          software_originator,
          created_at,
          updated_at
        )
        VALUES (
          ${record.guid},
          ${record.revitId},
          ${record.name},
          ${record.type},
          ${record.material},
          ${softwareOriginator},
          ${now},
          ${now}
        )
        ON CONFLICT (guid)
        DO UPDATE SET
          revit_id = EXCLUDED.revit_id,
          name = EXCLUDED.name,
          type = EXCLUDED.type,
          material = EXCLUDED.material,
          software_originator = COALESCE(NULLIF(EXCLUDED.software_originator, ''), elements.software_originator),
          updated_at = ${now}
        RETURNING *;
      `;
      if (rows[0]) {
        results.push(toElementRecord(rows[0]));
      }
    }
    return results;
  },

  async update(guid: string, input: ElementUpdateInput) {
    await ensureSchema();
    const sql = getSql();
    const normalized = normalizeUpdateInput(input);
    const rows = await sql`
      UPDATE elements
      SET
        year_added = COALESCE(${normalized.yearAdded ?? null}, year_added),
        software_originator = COALESCE(${normalized.softwareOriginator ?? null}, software_originator),
        comment = COALESCE(${normalized.comment ?? null}, comment),
        updated_at = ${new Date().toISOString()}
      WHERE guid = ${guid}
      RETURNING *;
    `;
    if (!rows[0]) return null;
    return toElementRecord(rows[0]);
  }
};
