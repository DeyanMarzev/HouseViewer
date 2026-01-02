const fallbackPosition = { x: 0, y: 0, z: 0 };

const safeJsonParse = (raw, fallback) => {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const normalizeRoomsArray = (value) =>
  value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);

const parseRoomsValue = (value) => {
  if (Array.isArray(value)) return normalizeRoomsArray(value);
  if (typeof value === 'string') {
    const parsed = safeJsonParse(value, []);
    return Array.isArray(parsed) ? normalizeRoomsArray(parsed) : [];
  }
  return [];
};

const parsePositionValue = (value) => {
  const parsed = typeof value === 'string' ? safeJsonParse(value, null) : value;
  if (!parsed || typeof parsed !== 'object') return { ...fallbackPosition };
  const x = parsed.x;
  const y = parsed.y;
  const z = parsed.z;
  const valid =
    typeof x === 'number' &&
    Number.isFinite(x) &&
    typeof y === 'number' &&
    Number.isFinite(y) &&
    typeof z === 'number' &&
    Number.isFinite(z);
  return valid ? { x, y, z } : { ...fallbackPosition };
};

const normalizeRoomsInput = (value) => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return null;
  return normalizeRoomsArray(value);
};

const normalizePositionInput = (value) => {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object') return null;
  const x = value.x;
  const y = value.y;
  const z = value.z;
  const valid =
    typeof x === 'number' &&
    Number.isFinite(x) &&
    typeof y === 'number' &&
    Number.isFinite(y) &&
    typeof z === 'number' &&
    Number.isFinite(z);
  return valid ? { x, y, z } : null;
};

export {
  parseRoomsValue,
  parsePositionValue,
  normalizeRoomsInput,
  normalizePositionInput
};
