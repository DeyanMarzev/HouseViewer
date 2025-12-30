import { promises as fs } from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import type { ItemInput, ItemRecord } from '../types/items';

const dataDir = path.resolve(process.cwd(), 'server/data');
const dataFile = path.join(dataDir, 'items.json');

const ensureDataFile = async () => {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, '[]', 'utf-8');
  }
};

const readItems = async (): Promise<ItemRecord[]> => {
  await ensureDataFile();
  try {
    const raw = await fs.readFile(dataFile, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to read items file', err);
    return [];
  }
};

const writeItems = async (items: ItemRecord[]) => {
  await ensureDataFile();
  await fs.writeFile(dataFile, JSON.stringify(items, null, 2), 'utf-8');
};

export const itemStore = {
  async list() {
    return readItems();
  },

  async add(input: ItemInput) {
    const items = await readItems();
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
    items.push(record);
    await writeItems(items);
    return record;
  },

  async update(id: string, input: Partial<ItemInput>) {
    const items = await readItems();
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return null;

    const existing = items[idx];
    const updated: ItemRecord = {
      ...existing,
      name: input.name ?? existing.name,
      description: input.description ?? existing.description,
      url: input.url ?? existing.url,
      dateAdded: input.dateAdded ?? existing.dateAdded,
      rooms: input.rooms ?? existing.rooms,
      position: input.position ?? existing.position,
      updatedAt: new Date().toISOString()
    };

    items[idx] = updated;
    await writeItems(items);
    return updated;
  },

  async remove(id: string) {
    const items = await readItems();
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return false;
    items.splice(idx, 1);
    await writeItems(items);
    return true;
  },

  async clear() {
    await writeItems([]);
  }
};
