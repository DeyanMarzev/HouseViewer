import { d as defineEventHandler } from '../../nitro/nitro.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import 'node:url';

const itemsStore = globalThis.__houseItems || (globalThis.__houseItems = []);
const index_get = defineEventHandler(() => {
  return { items: itemsStore };
});

export { index_get as default };
//# sourceMappingURL=index.get.mjs.map
