import { defineEventHandler, readBody } from 'h3';
import type { ElementUpdateInput } from '../../types/elements';
import { requireEditor } from '../../utils/auth';
import { elementStore } from '../../utils/elementStore';

export default defineEventHandler(async (event) => {
  requireEditor(event);
  const guid = event.context.params?.guid;
  if (!guid) {
    throw createError({ statusCode: 400, statusMessage: 'Element guid is required' });
  }

  const body = await readBody<ElementUpdateInput>(event);
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload' });
  }

  const updated = await elementStore.update(guid, body);
  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Element not found' });
  }

  return { element: updated };
});
