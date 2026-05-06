import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("extension contributes a change-mask command in the Folder File Filter view", () => {
  const packageJson = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8"));
  const commands = packageJson.contributes.commands as Array<{ command: string; title: string }>;
  const viewTitle = packageJson.contributes.menus["view/title"] as Array<{ command: string; when: string }>;
  const commandPalette = packageJson.contributes.menus["commandPalette"] as Array<{ command: string; when: string }>;

  assert.ok(
    commands.some((command) =>
      command.command === "folderFileFilter.changeMask"
      && command.title === "Folder File Filter: Change Mask"
    )
  );
  assert.ok(viewTitle.some((item) =>
    item.command === "folderFileFilter.changeMask"
    && item.when === "view == folderFileFilter.results"
  ));
  assert.ok(commandPalette.every((item) => item.command !== "folderFileFilter.changeMask"));
});

test("extension contributes an explicit source folder command in the results view", () => {
  const packageJson = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8"));
  const commands = packageJson.contributes.commands as Array<{ command: string; title: string }>;
  const viewTitle = packageJson.contributes.menus["view/title"] as Array<{ command: string; when: string }>;
  const extensionSource = readFileSync(resolve(__dirname, "../../src/extension.ts"), "utf8");

  assert.ok(commands.some((command) =>
    command.command === "folderFileFilter.changeSourceFolder"
    && command.title === "Folder File Filter: Change Source Folder"
  ));
  assert.ok(viewTitle.some((item) =>
    item.command === "folderFileFilter.changeSourceFolder"
    && item.when === "view == folderFileFilter.results"
  ));
  assert.match(extensionSource, /vscode\.commands\.registerCommand\("folderFileFilter\.changeSourceFolder"/);
  assert.match(extensionSource, /public async changeSourceFolder\(\): Promise<void>/);
  assert.match(extensionSource, /const sourceFolder = await this\.activeExplorerSourceFolder\(\);/);
  assert.match(extensionSource, /await this\.search\(sourceFolder, mask, "manual"\);/);
});

test("source changes use the active Explorer resource without opening a system folder dialog", () => {
  const extensionSource = readFileSync(resolve(__dirname, "../../src/extension.ts"), "utf8");

  assert.doesNotMatch(extensionSource, /showOpenDialog|promptForSourceFolder/);
  assert.match(extensionSource, /const CLIPBOARD_PROBE_TEXT = "__folder_file_filter_clipboard_probe__";/);
  assert.match(extensionSource, /await vscode\.env\.clipboard\.writeText\(CLIPBOARD_PROBE_TEXT\)/);
  assert.match(extensionSource, /if \(copiedText === CLIPBOARD_PROBE_TEXT\) \{/);
  assert.match(extensionSource, /private async activeExplorerSourceFolder\(\): Promise<vscode\.Uri \| undefined>/);
  assert.match(extensionSource, /vscode\.commands\.executeCommand\("workbench\.files\.action\.focusFilesExplorer"\)/);
  assert.match(extensionSource, /vscode\.commands\.executeCommand\("copyFilePath"\)/);
  assert.match(extensionSource, /await vscode\.env\.clipboard\.writeText\(previousClipboard\)\.then\(undefined, \(\) => undefined\)/);
});

test("extension renders the active mask as an editable tree item", () => {
  const extensionSource = readFileSync(resolve(__dirname, "../../src/extension.ts"), "utf8");

  assert.match(extensionSource, /interface FilterNode/);
  assert.match(extensionSource, /kind: "filter"/);
  assert.match(extensionSource, /command: "folderFileFilter\.changeMask"/);
  assert.match(extensionSource, /label: `Mask: \$\{this\.mask\}\$\{countText\}`/);
});

test("active filters keep file count on the mask row instead of duplicating tree view message", () => {
  const extensionSource = readFileSync(resolve(__dirname, "../../src/extension.ts"), "utf8");

  assert.match(extensionSource, /private resultCount: number \| undefined/);
  assert.match(extensionSource, /this\.resultCount = files\.length/);
  assert.match(extensionSource, /const countText = this\.resultCount === undefined \? "" : ` \(\$\{this\.resultCount\}\)`/);
  assert.doesNotMatch(extensionSource, /this\.treeView\.message = `\$\{this\.mask\} in/);
});

test("clear keeps the last source folder available for opening the mask picker", () => {
  const extensionSource = readFileSync(resolve(__dirname, "../../src/extension.ts"), "utf8");

  assert.match(extensionSource, /public clear\(\): void \{\s+this\.mask = undefined;\s+this\.filterOrigin = undefined;\s+this\.resultCount = undefined;/s);
  assert.doesNotMatch(extensionSource, /public clear\(\): void \{\s+this\.sourceFolder = undefined;/s);
  assert.doesNotMatch(extensionSource, /hasActiveFilter|hasFilterFolder|setContext/);
  assert.match(extensionSource, /const sourceFolder = \(await this\.activeExplorerSourceFolder\(\)\) \?\? \(await this\.activeSourceFolder\(\)\) \?\? this\.sourceFolder;/);
  assert.match(extensionSource, /const mask = await this\.promptForMask\(this\.mask \?\? configuredDefaultMask\(\), this\.sourceFolder\);/);
  assert.match(extensionSource, /private async activeSourceFolder\(\): Promise<vscode\.Uri \| undefined>/);
  assert.match(extensionSource, /const uri = activeTabUri\(\) \?\? vscode\.window\.activeTextEditor\?\.document\.uri;/);
  assert.doesNotMatch(extensionSource, /showInformationMessage\("Folder File Filter: no active folder and mask to change\."\)/);
});

test("mask picker shows folder extensions before generic preset patterns", () => {
  const packageJson = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8"));
  const extensionSource = readFileSync(resolve(__dirname, "../../src/extension.ts"), "utf8");
  const defaults = packageJson.contributes.configuration.properties["folderFileFilter.maskPresets"].default as string[];

  assert.deepEqual(defaults, [
    "**/*",
    "*.*",
    "**/*.*",
    "**/README*",
    "**/test*",
    "**/*test*",
    "**/*.test.*",
    "**/*.spec.*",
    "**/__tests__/**",
    "**/docs/**",
    "**/src/**",
    "**/*-backup*",
    "**/*_backup*"
  ]);
  assert.match(extensionSource, /folderExtensionMasks: readonly string\[\]/);
  assert.match(extensionSource, /await this\.folderExtensionMasksFor\(sourceFolder\)/);
  assert.match(extensionSource, /addMaskSection\(items, added, "Existing in this folder", folderExtensionMasks, "Folder extension"\)/);
});
