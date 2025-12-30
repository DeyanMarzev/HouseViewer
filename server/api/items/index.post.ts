import { defineEventHandler, readBody } from 'h3';
import type { ItemInput } from '../../types/items';
import { requireAuth } from '../../utils/auth';
import { itemStore } from '../../utils/itemStore';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const body = await readBody<ItemInput>(event);

  if (!body?.name || !body.position) {
    throw createError({ statusCode: 400, statusMessage: 'Name and position required' });
  }

  const coords = body.position;
  const validCoords =
    coords &&
    typeof coords.x === 'number' &&
    typeof coords.y === 'number' &&
    typeof coords.z === 'number';
  if (!validCoords) {
    throw createError({ statusCode: 400, statusMessage: 'Position must include numeric x, y, z' });
  }

  const record = await itemStore.add(body);
  return { item: record };
});
