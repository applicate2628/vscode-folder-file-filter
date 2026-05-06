import * as path from "node:path";
import * as vscode from "vscode";
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
  rememberRecentMask as updatedRecentMasks,
  sortByRelativePath
} from "./filtering";

const VIEW_ID = "folderFileFilter.results";
const DEFAULT_MASK = "**/*";
const DEFAULT_MASK_PRESETS = [
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
];
const DEFAULT_MAX_RESULTS = 500;
const DEFAULT_OPEN_ON_SELECTION = false;
const DEFAULT_AUTO_FILTER_FILES_FROM_SELECTED_FILE = true;
const DEFAULT_AUTO_FILTER_FROM_ACTIVE_FILE = true;
const DEFAULT_RESTORE_FOCUS_AFTER_OPEN_DELAY_MS = 150;
const FOLDER_EXTENSION_MASK_LIMIT = 24;
const RECENT_MASKS_KEY = "folderFileFilter.recentMasks";
const RECENT_MASK_LIMIT = 12;
const CLIPBOARD_PROBE_TEXT = "__folder_file_filter_clipboard_probe__";
const VIEW_FOCUS_COMMAND = `${VIEW_ID}.focus`;
const LIST_FOCUS_DOWN_COMMAND = "list.focusDown";
const LIST_FOCUS_UP_COMMAND = "list.focusUp";
const LIST_SELECT_COMMAND = "list.select";

type FolderFileFilterNode = FilterNode | FileNode | MessageNode;
type FilterOrigin = "manual" | "file";

interface FilterNode {
  kind: "filter";
  label: string;
  description?: string;
}

interface FileNode {
  kind: "file";
  uri: vscode.Uri;
  relativePath: string;
}

interface MessageNode {
  kind: "message";
  label: string;
  description?: string;
}

interface MaskQuickPickItem extends vscode.QuickPickItem {
  mask?: string;
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new FolderFileFilterProvider(context.globalState);
  const treeView = vscode.window.createTreeView(VIEW_ID, {
    treeDataProvider: provider,
    canSelectMany: true,
    showCollapseAll: false
  });
  provider.bindTreeView(treeView);

  context.subscriptions.push(
    provider,
    treeView,
    treeView.onDidChangeSelection(async (event) => {
      await provider.openSelectedFile(event.selection);
    }),
    vscode.commands.registerCommand("folderFileFilter.showMatchingFiles", async (uri?: vscode.Uri) => {
      await provider.showMatchingFiles(uri);
    }),
    vscode.commands.registerCommand("folderFileFilter.showMatchingFilesFromFile", async (uri?: vscode.Uri, selectedUris?: vscode.Uri[]) => {
      await provider.showMatchingFilesFromFile(uri, selectedUris);
    }),
    vscode.commands.registerCommand("folderFileFilter.refresh", async () => {
      await provider.refresh();
    }),
    vscode.commands.registerCommand("folderFileFilter.changeMask", async () => {
      await provider.changeMask();
    }),
    vscode.commands.registerCommand("folderFileFilter.changeSourceFolder", async () => {
      await provider.changeSourceFolder();
    }),
    vscode.commands.registerCommand("folderFileFilter.clear", () => {
      provider.clear();
    }),
    vscode.commands.registerCommand("folderFileFilter.openSettings", async () => {
      await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:applicate2628.vscode-folder-file-filter");
    }),
    vscode.commands.registerCommand("folderFileFilter.openResult", async (node?: FolderFileFilterNode) => {
      await provider.openContextFiles(node);
    }),
    vscode.commands.registerCommand("folderFileFilter.openResultToSide", async (node?: FolderFileFilterNode) => {
      await provider.openContextFilesToSide(node);
    }),
    vscode.commands.registerCommand("folderFileFilter.revealResultInOS", async (node?: FolderFileFilterNode) => {
      await provider.revealContextFileInOS(node);
    }),
    vscode.commands.registerCommand("folderFileFilter.copyResultPath", async (node?: FolderFileFilterNode) => {
      await provider.copyContextFilePaths(node);
    }),
    vscode.commands.registerCommand("folderFileFilter.copyResultRelativePath", async (node?: FolderFileFilterNode) => {
      await provider.copyContextFileRelativePaths(node);
    }),
    vscode.commands.registerCommand("folderFileFilter.focusDownAndSelect", async () => {
      await provider.focusAndSelect(LIST_FOCUS_DOWN_COMMAND);
    }),
    vscode.commands.registerCommand("folderFileFilter.focusUpAndSelect", async () => {
      await provider.focusAndSelect(LIST_FOCUS_UP_COMMAND);
    }),
    vscode.window.tabGroups.onDidChangeTabs(async (event) => {
      if (event.opened.some((tab) => tab.isActive) || event.changed.some((tab) => tab.isActive)) {
        await provider.showMatchingFilesFromActiveTab();
      }
    }),
    vscode.window.tabGroups.onDidChangeTabGroups(async (event) => {
      if (event.opened.some((group) => group.isActive) || event.changed.some((group) => group.isActive)) {
        await provider.showMatchingFilesFromActiveTab();
      }
    }),
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      await provider.showMatchingFilesFromActiveFile(editor?.document.uri);
    })
  );

  void provider.showMatchingFilesFromActiveTab();
}

export function deactivate(): void {
  // No resources to release.
}

class FolderFileFilterProvider implements vscode.TreeDataProvider<FolderFileFilterNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<FolderFileFilterNode | undefined>();
  private readonly focusRestoreTimers = new Set<ReturnType<typeof setTimeout>>();
  private nodes: FolderFileFilterNode[] = [
    {
      kind: "message",
      label: "No filter active",
      description: "Right-click a folder and choose Folder File Filter: Show Matching Files."
    }
  ];
  private treeView: vscode.TreeView<FolderFileFilterNode> | undefined;
  private sourceFolder: vscode.Uri | undefined;
  private mask: string | undefined;
  private filterOrigin: FilterOrigin | undefined;
  private resultCount: number | undefined;
  private lastSelectionKeys = new Set<string>();

  public readonly onDidChangeTreeData = this.changed.event;

  public constructor(private readonly state: vscode.Memento) {}

  public bindTreeView(treeView: vscode.TreeView<FolderFileFilterNode>): void {
    this.treeView = treeView;
    this.updateTreeMessage();
  }

  public dispose(): void {
    for (const timer of this.focusRestoreTimers) {
      clearTimeout(timer);
    }
    this.focusRestoreTimers.clear();
    this.changed.dispose();
  }

  public getTreeItem(node: FolderFileFilterNode): vscode.TreeItem {
    if (node.kind === "message") {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
      item.description = node.description;
      item.contextValue = "folderFileFilter.message";
      item.iconPath = new vscode.ThemeIcon("info");
      return item;
    }

    if (node.kind === "filter") {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
      item.description = node.description;
      item.contextValue = "folderFileFilter.filter";
      item.iconPath = new vscode.ThemeIcon("filter");
      item.tooltip = "Click to change the active Folder File Filter mask.";
      item.command = {
        command: "folderFileFilter.changeMask",
        title: "Change Mask"
      };
      return item;
    }

    const item = new vscode.TreeItem(node.relativePath, vscode.TreeItemCollapsibleState.None);
    item.resourceUri = node.uri;
    item.contextValue = "folderFileFilter.file";
    item.tooltip = node.uri.scheme === "file" ? node.uri.fsPath : node.uri.toString(true);
    item.command = {
      command: "vscode.open",
      title: "Open File",
      arguments: [node.uri]
    };
    return item;
  }

  public getChildren(node?: FolderFileFilterNode): FolderFileFilterNode[] {
    return node ? [] : this.nodes;
  }

  public async openContextFiles(node?: FolderFileFilterNode): Promise<void> {
    const files = this.contextFileNodes(node);
    if (files.length === 0) {
      vscode.window.showInformationMessage("Folder File Filter: no file result selected.");
      return;
    }

    await this.runForContextFiles(files, async (file) => {
      await vscode.commands.executeCommand("vscode.open", file.uri);
    });
  }

  public async openContextFilesToSide(node?: FolderFileFilterNode): Promise<void> {
    const files = this.contextFileNodes(node);
    if (files.length === 0) {
      vscode.window.showInformationMessage("Folder File Filter: no file result selected.");
      return;
    }

    await this.runForContextFiles(files, async (file) => {
      await vscode.commands.executeCommand("vscode.open", file.uri, {
        viewColumn: vscode.ViewColumn.Beside,
        preview: files.length === 1
      });
    });
  }

  public async revealContextFileInOS(node?: FolderFileFilterNode): Promise<void> {
    const [file] = this.contextFileNodes(node);
    if (!file) {
      vscode.window.showInformationMessage("Folder File Filter: no file result selected.");
      return;
    }

    await vscode.commands.executeCommand("revealFileInOS", file.uri);
  }

  public async copyContextFilePaths(node?: FolderFileFilterNode): Promise<void> {
    const files = this.contextFileNodes(node);
    if (files.length === 0) {
      vscode.window.showInformationMessage("Folder File Filter: no file result selected.");
      return;
    }

    const paths = files.map((file) => uriLabel(file.uri)).join("\n");
    await vscode.env.clipboard.writeText(paths);
  }

  public async copyContextFileRelativePaths(node?: FolderFileFilterNode): Promise<void> {
    const files = this.contextFileNodes(node);
    if (files.length === 0) {
      vscode.window.showInformationMessage("Folder File Filter: no file result selected.");
      return;
    }

    const paths = files.map((file) => file.relativePath).join("\n");
    await vscode.env.clipboard.writeText(paths);
  }

  public async openSelectedFile(selection: readonly FolderFileFilterNode[]): Promise<void> {
    if (!configuredOpenOnSelection()) {
      return;
    }

    const fileNodes = selection.filter(isFileNode);
    const selectedKeys = fileNodes.map(selectionKeyForNode);
    const keyToOpen = pickSelectionKeyToOpen(this.lastSelectionKeys, selectedKeys);
    this.lastSelectionKeys = new Set(selectedKeys);

    const node = fileNodes.find((item) => selectionKeyForNode(item) === keyToOpen);
    if (!node) {
      return;
    }

    try {
      await vscode.commands.executeCommand("vscode.open", node.uri, {
        preview: true,
        preserveFocus: true
      });
      this.restoreFocusAfterOpen();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Folder File Filter: ${message}`);
    }
  }

  public async focusAndSelect(focusCommand: string): Promise<void> {
    await vscode.commands.executeCommand(focusCommand);

    if (configuredOpenOnSelection()) {
      await vscode.commands.executeCommand(LIST_SELECT_COMMAND);
    }
  }

  public async showMatchingFiles(uri?: vscode.Uri): Promise<void> {
    const sourceFolder = uri
      ? await this.sourceFolderFromUri(uri)
      : (await this.activeExplorerSourceFolder()) ?? (await this.activeSourceFolder());
    if (!sourceFolder) {
      vscode.window.showWarningMessage("Folder File Filter: select a folder or file in Explorer first.");
      return;
    }

    const mask = await this.promptForMask(this.mask ?? configuredDefaultMask(), sourceFolder);
    if (!mask) {
      return;
    }

    await this.search(sourceFolder, mask, "manual");
  }

  public async showMatchingFilesFromFile(uri?: vscode.Uri, selectedUris?: readonly vscode.Uri[]): Promise<void> {
    if (!uri) {
      vscode.window.showWarningMessage("Folder File Filter: right-click a file in Explorer first.");
      return;
    }

    const targets = collectSelectedUris(uri, selectedUris);
    const fileUris: vscode.Uri[] = [];

    for (const target of targets) {
      if (!(await isDirectory(target))) {
        fileUris.push(target);
      }
    }

    if (fileUris.length === 0) {
      if (await isDirectory(uri)) {
        await this.showMatchingFiles(uri);
        return;
      }

      vscode.window.showWarningMessage("Folder File Filter: selected Explorer item is not a file.");
      return;
    }

    const sourceFolder = parentFolderUri(fileUris[0]);
    const inferredMask = inferMaskFromFileNames(fileUris.map(fileNameFromUri));
    const mask = configuredAutoFilterFilesFromSelectedFile()
      ? inferredMask
      : await this.promptForMask(inferredMask, sourceFolder);
    if (!mask) {
      return;
    }

    await this.search(sourceFolder, mask, "file");
  }

  public async showMatchingFilesFromActiveTab(): Promise<void> {
    await this.showMatchingFilesFromActiveFile(activeTabUri());
  }

  public async showMatchingFilesFromActiveFile(uri?: vscode.Uri): Promise<void> {
    if (!configuredAutoFilterFromActiveFile() || !uri || uri.scheme !== "file" || await isDirectory(uri)) {
      return;
    }

    const sourceFolder = parentFolderUri(uri);
    const inferredMask = inferMaskFromFileName(fileNameFromUri(uri));
    if (this.isCurrentFileFilter(sourceFolder, inferredMask)) {
      return;
    }

    await this.searchIfChanged(sourceFolder, inferredMask, "file");
  }

  public async refresh(): Promise<void> {
    if (!this.sourceFolder || !this.mask) {
      vscode.window.showInformationMessage("Folder File Filter: no active folder and mask to refresh.");
      return;
    }

    await this.search(this.sourceFolder, this.mask, this.filterOrigin ?? "manual");
  }

  public async changeMask(): Promise<void> {
    const sourceFolder = (await this.activeExplorerSourceFolder()) ?? (await this.activeSourceFolder()) ?? this.sourceFolder;
    if (!sourceFolder) {
      vscode.window.showWarningMessage("Folder File Filter: select a folder or file in Explorer first.");
      return;
    }

    this.sourceFolder = sourceFolder;
    const mask = await this.promptForMask(this.mask ?? configuredDefaultMask(), this.sourceFolder);
    if (!mask) {
      return;
    }

    await this.search(this.sourceFolder, mask, "manual");
  }

  public async changeSourceFolder(): Promise<void> {
    const sourceFolder = await this.activeExplorerSourceFolder();
    if (!sourceFolder) {
      vscode.window.showWarningMessage("Folder File Filter: select a folder or file in Explorer first.");
      return;
    }

    const mask = await this.promptForMask(this.mask ?? configuredDefaultMask(), sourceFolder);
    if (!mask) {
      return;
    }

    await this.search(sourceFolder, mask, "manual");
  }

  public clear(): void {
    this.mask = undefined;
    this.filterOrigin = undefined;
    this.resultCount = undefined;
    this.lastSelectionKeys.clear();
    this.nodes = [
      {
        kind: "message",
        label: "No filter active",
        description: "Right-click a folder and choose Folder File Filter: Show Matching Files."
      }
    ];
    this.updateTreeMessage();
    this.changed.fire(undefined);
  }

  private async search(sourceFolder: vscode.Uri, mask: string, origin: FilterOrigin): Promise<void> {
    this.sourceFolder = sourceFolder;
    this.mask = mask;
    this.filterOrigin = origin;
    this.resultCount = undefined;
    this.lastSelectionKeys.clear();
    this.nodes = this.withFilterNode([
      {
        kind: "message",
        label: "Searching...",
        description: `${mask} in ${folderLabel(sourceFolder)}`
      }
    ]);
    this.updateTreeMessage();
    this.changed.fire(undefined);

    try {
      const maxResults = configuredMaxResults();
      const pattern = new vscode.RelativePattern(sourceFolder, mask);
      const matches = await vscode.workspace.findFiles(pattern, undefined, maxResults);
      const files = sortByRelativePath(
        matches.map((match): FileNode => ({
          kind: "file",
          uri: match,
          relativePath: relativePathFrom(sourceFolder, match)
        }))
      );

      this.resultCount = files.length;
      this.nodes = this.withFilterNode(files.length > 0
        ? files
        : [
            {
              kind: "message",
              label: "No matching files",
              description: `${mask} in ${folderLabel(sourceFolder)}`
            }
          ]);
      this.updateTreeMessage();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.resultCount = undefined;
      this.nodes = this.withFilterNode([
        {
          kind: "message",
          label: "Search failed",
          description: message
        }
      ]);
      this.updateTreeMessage();
      vscode.window.showErrorMessage(`Folder File Filter: ${message}`);
    } finally {
      this.changed.fire(undefined);
    }
  }

  private async searchIfChanged(sourceFolder: vscode.Uri, mask: string, origin: FilterOrigin): Promise<void> {
    if (this.sourceFolder && sameUri(this.sourceFolder, sourceFolder) && this.mask === mask) {
      return;
    }

    await this.search(sourceFolder, mask, origin);
  }

  private async promptForMask(defaultMask: string, sourceFolder?: vscode.Uri): Promise<string | undefined> {
    const folderExtensionMasks = sourceFolder ? await this.folderExtensionMasksFor(sourceFolder) : [];
    const mask = await promptForMask(defaultMask, this.recentMasks(), configuredMaskPresets(), folderExtensionMasks);
    if (mask) {
      await this.state.update(RECENT_MASKS_KEY, updatedRecentMasks(this.recentMasks(), mask, RECENT_MASK_LIMIT));
    }

    return mask;
  }

  private async activeSourceFolder(): Promise<vscode.Uri | undefined> {
    const uri = activeTabUri() ?? vscode.window.activeTextEditor?.document.uri;
    if (!uri || uri.scheme !== "file" || await isDirectory(uri)) {
      return undefined;
    }

    return this.sourceFolderFromUri(uri);
  }

  private async activeExplorerSourceFolder(): Promise<vscode.Uri | undefined> {
    let previousClipboard: string | undefined;

    try {
      previousClipboard = await vscode.env.clipboard.readText();
      await vscode.env.clipboard.writeText(CLIPBOARD_PROBE_TEXT);
      await vscode.commands.executeCommand("workbench.files.action.focusFilesExplorer");
      await vscode.commands.executeCommand("copyFilePath");
      const copiedText = await vscode.env.clipboard.readText();
      if (copiedText === CLIPBOARD_PROBE_TEXT) {
        return undefined;
      }

      const copiedPath = firstCopiedPath(copiedText);
      if (!copiedPath || !path.isAbsolute(copiedPath)) {
        return undefined;
      }

      return this.sourceFolderFromUri(vscode.Uri.file(copiedPath));
    } catch {
      return undefined;
    } finally {
      if (previousClipboard !== undefined) {
        await vscode.env.clipboard.writeText(previousClipboard).then(undefined, () => undefined);
      }
      executeViewFocus();
    }
  }

  private async sourceFolderFromUri(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
    if (uri.scheme !== "file") {
      return undefined;
    }

    return await isDirectory(uri) ? uri : parentFolderUri(uri);
  }

  private async folderExtensionMasksFor(sourceFolder: vscode.Uri): Promise<string[]> {
    try {
      const entries = await vscode.workspace.fs.readDirectory(sourceFolder);
      const fileNames = entries
        .filter(([, type]) => (type & vscode.FileType.File) !== 0)
        .map(([name]) => name);
      return inferFolderExtensionMasks(fileNames, FOLDER_EXTENSION_MASK_LIMIT);
    } catch {
      return [];
    }
  }

  private recentMasks(): string[] {
    return normalizeMaskList(this.state.get<unknown>(RECENT_MASKS_KEY), []);
  }

  private withFilterNode(nodes: readonly FolderFileFilterNode[]): FolderFileFilterNode[] {
    if (!this.sourceFolder || !this.mask) {
      return [...nodes];
    }

    const countText = this.resultCount === undefined ? "" : ` (${this.resultCount})`;
    const filterNode: FilterNode = {
      kind: "filter",
      label: `Mask: ${this.mask}${countText}`,
      description: folderLabel(this.sourceFolder)
    };
    return [filterNode, ...nodes];
  }

  private updateTreeMessage(): void {
    if (!this.treeView) {
      return;
    }

    this.treeView.message = undefined;
  }

  private isCurrentFileFilter(sourceFolder: vscode.Uri, inferredMask: string): boolean {
    return Boolean(
      this.sourceFolder
      && this.filterOrigin === "file"
      && sameUri(this.sourceFolder, sourceFolder)
      && this.mask
      && maskIncludes(this.mask, inferredMask)
    );
  }

  private restoreFocusAfterOpen(): void {
    executeViewFocus();

    const delayMs = configuredRestoreFocusAfterOpenDelayMs();
    if (delayMs <= 0) {
      return;
    }

    this.scheduleFocusRestore(delayMs);
    this.scheduleFocusRestore(delayMs * 2);
  }

  private scheduleFocusRestore(delayMs: number): void {
    const timer = setTimeout(() => {
      this.focusRestoreTimers.delete(timer);
      executeViewFocus();
    }, delayMs);
    this.focusRestoreTimers.add(timer);
  }

  private contextFileNodes(node?: FolderFileFilterNode): FileNode[] {
    const selected = this.treeView?.selection.filter(isFileNode) ?? [];
    if (!isFileNode(node)) {
      return selected;
    }

    if (selected.some((selectedNode) => sameUri(selectedNode.uri, node.uri))) {
      return selected;
    }

    return [node];
  }

  private async runForContextFiles(files: readonly FileNode[], action: (file: FileNode) => Thenable<unknown>): Promise<void> {
    for (const file of files) {
      try {
        await action(file);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Folder File Filter: ${message}`);
        return;
      }
    }
  }
}

async function isDirectory(uri: vscode.Uri): Promise<boolean> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    return (stat.type & vscode.FileType.Directory) !== 0;
  } catch {
    return false;
  }
}

async function promptForMask(
  defaultMask: string,
  recentMasks: readonly string[],
  presetMasks: readonly string[],
  folderExtensionMasks: readonly string[]
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const quickPick = vscode.window.createQuickPick<MaskQuickPickItem>();
    const disposables: vscode.Disposable[] = [];
    let settled = false;

    const finish = (value: string | undefined): void => {
      if (settled) {
        return;
      }

      settled = true;
      for (const disposable of disposables) {
        disposable.dispose();
      }
      quickPick.dispose();
      resolve(value);
    };

    const refreshItems = (): void => {
      const items = createMaskQuickPickItems(quickPick.value, defaultMask, recentMasks, presetMasks, folderExtensionMasks);
      quickPick.items = items;
      const activeItem = items.find((item) => item.mask);
      quickPick.activeItems = activeItem ? [activeItem] : [];
    };

    quickPick.title = "Folder File Filter";
    quickPick.placeholder = "Type a glob mask or pick a preset";
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    disposables.push(
      quickPick.onDidChangeValue(refreshItems),
      quickPick.onDidAccept(() => {
        const selected = quickPick.selectedItems[0];
        const mask = normalizeMask(selected?.mask ?? quickPick.value);
        if (!mask) {
          vscode.window.showWarningMessage("Folder File Filter: mask is required.");
          return;
        }

        finish(mask);
      }),
      quickPick.onDidHide(() => {
        finish(undefined);
      })
    );

    refreshItems();
    quickPick.show();
  });
}

function createMaskQuickPickItems(
  inputValue: string,
  defaultMask: string,
  recentMasks: readonly string[],
  presetMasks: readonly string[],
  folderExtensionMasks: readonly string[]
): MaskQuickPickItem[] {
  const items: MaskQuickPickItem[] = [];
  const added = new Set<string>();
  const typedMask = normalizeMask(inputValue);

  if (typedMask) {
    addMaskItem(items, added, typedMask, "Use typed mask", true);
  }

  addMaskSection(items, added, "Existing in this folder", folderExtensionMasks, "Folder extension");
  addMaskSection(items, added, "Current", [defaultMask], "Current mask");
  addMaskSection(items, added, "Recent", recentMasks, "Recent mask");
  addMaskSection(items, added, "Generic patterns", presetMasks, "Pattern");

  return items;
}

function addMaskSection(
  items: MaskQuickPickItem[],
  added: Set<string>,
  label: string,
  masks: readonly string[],
  description: string
): void {
  const sectionItems: MaskQuickPickItem[] = [];

  for (const mask of masks) {
    addMaskItem(sectionItems, added, mask, description);
  }

  if (sectionItems.length === 0) {
    return;
  }

  items.push({ label, kind: vscode.QuickPickItemKind.Separator });
  items.push(...sectionItems);
}

function addMaskItem(
  items: MaskQuickPickItem[],
  added: Set<string>,
  mask: string,
  description: string,
  alwaysShow = false
): void {
  const normalized = normalizeMask(mask);
  if (!normalized || added.has(normalized)) {
    return;
  }

  added.add(normalized);
  items.push({
    label: normalized,
    description,
    mask: normalized,
    alwaysShow
  });
}

function configuredDefaultMask(): string {
  const configured = vscode.workspace.getConfiguration("folderFileFilter").get<string>("defaultMask");
  return normalizeMask(configured ?? DEFAULT_MASK) ?? DEFAULT_MASK;
}

function configuredMaskPresets(): string[] {
  const configured = vscode.workspace.getConfiguration("folderFileFilter").get<unknown>("maskPresets");
  return normalizeMaskList(configured, DEFAULT_MASK_PRESETS);
}

function configuredMaxResults(): number {
  const configured = vscode.workspace.getConfiguration("folderFileFilter").get<unknown>("maxResults");
  return normalizeMaxResults(configured, DEFAULT_MAX_RESULTS);
}

function configuredOpenOnSelection(): boolean {
  const configured = vscode.workspace.getConfiguration("folderFileFilter").get<unknown>("openOnSelection");
  return normalizeOpenOnSelection(configured, DEFAULT_OPEN_ON_SELECTION);
}

function configuredAutoFilterFilesFromSelectedFile(): boolean {
  const configured = vscode.workspace.getConfiguration("folderFileFilter").get<unknown>("autoFilterFilesFromSelectedFile");
  return normalizeAutoFilterFilesFromSelectedFile(configured, DEFAULT_AUTO_FILTER_FILES_FROM_SELECTED_FILE);
}

function configuredAutoFilterFromActiveFile(): boolean {
  const configured = vscode.workspace.getConfiguration("folderFileFilter").get<unknown>("autoFilterFromActiveFile");
  return normalizeAutoFilterFromActiveFile(configured, DEFAULT_AUTO_FILTER_FROM_ACTIVE_FILE);
}

function configuredRestoreFocusAfterOpenDelayMs(): number {
  const configured = vscode.workspace.getConfiguration("folderFileFilter").get<unknown>("restoreFocusAfterOpenDelayMs");
  return normalizeRestoreFocusDelayMs(configured, DEFAULT_RESTORE_FOCUS_AFTER_OPEN_DELAY_MS);
}

function executeViewFocus(): void {
  void vscode.commands.executeCommand(VIEW_FOCUS_COMMAND).then(undefined, () => undefined);
}

function isFileNode(node: FolderFileFilterNode | undefined): node is FileNode {
  return node?.kind === "file";
}

function selectionKeyForNode(node: FileNode): string {
  return node.uri.toString();
}

function uriLabel(uri: vscode.Uri): string {
  return uri.scheme === "file" ? uri.fsPath : uri.toString(true);
}

function parentFolderUri(uri: vscode.Uri): vscode.Uri {
  if (uri.scheme === "file") {
    return vscode.Uri.file(path.dirname(uri.fsPath));
  }

  const normalized = stripTrailingSlash(uri.path);
  const slash = normalized.lastIndexOf("/");
  const parentPath = slash > 0 ? normalized.slice(0, slash) : "/";
  return uri.with({ path: parentPath });
}

function collectSelectedUris(primary: vscode.Uri, selectedUris?: readonly vscode.Uri[]): vscode.Uri[] {
  const candidates = selectedUris && selectedUris.length > 0 ? selectedUris : [primary];
  const seen = new Set<string>();
  const uris: vscode.Uri[] = [];

  for (const candidate of candidates) {
    const key = candidate.toString();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uris.push(candidate);
  }

  return uris;
}

function firstCopiedPath(value: string): string | undefined {
  for (const line of value.split(/\r?\n/)) {
    const candidate = stripSurroundingQuotes(line.trim());
    if (candidate.length > 0) {
      return candidate;
    }
  }

  return undefined;
}

function stripSurroundingQuotes(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\""))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function activeTabUri(): vscode.Uri | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (!input) {
    return undefined;
  }

  if (input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom || input instanceof vscode.TabInputNotebook) {
    return input.uri;
  }

  if (input instanceof vscode.TabInputTextDiff || input instanceof vscode.TabInputNotebookDiff) {
    return input.modified;
  }

  return undefined;
}

function sameUri(left: vscode.Uri, right: vscode.Uri): boolean {
  return left.toString() === right.toString();
}

function maskIncludes(mask: string, inferredMask: string): boolean {
  if (mask === inferredMask) {
    return true;
  }

  if (!mask.startsWith("{") || !mask.endsWith("}")) {
    return false;
  }

  return mask.slice(1, -1).split(",").includes(inferredMask);
}

function fileNameFromUri(uri: vscode.Uri): string {
  if (uri.scheme === "file") {
    return path.basename(uri.fsPath);
  }

  const normalized = stripTrailingSlash(uri.path);
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}

function relativePathFrom(sourceFolder: vscode.Uri, file: vscode.Uri): string {
  if (sourceFolder.scheme === "file" && file.scheme === "file") {
    return path.relative(sourceFolder.fsPath, file.fsPath).replace(/\\/g, "/");
  }

  const basePath = stripTrailingSlash(sourceFolder.path);
  if (sourceFolder.scheme === file.scheme && sourceFolder.authority === file.authority && file.path.startsWith(`${basePath}/`)) {
    return file.path.slice(basePath.length + 1);
  }

  return vscode.workspace.asRelativePath(file, false).replace(/\\/g, "/");
}

function folderLabel(uri: vscode.Uri): string {
  const relative = vscode.workspace.asRelativePath(uri, false);
  if (relative && relative !== uri.fsPath) {
    return relative.replace(/\\/g, "/");
  }

  const normalized = stripTrailingSlash(uri.path);
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
