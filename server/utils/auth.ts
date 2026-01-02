import crypto from 'crypto';
import { H3Event } from 'h3';

type TokenPayload = { email: string; exp: number };

const decodeToken = (token: string) => {
  const raw = Buffer.from(token, 'base64').toString('utf-8');
  const splitIndex = raw.lastIndexOf('.');
  if (splitIndex === -1) return null;
  const payloadPart = raw.slice(0, splitIndex);
  const signature = raw.slice(splitIndex + 1);
  if (!payloadPart || !signature) return null;
  try {
    const payload = JSON.parse(payloadPart) as TokenPayload;
    return { payload, signature, payloadPart };
  } catch {
    return null;
  }
};

const sign = (payloadPart: string, secret: string) =>
  crypto.createHmac('sha256', secret).update(payloadPart).digest('hex');

export const createToken = (email: string, secret: string, ttlMs = 1000 * 60 * 60) => {
  const payload: TokenPayload = { email, exp: Date.now() + ttlMs };
  const payloadPart = JSON.stringify(payload);
  const signature = sign(payloadPart, secret);
  return Buffer.from(`${payloadPart}.${signature}`).toString('base64');
};

export const verifyToken = (token: string | null | undefined, secret: string) => {
  if (!token) return null;
  const decoded = decodeToken(token);
  if (!decoded) return null;
  const { payload, signature, payloadPart } = decoded;
  if (payload.exp < Date.now()) return null;
  const expected = sign(payloadPart, secret);
  const expectedBuf = Buffer.from(expected);
  const sigBuf = Buffer.from(signature);
  if (expectedBuf.length !== sigBuf.length) return null;
  if (!crypto.timingSafeEqual(expectedBuf, sigBuf)) return null;
  return payload;
};

export const requireAuth = (event: H3Event) => {
  const authHeader = event.node.req.headers['authorization'];
  const token = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const bearer = token?.startsWith('Bearer ') ? token.slice(7) : token || null;
  const secret = useRuntimeConfig(event).authSecret;
  const payload = verifyToken(bearer, secret);
  if (!payload) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }
  return payload;
};

export const requireEditor = (event: H3Event) => {
  const payload = requireAuth(event);
  const editorEmail = useRuntimeConfig(event).authEditorEmail;
  if (!editorEmail || payload.email.toLowerCase() !== editorEmail.toLowerCase()) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' });
  }
  return payload;
};
