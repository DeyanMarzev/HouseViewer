import { defineEventHandler, readBody } from 'h3';
import type { ItemInput } from '../../types/items';
import { requireAuth } from '../../utils/auth';
import { itemStore } from '../../utils/itemStore';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const id = event.context.params?.id;
  const body = await readBody<ItemInput>(event);

  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload' });
  }

  if (body.position) {
    const coords = body.position;
    const validCoords =
      typeof coords.x === 'number' && typeof coords.y === 'number' && typeof coords.z === 'number';
    if (!validCoords) {
      throw createError({ statusCode: 400, statusMessage: 'Position must include numeric x, y, z' });
    }
  }

  const updated = id ? await itemStore.update(id, body) : null;
  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Item not found' });
  }

  return { item: updated };
});
