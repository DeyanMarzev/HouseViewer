import { defineEventHandler, readBody } from 'h3';
import { createToken } from '../../utils/auth';

type LoginBody = { email: string; password: string };

type AuthUser = { email: string };

export default defineEventHandler(async (event) => {
  const body = await readBody<LoginBody>(event);
  const config = useRuntimeConfig(event);
  const users: { email: string; password: string }[] = config.authUsers || [];

  if (!body || typeof body !== 'object' || !body.email || !body.password) {
    throw createError({ statusCode: 400, statusMessage: 'Email and password are required' });
  }

  const match = users.find(
    (u) => u.email.toLowerCase() === body.email.toLowerCase() && u.password === body.password
  );

  if (!match) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' });
  }

  const user: AuthUser = { email: match.email };
  const token = createToken(user.email, config.authSecret);

  return { user, token };
});
