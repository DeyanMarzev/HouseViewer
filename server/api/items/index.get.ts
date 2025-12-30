import { defineEventHandler } from 'h3';
import { requireAuth } from '../../utils/auth';
import { itemStore } from '../../utils/itemStore';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const items = await itemStore.list();
  return { items };
});
