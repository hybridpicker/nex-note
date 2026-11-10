import assert from 'node:assert/strict';
import test from 'node:test';

import { FUZZ_FIXTURES, generateSequence, replayScript, runSequence, shrink } from './support/entry-fuzz.ts';

/*
 * Entry fuzzer, note-entry-mastery gate 1. `npm test` runs a small fixed set. The gate run uses
 * fresh seeds and the full count:
 *
 *   NEX_FUZZ_SEQUENCES=2000 NEX_FUZZ_SEED=$RANDOM npx tsx --test test/entry-fuzz.test.ts
 *
 * NEX_FUZZ_SEQUENCES is the total over all fixtures, NEX_FUZZ_LENGTH the actions per sequence.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fixtures = Object.keys(FUZZ_FIXTURES);
const total = Number(process.env.NEX_FUZZ_SEQUENCES ?? fixtures.length * 2);
const length = Number(process.env.NEX_FUZZ_LENGTH ?? 40);
const baseSeed = Number(process.env.NEX_FUZZ_SEED ?? 20261110);

for (const [fixtureIndex, fixture] of fixtures.entries()) {
  const count = Math.floor(total / fixtures.length) + (fixtureIndex < total % fixtures.length ? 1 : 0);
  test(`entry fuzzer: ${fixture} (${count} sequences of ${length} actions, base seed ${baseSeed})`, { timeout: 0 }, () => {
    for (let index = 0; index < count; index += 1) {
      const seed = baseSeed + fixtureIndex * 100_000 + index;
      const failure = runSequence(fixture, seed, generateSequence(seed, length));
      if (failure) assert.fail(replayScript(shrink(failure)));
    }
  });
}
