import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMask, normalizeMaxResults, normalizeOpenOnSelection, sortByRelativePath } from "../filtering";

test("normalizeMask trims non-empty masks", () => {
  assert.equal(normalizeMask("  **/*.s2p  "), "**/*.s2p");
});

test("normalizeMask rejects empty masks", () => {
  assert.equal(normalizeMask("   "), undefined);
});

test("normalizeMaxResults keeps positive finite integers", () => {
  assert.equal(normalizeMaxResults(25, 500), 25);
});

test("normalizeMaxResults falls back for invalid values", () => {
  assert.equal(normalizeMaxResults(0, 500), 500);
  assert.equal(normalizeMaxResults(Number.NaN, 500), 500);
  assert.equal(normalizeMaxResults("100", 500), 500);
});

test("normalizeOpenOnSelection keeps booleans and falls back for invalid values", () => {
  assert.equal(normalizeOpenOnSelection(true, false), true);
  assert.equal(normalizeOpenOnSelection(false, true), false);
  assert.equal(normalizeOpenOnSelection("true", false), false);
});

test("sortByRelativePath returns files ordered by relative path", () => {
  const files = [
    { relativePath: "zeta/file.s2p" },
    { relativePath: "alpha/file.s2p" },
    { relativePath: "alpha/next.s2p" }
  ];

  assert.deepEqual(sortByRelativePath(files), [
    { relativePath: "alpha/file.s2p" },
    { relativePath: "alpha/next.s2p" },
    { relativePath: "zeta/file.s2p" }
  ]);
});
