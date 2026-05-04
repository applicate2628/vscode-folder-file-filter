import assert from "node:assert/strict";
import test from "node:test";
import {
  inferMaskFromFileName,
  normalizeAutoFilterFilesFromSelectedFile,
  normalizeMask,
  normalizeMaxResults,
  normalizeOpenOnSelection,
  sortByRelativePath
} from "../filtering";

test("normalizeMask trims non-empty masks", () => {
  assert.equal(normalizeMask("  **/*.md  "), "**/*.md");
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

test("normalizeAutoFilterFilesFromSelectedFile keeps booleans and falls back for invalid values", () => {
  assert.equal(normalizeAutoFilterFilesFromSelectedFile(true, false), true);
  assert.equal(normalizeAutoFilterFilesFromSelectedFile(false, true), false);
  assert.equal(normalizeAutoFilterFilesFromSelectedFile("true", false), false);
});

test("inferMaskFromFileName uses the selected file extension", () => {
  assert.equal(inferMaskFromFileName("settings.json"), "*.json");
  assert.equal(inferMaskFromFileName("component.test.ts"), "*.ts");
  assert.equal(inferMaskFromFileName(".env"), ".*");
  assert.equal(inferMaskFromFileName("Makefile"), "Makefile");
  assert.equal(inferMaskFromFileName("   "), "*");
});

test("sortByRelativePath returns files ordered by relative path", () => {
  const files = [
    { relativePath: "zeta/file.md" },
    { relativePath: "alpha/file.md" },
    { relativePath: "alpha/next.md" }
  ];

  assert.deepEqual(sortByRelativePath(files), [
    { relativePath: "alpha/file.md" },
    { relativePath: "alpha/next.md" },
    { relativePath: "zeta/file.md" }
  ]);
});
