import assert from "node:assert/strict";
import test from "node:test";
import {
  inferFolderExtensionMasks,
  inferMaskFromFileNames,
  inferMaskFromFileName,
  normalizeAutoFilterFromActiveFile,
  normalizeAutoFilterFilesFromSelectedFile,
  normalizeMaskList,
  normalizeMask,
  normalizeMaxResults,
  normalizeOpenOnSelection,
  normalizeRestoreFocusDelayMs,
  pickSelectionKeyToOpen,
  rememberRecentMask,
  sortByRelativePath
} from "../filtering";

test("normalizeMask trims non-empty masks", () => {
  assert.equal(normalizeMask("  **/*.md  "), "**/*.md");
});

test("normalizeMask rejects empty masks", () => {
  assert.equal(normalizeMask("   "), undefined);
});

test("normalizeMaskList trims, drops invalid entries, and keeps unique masks", () => {
  assert.deepEqual(
    normalizeMaskList([" **/*.md ", "", 42, "**/*.json", "**/*.md"], ["**/*"]),
    ["**/*.md", "**/*.json"]
  );
});

test("normalizeMaskList falls back when no configured masks remain", () => {
  assert.deepEqual(normalizeMaskList(["", "   "], ["**/*", "*.md"]), ["**/*", "*.md"]);
  assert.deepEqual(normalizeMaskList("**/*.md", ["**/*"]), ["**/*"]);
});

test("rememberRecentMask moves masks to the front and caps history", () => {
  assert.deepEqual(
    rememberRecentMask(["**/*.md", "**/*.json", "**/*.log"], " **/*.json ", 3),
    ["**/*.json", "**/*.md", "**/*.log"]
  );
  assert.deepEqual(
    rememberRecentMask(["**/*.md", "**/*.json", "**/*.log"], "**/*.png", 3),
    ["**/*.png", "**/*.md", "**/*.json"]
  );
});

test("rememberRecentMask ignores empty masks and non-positive limits", () => {
  assert.deepEqual(rememberRecentMask(["**/*.md"], "   ", 5), ["**/*.md"]);
  assert.deepEqual(rememberRecentMask(["**/*.md"], "**/*.json", 0), []);
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

test("normalizeAutoFilterFromActiveFile keeps booleans and falls back for invalid values", () => {
  assert.equal(normalizeAutoFilterFromActiveFile(true, false), true);
  assert.equal(normalizeAutoFilterFromActiveFile(false, true), false);
  assert.equal(normalizeAutoFilterFromActiveFile("true", false), false);
});

test("normalizeRestoreFocusDelayMs keeps non-negative finite numbers and falls back for invalid values", () => {
  assert.equal(normalizeRestoreFocusDelayMs(250.8, 150), 250);
  assert.equal(normalizeRestoreFocusDelayMs(0, 150), 0);
  assert.equal(normalizeRestoreFocusDelayMs(-1, 150), 150);
  assert.equal(normalizeRestoreFocusDelayMs(Number.NaN, 150), 150);
  assert.equal(normalizeRestoreFocusDelayMs("250", 150), 150);
});

test("inferMaskFromFileName uses the selected file extension", () => {
  assert.equal(inferMaskFromFileName("settings.json"), "*.json");
  assert.equal(inferMaskFromFileName("component.test.ts"), "*.ts");
  assert.equal(inferMaskFromFileName(".env"), ".*");
  assert.equal(inferMaskFromFileName("Makefile"), "Makefile");
  assert.equal(inferMaskFromFileName("   "), "*");
});

test("inferMaskFromFileNames combines unique masks in selection order", () => {
  assert.equal(inferMaskFromFileNames(["m_006.s2p", "m_047.son", "m_005.s2p"]), "{*.s2p,*.son}");
});

test("inferMaskFromFileNames returns the single inferred mask for one extension", () => {
  assert.equal(inferMaskFromFileNames(["settings.json", "launch.json"]), "*.json");
});

test("inferMaskFromFileNames falls back when the selection is empty", () => {
  assert.equal(inferMaskFromFileNames([]), "*");
});

test("inferFolderExtensionMasks ranks real folder extensions deterministically", () => {
  assert.deepEqual(
    inferFolderExtensionMasks([
      "notes.son",
      "filter.s2p",
      "candidate.s2p",
      "UPPER.S2P",
      "archive.tar.gz",
      "README",
      ".env"
    ], 10),
    ["*.s2p", "*.gz", "*.son"]
  );
  assert.deepEqual(
    inferFolderExtensionMasks(["a.md", "b.json", "c.md"], 1),
    ["*.md"]
  );
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

test("pickSelectionKeyToOpen prefers the newly selected key", () => {
  assert.equal(
    pickSelectionKeyToOpen(new Set(["a", "b"]), ["a", "b", "c"]),
    "c"
  );
});

test("pickSelectionKeyToOpen falls back to the last selected key", () => {
  assert.equal(
    pickSelectionKeyToOpen(new Set(["a", "b"]), ["a", "b"]),
    "b"
  );
  assert.equal(pickSelectionKeyToOpen(new Set(["a"]), []), undefined);
});
