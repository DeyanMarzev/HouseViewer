import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizePositionInput,
  normalizeRoomsInput,
  parsePositionValue,
  parseRoomsValue
} from '../server/utils/itemParsing.js';

test('parseRoomsValue returns trimmed string arrays', () => {
  const result = parseRoomsValue([' Kitchen ', '', 'Bedroom', 12]);
  assert.deepEqual(result, ['Kitchen', 'Bedroom']);
});

test('parseRoomsValue handles JSON strings safely', () => {
  assert.deepEqual(parseRoomsValue('["Office","Gym"]'), ['Office', 'Gym']);
  assert.deepEqual(parseRoomsValue('invalid-json'), []);
});

test('parsePositionValue handles objects and JSON strings', () => {
  assert.deepEqual(parsePositionValue({ x: 1, y: 2, z: 3 }), { x: 1, y: 2, z: 3 });
  assert.deepEqual(parsePositionValue('{"x":4,"y":5,"z":6}'), { x: 4, y: 5, z: 6 });
  assert.deepEqual(parsePositionValue('nope'), { x: 0, y: 0, z: 0 });
});

test('normalizeRoomsInput validates input types', () => {
  assert.equal(normalizeRoomsInput(undefined), undefined);
  assert.equal(normalizeRoomsInput('kitchen'), null);
  assert.equal(normalizeRoomsInput(['A', 2]), null);
  assert.deepEqual(normalizeRoomsInput([' A ', '']), ['A']);
});

test('normalizePositionInput validates coordinates', () => {
  assert.equal(normalizePositionInput(undefined), undefined);
  assert.equal(normalizePositionInput({ x: 0, y: 1, z: '2' }), null);
  assert.deepEqual(normalizePositionInput({ x: 1, y: 2, z: 3 }), { x: 1, y: 2, z: 3 });
});
