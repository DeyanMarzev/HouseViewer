import { defineEventHandler, readBody } from 'h3';
import type { ElementSyncInput } from '../../types/elements';
import { requireAuth } from '../../utils/auth';
import { elementStore } from '../../utils/elementStore';

const toSyncInput = (input: ElementSyncInput) => ({
  guid: typeof input.guid === 'string' ? input.guid.trim() : '',
  revitId: typeof input.revitId === 'number' && Number.isFinite(input.revitId) ? input.revitId : 0,
  name: typeof input.name === 'string' ? input.name : '',
  type: typeof input.type === 'string' ? input.type : '',
  material: typeof input.material === 'string' ? input.material : '',
  softwareOriginator:
    typeof input.softwareOriginator === 'string' ? input.softwareOriginator : ''
});

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const body = await readBody<{ elements?: ElementSyncInput[] }>(event);

  if (!body?.elements || !Array.isArray(body.elements)) {
    throw createError({ statusCode: 400, statusMessage: 'Elements array required' });
  }

  const elements = body.elements
    .map(toSyncInput)
    .filter((element) => element.guid.length > 0);

  if (!elements.length) {
    return { elements: [] };
  }

  const records = await elementStore.sync(elements);
  return { elements: records };
});
