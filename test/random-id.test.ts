import assert from 'node:assert/strict';
import test from 'node:test';
import { createRandomId } from '../lib/random-id';

test('createRandomId returns unique UUID-shaped identifiers', () => {
  const first = createRandomId();
  const second = createRandomId();

  assert.match(
    first,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  assert.notEqual(first, second);
});
