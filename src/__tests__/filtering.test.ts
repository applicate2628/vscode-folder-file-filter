import assert from "node:assert/strict";
import test from "node:test";
import {
  inferFolderExtensionMasks,
  inferMaskFromFileNames,
  inferMaskFromFileName,
  normalizeAutoFilterFromActiveFile,
  normalizeAutoFilterFilesFromSelectedFile,
  normalizeAutoRefreshDebounceMs,
  normalizeAutoRefreshResults,
  normalizeFileSortMode,
  normalizeGroupByExtension,
  normalizeNamedFilters,
  normalizeMaskList,
  normalizeMask,
  normalizeMaxResults,
  normalizeOpenOnSelection,
  normalizeRestoreFocusDelayMs,
  pickSelectionKeyToOpen,
  rememberRecentMask,
  sortFiles,
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

test("normalizeAutoRefreshResults keeps booleans and falls back for invalid values", () => {
  assert.equal(normalizeAutoRefreshResults(true, false), true);
  assert.equal(normalizeAutoRefreshResults(false, true), false);
  assert.equal(normalizeAutoRefreshResults("true", false), false);
});

test("normalizeAutoRefreshDebounceMs keeps positive finite integers", () => {
  assert.equal(normalizeAutoRefreshDebounceMs(250.8, 400), 250);
  assert.equal(normalizeAutoRefreshDebounceMs(0, 400), 400);
  assert.equal(normalizeAutoRefreshDebounceMs(Number.NaN, 400), 400);
});

test("normalizeFileSortMode accepts known sort modes", () => {
  assert.equal(normalizeFileSortMode("path", "name"), "path");
  assert.equal(normalizeFileSortMode("name", "path"), "name");
  assert.equal(normalizeFileSortMode("extension", "path"), "extension");
  assert.equal(normalizeFileSortMode("mtime", "path"), "path");
});

test("normalizeGroupByExtension keeps booleans and falls back for invalid values", () => {
  assert.equal(normalizeGroupByExtension(true, false), true);
  assert.equal(normalizeGroupByExtension(false, true), false);
  assert.equal(normalizeGroupByExtension("true", false), false);
});

test("normalizeNamedFilters trims labels and masks and drops invalid entries", () => {
  assert.deepEqual(
    normalizeNamedFilters([
      { label: " Docs ", mask: " **/*.md " },
      { label: "", mask: "**/*.json" },
      { label: "Tests", mask: "" },
      { label: "Docs", mask: "**/*.txt" },
      42
    ]),
    [{ label: "Docs", mask: "**/*.md" }]
  );
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

test("sortFiles supports path, name, and extension modes", () => {
  const files = [
    { relativePath: "beta/readme.md" },
    { relativePath: "alpha/config.json" },
    { relativePath: "zeta/app.ts" },
    { relativePath: "alpha/app.md" }
  ];

  assert.deepEqual(sortFiles(files, "path").map((file) => file.relativePath), [
    "alpha/app.md",
    "alpha/config.json",
    "beta/readme.md",
    "zeta/app.ts"
  ]);
  assert.deepEqual(sortFiles(files, "name").map((file) => file.relativePath), [
    "alpha/app.md",
    "zeta/app.ts",
    "alpha/config.json",
    "beta/readme.md"
  ]);
  assert.deepEqual(sortFiles(files, "extension").map((file) => file.relativePath), [
    "alpha/config.json",
    "alpha/app.md",
    "beta/readme.md",
    "zeta/app.ts"
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
