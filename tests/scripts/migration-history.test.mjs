import assert from "node:assert/strict";
import test from "node:test";
import { validateHistory } from "../../scripts/migration-history.mjs";

test("an applied migration cannot be removed from the release", () => {
  assert.throws(
    () =>
      validateHistory([], [{ name: "001_first.sql", checksum: "known-hash" }]),
    /history/i,
  );
});

test("edited and reordered applied migrations are rejected", () => {
  const applied = [
    { name: "001_first.sql", checksum: "first" },
    { name: "002_second.sql", checksum: "second" },
  ];
  assert.throws(
    () =>
      validateHistory(
        [{ name: "001_first.sql", checksum: "changed" }],
        applied,
      ),
    /history/i,
  );
  assert.throws(
    () => validateHistory([...applied].reverse(), applied),
    /history/i,
  );
});

test("an unchanged applied prefix allows a new migration", () => {
  const first = { name: "001_first.sql", checksum: "first" };
  assert.doesNotThrow(() =>
    validateHistory(
      [first, { name: "002_second.sql", checksum: "second" }],
      [first],
    ),
  );
});
