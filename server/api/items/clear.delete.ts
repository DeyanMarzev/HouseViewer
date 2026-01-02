import { defineEventHandler } from 'h3';
import { requireEditor } from '../../utils/auth';
import { itemStore } from '../../utils/itemStore';

export default defineEventHandler(async (event) => {
  requireEditor(event);
  await itemStore.clear();
  return { cleared: true, count: 0 };
});
