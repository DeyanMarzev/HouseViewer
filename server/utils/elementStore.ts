import { promises as fs } from 'fs';
import path from 'path';
import type { ElementRecord, ElementSyncInput, ElementUpdateInput } from '../types/elements';

const dataDir = path.resolve(process.cwd(), 'server/data');
const dataFile = path.join(dataDir, 'elements.json');

const ensureDataFile = async () => {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, '[]', 'utf-8');
  }
};

const readElements = async (): Promise<ElementRecord[]> => {
  await ensureDataFile();
  try {
    const raw = await fs.readFile(dataFile, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to read elements file', err);
    return [];
  }
};

const writeElements = async (elements: ElementRecord[]) => {
  await ensureDataFile();
  await fs.writeFile(dataFile, JSON.stringify(elements, null, 2), 'utf-8');
};

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
    return readElements();
  },

  async sync(inputs: ElementSyncInput[]) {
    const elements = await readElements();
    const byGuid = new Map(elements.map((element) => [element.guid, element]));
    const now = new Date().toISOString();
    const updated: ElementRecord[] = [];

    inputs.forEach((input) => {
      const normalized = normalizeSyncInput(input);
      if (!normalized.guid) return;

      const existing = byGuid.get(normalized.guid);
      const nextSoftwareOriginator =
        existing?.softwareOriginator || normalized.softwareOriginator || '';
      if (existing) {
        const changed =
          existing.revitId !== normalized.revitId ||
          existing.name !== normalized.name ||
          existing.type !== normalized.type ||
          existing.material !== normalized.material ||
          existing.softwareOriginator !== nextSoftwareOriginator;
        const record: ElementRecord = {
          ...existing,
          revitId: normalized.revitId || existing.revitId,
          name: normalized.name,
          type: normalized.type,
          material: normalized.material,
          softwareOriginator: nextSoftwareOriginator,
          updatedAt: changed ? now : existing.updatedAt
        };
        byGuid.set(record.guid, record);
        updated.push(record);
      } else {
        const record: ElementRecord = {
          ...normalized,
          yearAdded: '',
          softwareOriginator: normalized.softwareOriginator || '',
          comment: '',
          createdAt: now
        };
        byGuid.set(record.guid, record);
        updated.push(record);
      }
    });

    await writeElements(Array.from(byGuid.values()));
    return updated;
  },

  async update(guid: string, input: ElementUpdateInput) {
    const elements = await readElements();
    const idx = elements.findIndex((element) => element.guid === guid);
    if (idx === -1) return null;

    const existing = elements[idx];
    const normalized = normalizeUpdateInput(input);
    const updated: ElementRecord = {
      ...existing,
      yearAdded: normalized.yearAdded ?? existing.yearAdded,
      softwareOriginator: normalized.softwareOriginator ?? existing.softwareOriginator,
      comment: normalized.comment ?? existing.comment,
      updatedAt: new Date().toISOString()
    };

    elements[idx] = updated;
    await writeElements(elements);
    return updated;
  }
};
