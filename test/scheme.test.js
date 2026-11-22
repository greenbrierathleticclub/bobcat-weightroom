import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScheme, schemeLabel } from '../src/scheme.js';

test('straight sets', () => {
  const { sets, errors } = parseScheme('5x3@75');
  assert.equal(errors.length, 0);
  assert.equal(sets.length, 5);
  assert.deepEqual(sets[0], { reps: 3, amrap: false, pct: 0.75, lb: null });
  assert.equal(schemeLabel('5x3@75'), '5 × 3 @ 75%');
});
test('wave with amrap', () => {
  const { sets } = parseScheme('3@65, 3@75, 3+@85%');
  assert.equal(sets.length, 3);
  assert.equal(sets[2].amrap, true);
  assert.equal(sets[2].pct, 0.85);
});
test('no load, fixed load, amrap word', () => {
  assert.equal(parseScheme('3x8').sets[0].pct, null);
  assert.equal(parseScheme('2x5@225lb').sets[1].lb, 225);
  assert.equal(parseScheme('1xAMRAP@70').sets[0].amrap, true);
  assert.equal(parseScheme('5 X 5 @ 80 %').sets.length, 5);
});
test('garbage is reported', () => {
  assert.deepEqual(parseScheme('3x8, heavy singles').errors, ['heavy singles']);
});
