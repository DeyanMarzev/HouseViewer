import { defineEventHandler, readBody } from 'h3';
import type { ItemInput } from '../../types/items';
import { requireEditor } from '../../utils/auth';
import { normalizePositionInput, normalizeRoomsInput } from '../../utils/itemParsing.js';
import { itemStore } from '../../utils/itemStore';

export default defineEventHandler(async (event) => {
  requireEditor(event);
  const body = await readBody<ItemInput>(event);

  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' });
  }

  const position = normalizePositionInput(body?.position);
  if (!position) {
    throw createError({ statusCode: 400, statusMessage: 'Position must include numeric x, y, z' });
  }

  const rooms = normalizeRoomsInput(body?.rooms);
  if (rooms === null) {
    throw createError({ statusCode: 400, statusMessage: 'Rooms must be an array of strings' });
  }

  const record = await itemStore.add({
    name,
    description: typeof body?.description === 'string' ? body.description : undefined,
    url: typeof body?.url === 'string' ? body.url : undefined,
    dateAdded: typeof body?.dateAdded === 'string' ? body.dateAdded : undefined,
    rooms: rooms ?? [],
    position
  });
  return { item: record };
});
