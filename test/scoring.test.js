import { test } from 'node:test';
import assert from 'node:assert/strict';
import { e1rm, loadFromPct, beatYourLast, bodyweightScore } from '../src/scoring.js';

test('e1rm', () => {
  assert.equal(e1rm(225, 1), 225);
  assert.equal(e1rm(225, 5), 262.5);
  assert.equal(e1rm(100, 20), e1rm(100, 12));
});
test('loadFromPct rounds down to 5', () => {
  assert.equal(loadFromPct(315, 0.75), 235);
  assert.equal(loadFromPct(null, 0.75), null);
});
test('beatYourLast', () => {
  assert.equal(beatYourLast(110, 100).toFixed(2), '0.10');
  assert.equal(beatYourLast(110, null), null);
});
test('bodyweightScore favors lighter at same total', () => {
  assert.ok(bodyweightScore(800, 150) > bodyweightScore(800, 250));
});
