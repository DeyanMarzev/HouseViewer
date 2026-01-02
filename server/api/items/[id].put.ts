import { defineEventHandler, readBody } from 'h3';
import type { ItemInput } from '../../types/items';
import { requireEditor } from '../../utils/auth';
import { normalizePositionInput, normalizeRoomsInput } from '../../utils/itemParsing.js';
import { itemStore } from '../../utils/itemStore';

export default defineEventHandler(async (event) => {
  requireEditor(event);
  const id = event.context.params?.id;
  const body = await readBody<ItemInput>(event);

  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload' });
  }

  const update: Partial<ItemInput> = {};
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'Name must be a non-empty string' });
    }
    update.name = body.name.trim();
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string') {
      throw createError({ statusCode: 400, statusMessage: 'Description must be a string' });
    }
    update.description = body.description;
  }
  if (body.url !== undefined) {
    if (typeof body.url !== 'string') {
      throw createError({ statusCode: 400, statusMessage: 'URL must be a string' });
    }
    update.url = body.url;
  }
  if (body.dateAdded !== undefined) {
    if (typeof body.dateAdded !== 'string') {
      throw createError({ statusCode: 400, statusMessage: 'Date added must be a string' });
    }
    update.dateAdded = body.dateAdded;
  }

  const rooms = normalizeRoomsInput(body.rooms);
  if (rooms === null) {
    throw createError({ statusCode: 400, statusMessage: 'Rooms must be an array of strings' });
  }
  if (rooms !== undefined) update.rooms = rooms;

  const position = normalizePositionInput(body.position);
  if (body.position !== undefined && !position) {
    throw createError({ statusCode: 400, statusMessage: 'Position must include numeric x, y, z' });
  }
  if (position) update.position = position;

  const updated = id ? await itemStore.update(id, update) : null;
  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Item not found' });
  }

  return { item: updated };
});
