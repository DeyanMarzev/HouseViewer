import { defineEventHandler } from 'h3';
import { requireAuth } from '../../utils/auth';
import { itemStore } from '../../utils/itemStore';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  await itemStore.clear();
  return { cleared: true, count: 0 };
});
