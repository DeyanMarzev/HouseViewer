import { d as defineEventHandler, r as readBody, c as createError } from '../../nitro/nitro.mjs';
import { nanoid } from 'nanoid';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import 'node:url';

const itemsStore = globalThis.__houseItems || (globalThis.__houseItems = []);
const index_post = defineEventHandler(async (event) => {
  const body = await readBody(event);
  if (!(body == null ? void 0 : body.name) || !body.position) {
    throw createError({ statusCode: 400, statusMessage: "Name and position required" });
  }
  const record = {
    id: nanoid(10),
    name: body.name,
    description: body.description || "",
    url: body.url || "",
    dateAdded: body.dateAdded || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    rooms: body.rooms || [],
    position: body.position,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  itemsStore.push(record);
  return { item: record };
});

export { index_post as default };
//# sourceMappingURL=index.post.mjs.map
