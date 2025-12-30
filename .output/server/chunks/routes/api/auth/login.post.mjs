import { d as defineEventHandler, r as readBody, u as useRuntimeConfig, c as createError } from '../../../nitro/nitro.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import 'node:url';

const login_post = defineEventHandler(async (event) => {
  const body = await readBody(event);
  const config = useRuntimeConfig(event);
  const users = config.authUsers || [];
  const match = users.find(
    (u) => u.email.toLowerCase() === body.email.toLowerCase() && u.password === body.password
  );
  if (!match) {
    throw createError({ statusCode: 401, statusMessage: "Invalid credentials" });
  }
  const user = { email: match.email };
  const token = Buffer.from(`${user.email}:${Date.now()}`).toString("base64");
  return { user, token };
});

export { login_post as default };
//# sourceMappingURL=login.post.mjs.map
