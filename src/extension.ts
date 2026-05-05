import * as path from "node:path";
import * as vscode from "vscode";
import {
  inferMaskFromFileNames,
  inferMaskFromFileName,
  normalizeAutoFilterFromActiveFile,
  normalizeAutoFilterFilesFromSelectedFile,
  normalizeMask,
  normalizeMaxResults,
  normalizeOpenOnSelection,
  normalizeRestoreFocusDelayMs,
  pickSelectionKeyToOpen,
  sortByRelativePath
} from "./filtering";

const VIEW_ID = "folderFileFilter.results";
const DEFAULT_MASK = "**/*";
const DEFAULT_MAX_RESULTS = 500;
const DEFAULT_OPEN_ON_SELECTION = false;
const DEFAULT_AUTO_FILTER_FILES_FROM_SELECTED_FILE = true;
const DEFAULT_AUTO_FILTER_FROM_ACTIVE_FILE = true;
const DEFAULT_RESTORE_FOCUS_AFTER_OPEN_DELAY_MS = 150;
const VIEW_FOCUS_COMMAND = `${VIEW_ID}.focus`;
const LIST_FOCUS_DOWN_COMMAND = "list.focusDown";
const LIST_FOCUS_UP_COMMAND = "list.focusUp";
const LIST_SELECT_COMMAND = "list.select";

type FolderFileFilterNode = FileNode | MessageNode;
type FilterOrigin = "manual" | "file";

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

export function activate(context: vscode.ExtensionContext): void {
  const provider = new FolderFileFilterProvider();
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
  private lastSelectionKeys = new Set<string>();

  public readonly onDidChangeTreeData = this.changed.event;

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
    if (!uri) {
      vscode.window.showWarningMessage("Folder File Filter: right-click a folder in Explorer first.");
      return;
    }

    if (!(await isDirectory(uri))) {
      vscode.window.showWarningMessage("Folder File Filter: selected Explorer item is not a folder.");
      return;
    }

    const mask = await promptForMask(this.mask ?? configuredDefaultMask());
    if (!mask) {
      return;
    }

    await this.search(uri, mask, "manual");
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
      : await promptForMask(inferredMask);
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

  public clear(): void {
    this.sourceFolder = undefined;
    this.mask = undefined;
    this.filterOrigin = undefined;
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
    this.lastSelectionKeys.clear();
    this.nodes = [
      {
        kind: "message",
        label: "Searching...",
        description: `${mask} in ${folderLabel(sourceFolder)}`
      }
    ];
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

      this.nodes = files.length > 0
        ? files
        : [
            {
              kind: "message",
              label: "No matching files",
              description: `${mask} in ${folderLabel(sourceFolder)}`
            }
          ];
      this.updateTreeMessage(files.length);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.nodes = [
        {
          kind: "message",
          label: "Search failed",
          description: message
        }
      ];
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

  private updateTreeMessage(resultCount?: number): void {
    if (!this.treeView) {
      return;
    }

    if (!this.sourceFolder || !this.mask) {
      this.treeView.message = undefined;
      return;
    }

    const countText = resultCount === undefined ? "" : ` (${resultCount})`;
    this.treeView.message = `${this.mask} in ${folderLabel(this.sourceFolder)}${countText}`;
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

async function promptForMask(defaultMask: string): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    title: "Folder File Filter",
    prompt: "Glob mask to show from the selected source folder",
    value: defaultMask,
    validateInput: (input) => normalizeMask(input) ? undefined : "Mask is required."
  });

  return value === undefined ? undefined : normalizeMask(value);
}

function configuredDefaultMask(): string {
  const configured = vscode.workspace.getConfiguration("folderFileFilter").get<string>("defaultMask");
  return normalizeMask(configured ?? DEFAULT_MASK) ?? DEFAULT_MASK;
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
