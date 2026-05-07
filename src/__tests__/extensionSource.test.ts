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

test("extension declares restricted-mode workspace trust support", () => {
  const packageJson = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8"));

  assert.deepEqual(packageJson.capabilities?.untrustedWorkspaces, {
    supported: true,
    description: "Folder File Filter only reads workspace files through VS Code APIs and stores workspace-relative pinned folder metadata."
  });
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
  assert.match(extensionSource, /vscode\.workspace\.getWorkspaceFolder\(uri\)/);
  assert.match(extensionSource, /workspaceFolderForSourceFolder\(sourceFolder\)/);
  assert.match(extensionSource, /!vscode\.workspace\.getWorkspaceFolder\(uri\) \|\| await this\.isWorkspaceDirectory\(uri\)/);
  assert.match(extensionSource, /private async activeSourceFolder\(\): Promise<vscode\.Uri \| undefined> \{\s+const uri = activeTabUri\(\) \?\? vscode\.window\.activeTextEditor\?\.document\.uri;\s+if \(!uri \|\| uri\.scheme !== "file" \|\| !vscode\.workspace\.getWorkspaceFolder\(uri\) \|\| await this\.isWorkspaceDirectory\(uri\)\) \{\s+return undefined;\s+\}\s+return this\.sourceFolderFromUri\(uri\);\s+\}/s);
  assert.match(extensionSource, /private async isWorkspaceDirectory\(uri: vscode\.Uri\): Promise<boolean>/);
  assert.match(extensionSource, /if \(uri\.scheme !== "file" \|\| !vscode\.workspace\.getWorkspaceFolder\(uri\)\) \{\s+return false;\s+\}\s+return isDirectory\(uri\);/s);
  assert.match(extensionSource, /private async sourceFolderFromUri\(uri: vscode\.Uri\): Promise<vscode\.Uri \| undefined>/);
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

test("extension supports saved named filters in the mask picker", () => {
  const packageJson = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8"));
  const commands = packageJson.contributes.commands as Array<{ command: string; title: string }>;
  const properties = packageJson.contributes.configuration.properties as Record<string, unknown>;
  const viewTitle = packageJson.contributes.menus["view/title"] as Array<{ command: string; when: string }>;
  const extensionSource = readFileSync(resolve(__dirname, "../../src/extension.ts"), "utf8");

  assert.ok(commands.some((command) =>
    command.command === "folderFileFilter.saveFilter"
    && command.title === "Folder File Filter: Save Filter"
  ));
  assert.ok(viewTitle.some((item) =>
    item.command === "folderFileFilter.saveFilter"
    && item.when === "view == folderFileFilter.results"
  ));
  assert.ok(properties["folderFileFilter.savedFilters"]);
  assert.match(extensionSource, /vscode\.commands\.registerCommand\("folderFileFilter\.saveFilter"/);
  assert.match(extensionSource, /public async saveCurrentFilter\(\): Promise<void>/);
  assert.match(extensionSource, /configuredSavedFilters\(\)/);
  assert.match(extensionSource, /addNamedFilterSection\(items, added, "Saved filters", namedFilters\)/);
});

test("extension supports workspace-relative pinned folders without persisted absolute paths", () => {
  const packageJson = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8"));
  const commands = packageJson.contributes.commands as Array<{ command: string; title: string }>;
  const viewTitle = packageJson.contributes.menus["view/title"] as Array<{ command: string; when: string }>;
  const viewItemContext = packageJson.contributes.menus["view/item/context"] as Array<{ command: string; when: string }>;
  const commandPalette = packageJson.contributes.menus["commandPalette"] as Array<{ command: string; when: string }>;
  const extensionSource = readFileSync(resolve(__dirname, "../../src/extension.ts"), "utf8");
  const pinnedFolderNodeInterface = extensionSource.match(/interface PinnedFolderNode \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.ok(commands.some((command) =>
    command.command === "folderFileFilter.pinSourceFolder"
    && command.title === "Folder File Filter: Pin Source Folder"
  ));
  assert.ok(commands.some((command) =>
    command.command === "folderFileFilter.unpinFolder"
    && command.title === "Folder File Filter: Unpin Folder"
  ));
  assert.ok(viewTitle.some((item) =>
    item.command === "folderFileFilter.pinSourceFolder"
    && item.when === "view == folderFileFilter.results"
  ));
  assert.ok(viewItemContext.some((item) =>
    item.command === "folderFileFilter.unpinFolder"
    && item.when.includes("folderFileFilter.pinnedFolder")
  ));
  assert.ok(commandPalette.some((item) =>
    item.command === "folderFileFilter.unpinFolder"
    && item.when === "false"
  ));
  assert.match(extensionSource, /const PINNED_FOLDERS_KEY = "folderFileFilter\.pinnedFolders";/);
  assert.match(extensionSource, /this\.workspaceState\.update\(PINNED_FOLDERS_KEY, next\)/);
  assert.match(extensionSource, /workspaceFolderName: workspaceFolder\.name/);
  assert.match(extensionSource, /relativePath: workspaceRelativePath/);
  assert.match(extensionSource, /const pin = this\.storedPinnedFolderFromCommandNode\(node\);/);
  assert.match(extensionSource, /const \[requestedPin\] = normalizePinnedFolders\(\[node\.pin\], 1\);/);
  assert.match(extensionSource, /this\.pinnedFolders\(\)\.find\(\(storedPin\) => samePinnedFolder\(storedPin, requestedPin\)\)/);
  assert.match(extensionSource, /workspaceRelativeFolderPath\(workspaceFolder\.uri, sourceFolder\) === undefined/);
  assert.match(extensionSource, /matchingFolders\.length > 1/);
  assert.match(extensionSource, /private missingPinnedFolderKeys = new Set<string>\(\);/);
  assert.match(extensionSource, /private async probePinnedFolders\(version: number\): Promise<void>/);
  assert.match(extensionSource, /private pinnedResultFiles = new Map<string, FileNode\[\]>\(\);/);
  assert.match(extensionSource, /private async refreshPinnedFolderResults\(mask: string\): Promise<void>/);
  assert.match(extensionSource, /new vscode\.RelativePattern\(sourceFolder, mask\)/);
  assert.match(extensionSource, /children = this\.pinnedResultFilesFor\(pin\)/);
  assert.match(extensionSource, /node\.kind === "group" \|\| node\.kind === "pinnedGroup" \|\| node\.kind === "pinnedFolder"/);
  assert.doesNotMatch(pinnedFolderNodeInterface, /sourceFolder\?: vscode\.Uri;/);
  assert.doesNotMatch(extensionSource, /workspaceState\.update\(PINNED_FOLDERS_KEY, (?:sourceFolder|workspaceFolder|.*fsPath|.*toString)/);
});

test("result action command nodes are resolved from current provider-owned results", () => {
  const extensionSource = readFileSync(resolve(__dirname, "../../src/extension.ts"), "utf8");

  assert.match(extensionSource, /private storedFileNodeFromCommandNode\(node: FolderFileFilterNode \| undefined\): FileNode \| undefined/);
  assert.match(extensionSource, /private ownedFileNodes\(\): FileNode\[\]/);
  assert.match(extensionSource, /\.\.\.\[...this\.pinnedResultFiles\.values\(\)\]\.flat\(\)/);
  assert.match(extensionSource, /this\.ownedFileNodes\(\)\.find\(\(file\) => sameUri\(file\.uri, node\.uri\)\)/);
  assert.match(extensionSource, /const contextNode = this\.storedFileNodeFromCommandNode\(node\);/);
});

test("max results has a runtime and manifest hard cap", () => {
  const packageJson = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8"));
  const properties = packageJson.contributes.configuration.properties as Record<string, Record<string, unknown>>;
  const extensionSource = readFileSync(resolve(__dirname, "../../src/extension.ts"), "utf8");

  assert.equal(properties["folderFileFilter.maxResults"].maximum, 5000);
  assert.match(extensionSource, /const MAX_RESULTS_LIMIT = 5000;/);
  assert.match(extensionSource, /normalizeMaxResults\(configured, DEFAULT_MAX_RESULTS, MAX_RESULTS_LIMIT\)/);
});

test("open-on-selection arrow keybindings only override file rows", () => {
  const packageJson = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8"));
  const keybindings = packageJson.contributes.keybindings as Array<{ command: string; when: string }>;

  for (const command of ["folderFileFilter.focusDownAndSelect", "folderFileFilter.focusUpAndSelect"]) {
    const keybinding = keybindings.find((item) => item.command === command);
    assert.ok(keybinding);
    assert.equal(
      keybinding.when,
      "focusedView == folderFileFilter.results && config.folderFileFilter.openOnSelection && viewItem == folderFileFilter.file"
    );
  }
});

test("extension can sort and group results without replacing the search owner", () => {
  const packageJson = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8"));
  const commands = packageJson.contributes.commands as Array<{ command: string; title: string }>;
  const properties = packageJson.contributes.configuration.properties as Record<string, unknown>;
  const viewTitle = packageJson.contributes.menus["view/title"] as Array<{ command: string; when: string }>;
  const extensionSource = readFileSync(resolve(__dirname, "../../src/extension.ts"), "utf8");

  assert.ok(commands.some((command) => command.command === "folderFileFilter.changeSort"));
  assert.ok(commands.some((command) => command.command === "folderFileFilter.toggleGroupByExtension"));
  assert.ok(viewTitle.some((item) => item.command === "folderFileFilter.changeSort"));
  assert.ok(viewTitle.some((item) => item.command === "folderFileFilter.toggleGroupByExtension"));
  assert.ok(properties["folderFileFilter.sortBy"]);
  assert.ok(properties["folderFileFilter.groupByExtension"]);
  assert.match(extensionSource, /type FolderFileFilterNode = FilterNode \| PinnedFoldersGroupNode \| PinnedFolderNode \| GroupNode \| FileNode \| MessageNode/);
  assert.match(extensionSource, /interface GroupNode/);
  assert.match(extensionSource, /private files: FileNode\[\] = \[\];/);
  assert.match(extensionSource, /public getParent\(node: FolderFileFilterNode\): FolderFileFilterNode \| undefined/);
  assert.match(extensionSource, /vscode\.commands\.registerCommand\("folderFileFilter\.toggleGroupByExtension", async \(\) =>/);
  assert.match(extensionSource, /public async toggleGroupByExtension\(\): Promise<void>/);
  assert.match(extensionSource, /await vscode\.workspace\.getConfiguration\("folderFileFilter"\)\.update\("groupByExtension", next, vscode\.ConfigurationTarget\.Global\)/);
  assert.match(extensionSource, /private rebuildResultNodes\([^)]*\): void/);
  assert.match(extensionSource, /sortFiles\(this\.files, configuredSortBy\(\)\)/);
  assert.match(extensionSource, /groupFilesByExtension\(files\)/);
});

test("extension live-refreshes active filter results through one search pipeline", () => {
  const packageJson = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8"));
  const properties = packageJson.contributes.configuration.properties as Record<string, unknown>;
  const extensionSource = readFileSync(resolve(__dirname, "../../src/extension.ts"), "utf8");

  assert.ok(properties["folderFileFilter.autoRefreshResults"]);
  assert.ok(properties["folderFileFilter.autoRefreshDebounceMs"]);
  assert.match(extensionSource, /private fileWatcher: vscode\.FileSystemWatcher \| undefined/);
  assert.match(extensionSource, /private autoRefreshTimer: ReturnType<typeof setTimeout> \| undefined/);
  assert.match(extensionSource, /vscode\.workspace\.createFileSystemWatcher\(new vscode\.RelativePattern\(this\.sourceFolder, this\.mask\)\)/);
  assert.match(extensionSource, /private scheduleAutoRefresh\(\): void/);
  assert.match(extensionSource, /await this\.search\(sourceFolder, mask, origin, \{ quiet: true \}\)/);
  assert.match(extensionSource, /event\.affectsConfiguration\("folderFileFilter\.autoRefreshResults"\)/);
});
