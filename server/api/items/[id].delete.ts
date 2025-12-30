import { defineEventHandler } from 'h3';
import { requireAuth } from '../../utils/auth';
import { itemStore } from '../../utils/itemStore';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const id = event.context.params?.id;
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Item id is required' });
  }

  const removed = await itemStore.remove(id);
  if (!removed) {
    throw createError({ statusCode: 404, statusMessage: 'Item not found' });
  }

  return { deleted: true, id };
});
