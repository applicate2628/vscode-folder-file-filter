import * as path from "node:path";
import * as vscode from "vscode";
import {
  FileSortMode,
  NamedFilter,
  PinnedFolder,
  inferFolderExtensionMasks,
  inferMaskFromFileNames,
  inferMaskFromFileName,
  normalizeAutoFilterFromActiveFile,
  normalizeAutoFilterFilesFromSelectedFile,
  normalizeAutoRefreshDebounceMs,
  normalizeAutoRefreshResults,
  normalizeFileSortMode,
  normalizeGroupByExtension,
  normalizeMaskList,
  normalizeMask,
  normalizeMaxResults,
  normalizeNamedFilters,
  normalizePinnedFolders,
  normalizeOpenOnSelection,
  normalizeRestoreFocusDelayMs,
  pickSelectionKeyToOpen,
  rememberRecentMask as updatedRecentMasks,
  removePinnedFolder,
  sortFiles,
  upsertPinnedFolder,
  upsertNamedFilter
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
const DEFAULT_AUTO_REFRESH_RESULTS = true;
const DEFAULT_AUTO_REFRESH_DEBOUNCE_MS = 300;
const MAX_RESULTS_LIMIT = 5000;
const DEFAULT_SORT_BY: FileSortMode = "path";
const DEFAULT_GROUP_BY_EXTENSION = false;
const FOLDER_EXTENSION_MASK_LIMIT = 24;
const RECENT_MASKS_KEY = "folderFileFilter.recentMasks";
const RECENT_MASK_LIMIT = 12;
const PINNED_FOLDERS_KEY = "folderFileFilter.pinnedFolders";
const PINNED_FOLDER_LIMIT = 20;
const CLIPBOARD_PROBE_TEXT = "__folder_file_filter_clipboard_probe__";
const VIEW_FOCUS_COMMAND = `${VIEW_ID}.focus`;
type ResultNavigationDirection = "previous" | "next";

type FolderFileFilterNode = FilterNode | PinnedFoldersGroupNode | PinnedFolderNode | GroupNode | FileNode | MessageNode;
type FilterOrigin = "manual" | "file";

interface FilterNode {
  kind: "filter";
  label: string;
  description?: string;
}

interface PinnedFoldersGroupNode {
  kind: "pinnedGroup";
  label: string;
  description?: string;
  children: PinnedFolderNode[];
}

interface PinnedFolderNode {
  kind: "pinnedFolder";
  pin: PinnedFolder;
  label: string;
  description?: string;
  state: "ready" | "missingWorkspace" | "ambiguousWorkspace" | "missingFolder";
  children?: FileNode[];
}

interface GroupNode {
  kind: "group";
  label: string;
  description?: string;
  children: FileNode[];
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
  const provider = new FolderFileFilterProvider(context.globalState, context.workspaceState);
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
    vscode.commands.registerCommand("folderFileFilter.saveFilter", async () => {
      await provider.saveCurrentFilter();
    }),
    vscode.commands.registerCommand("folderFileFilter.pinSourceFolder", async () => {
      await provider.pinSourceFolder();
    }),
    vscode.commands.registerCommand("folderFileFilter.openPinnedFolder", async (node?: FolderFileFilterNode) => {
      await provider.openPinnedFolder(node);
    }),
    vscode.commands.registerCommand("folderFileFilter.unpinFolder", async (node?: FolderFileFilterNode) => {
      await provider.unpinFolder(node);
    }),
    vscode.commands.registerCommand("folderFileFilter.changeSort", async () => {
      await provider.changeSort();
    }),
    vscode.commands.registerCommand("folderFileFilter.toggleGroupByExtension", async () => {
      await provider.toggleGroupByExtension();
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
      await provider.focusAdjacentFile("next");
    }),
    vscode.commands.registerCommand("folderFileFilter.focusUpAndSelect", async () => {
      await provider.focusAdjacentFile("previous");
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
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration("folderFileFilter.sortBy")
        || event.affectsConfiguration("folderFileFilter.groupByExtension")
      ) {
        provider.applyPresentationSettings();
      }
      if (
        event.affectsConfiguration("folderFileFilter.autoRefreshResults")
        || event.affectsConfiguration("folderFileFilter.autoRefreshDebounceMs")
      ) {
        provider.updateAutoRefreshWatcher();
      }
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
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private autoRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  private files: FileNode[] = [];
  private pinnedResultFiles = new Map<string, FileNode[]>();
  private pinnedResultMask: string | undefined;
  private pinnedResultRefreshVersion = 0;
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
  private missingPinnedFolderKeys = new Set<string>();
  private pinnedFolderProbeVersion = 0;

  public readonly onDidChangeTreeData = this.changed.event;

  public constructor(
    private readonly globalState: vscode.Memento,
    private readonly workspaceState: vscode.Memento
  ) {}

  public bindTreeView(treeView: vscode.TreeView<FolderFileFilterNode>): void {
    this.treeView = treeView;
    this.rebuildCurrentNodes({ fire: false });
  }

  public dispose(): void {
    for (const timer of this.focusRestoreTimers) {
      clearTimeout(timer);
    }
    this.focusRestoreTimers.clear();
    this.disposeAutoRefreshWatcher();
    this.clearAutoRefreshTimer();
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

    if (node.kind === "pinnedGroup") {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
      item.description = node.description;
      item.contextValue = "folderFileFilter.pinnedGroup";
      item.iconPath = new vscode.ThemeIcon("pinned");
      return item;
    }

    if (node.kind === "pinnedFolder") {
      const item = new vscode.TreeItem(
        node.label,
        node.children && node.children.length > 0
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.None
      );
      item.description = node.description;
      item.contextValue = node.state === "ready"
        ? "folderFileFilter.pinnedFolder"
        : "folderFileFilter.pinnedFolder.stale";
      item.iconPath = new vscode.ThemeIcon(node.state === "ready" ? "folder" : "warning");
      item.tooltip = pinnedFolderTooltip(node);
      if (node.state === "ready") {
        item.command = {
          command: "folderFileFilter.openPinnedFolder",
          title: "Open Pinned Folder",
          arguments: [node]
        };
      }
      return item;
    }

    if (node.kind === "group") {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
      item.description = node.description;
      item.contextValue = "folderFileFilter.group";
      item.iconPath = new vscode.ThemeIcon("symbol-folder");
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
    if (!node) {
      return this.nodes;
    }

    return node.kind === "group" || node.kind === "pinnedGroup" || node.kind === "pinnedFolder" ? node.children ?? [] : [];
  }

  public getParent(node: FolderFileFilterNode): FolderFileFilterNode | undefined {
    if (isPinnedFolderNode(node)) {
      return this.nodes.find((candidate) =>
        candidate.kind === "pinnedGroup"
        && candidate.children.some((child) => samePinnedFolder(child.pin, node.pin))
      );
    }

    if (!isFileNode(node)) {
      return undefined;
    }

    return this.nodes.find((candidate) =>
      candidate.kind === "group"
      && candidate.children.some((child) => sameUri(child.uri, node.uri))
    ) ?? this.pinnedFolderNodes().find((candidate) =>
      candidate.children?.some((child) => sameUri(child.uri, node.uri))
    );
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

  public async focusAdjacentFile(direction: ResultNavigationDirection): Promise<void> {
    const target = this.adjacentFileForSelection(direction);
    if (!target || !this.treeView) {
      return;
    }

    await this.treeView.reveal(target, {
      select: true,
      focus: true,
      expand: true
    });
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
      if (target.scheme !== "file" || !vscode.workspace.getWorkspaceFolder(target)) {
        continue;
      }

      if (!(await isDirectory(target))) {
        fileUris.push(target);
      }
    }

    if (fileUris.length === 0) {
      if (await this.isWorkspaceDirectory(uri)) {
        await this.showMatchingFiles(uri);
        return;
      }

      vscode.window.showWarningMessage("Folder File Filter: selected Explorer item is not a file.");
      return;
    }

    const sourceFolder = await this.sourceFolderFromUri(fileUris[0]);
    if (!sourceFolder) {
      vscode.window.showWarningMessage("Folder File Filter: selected file is outside the current workspace.");
      return;
    }

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
    if (!configuredAutoFilterFromActiveFile() || !uri || uri.scheme !== "file" || !vscode.workspace.getWorkspaceFolder(uri) || await this.isWorkspaceDirectory(uri)) {
      return;
    }

    const sourceFolder = await this.sourceFolderFromUri(uri);
    if (!sourceFolder) {
      return;
    }

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

  public async saveCurrentFilter(): Promise<void> {
    if (!this.mask) {
      vscode.window.showInformationMessage("Folder File Filter: no active mask to save.");
      return;
    }

    const label = await vscode.window.showInputBox({
      title: "Folder File Filter",
      prompt: "Name this filter",
      value: this.savedFilterLabelForMask(this.mask) ?? ""
    });
    const normalizedLabel = typeof label === "string" ? label.trim() : "";
    if (!normalizedLabel) {
      return;
    }

    const filters = upsertNamedFilter(configuredSavedFilters(), normalizedLabel, this.mask);
    await vscode.workspace.getConfiguration("folderFileFilter").update("savedFilters", filters, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`Folder File Filter: saved filter '${normalizedLabel}'.`);
  }

  public async pinSourceFolder(): Promise<void> {
    const sourceFolder = (await this.activeExplorerSourceFolder()) ?? (await this.activeSourceFolder()) ?? this.sourceFolder;
    if (!sourceFolder) {
      vscode.window.showWarningMessage("Folder File Filter: select a workspace folder or file in Explorer first.");
      return;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(sourceFolder);
    if (workspaceFolder && workspaceFolderNameIsAmbiguous(workspaceFolder.name)) {
      vscode.window.showWarningMessage("Folder File Filter: cannot pin folders while the workspace contains duplicate folder names.");
      return;
    }

    const pin = this.pinForSourceFolder(sourceFolder);
    if (!pin) {
      vscode.window.showWarningMessage("Folder File Filter: only folders inside the current workspace can be pinned.");
      return;
    }

    const current = this.pinnedFolders();
    const next = upsertPinnedFolder(current, pin, PINNED_FOLDER_LIMIT);
    if (next.length === current.length && !current.some((item) => samePinnedFolder(item, pin))) {
      vscode.window.showWarningMessage(`Folder File Filter: pinned folder limit is ${PINNED_FOLDER_LIMIT}.`);
      return;
    }

    await this.workspaceState.update(PINNED_FOLDERS_KEY, next);
    this.missingPinnedFolderKeys.delete(pinnedFolderKey(pin));
    if (this.mask) {
      await this.refreshPinnedFolderResults(this.mask);
    }
    this.rebuildCurrentNodes();
  }

  public async openPinnedFolder(node?: FolderFileFilterNode): Promise<void> {
    const pin = this.storedPinnedFolderFromCommandNode(node);
    if (!pin) {
      vscode.window.showInformationMessage("Folder File Filter: no pinned folder selected.");
      return;
    }

    const resolution = this.resolvePinnedFolder(pin);
    if (resolution.state !== "ready" || !resolution.sourceFolder) {
      vscode.window.showWarningMessage("Folder File Filter: pinned folder is not available in the current workspace.");
      this.rebuildCurrentNodes();
      return;
    }

    const sourceFolder = resolution.sourceFolder;
    if (!await isDirectory(sourceFolder)) {
      this.missingPinnedFolderKeys.add(pinnedFolderKey(pin));
      vscode.window.showWarningMessage("Folder File Filter: pinned folder is no longer available. Unpin it or restore the folder.");
      this.rebuildCurrentNodes();
      return;
    }

    this.missingPinnedFolderKeys.delete(pinnedFolderKey(pin));
    const mask = await this.promptForMask(this.mask ?? configuredDefaultMask(), sourceFolder);
    if (!mask) {
      return;
    }

    await this.search(sourceFolder, mask, "manual");
  }

  public async unpinFolder(node?: FolderFileFilterNode): Promise<void> {
    const pin = this.storedPinnedFolderFromCommandNode(node);
    if (!pin) {
      vscode.window.showInformationMessage("Folder File Filter: no pinned folder selected.");
      return;
    }

    const next = removePinnedFolder(this.pinnedFolders(), pin);
    await this.workspaceState.update(PINNED_FOLDERS_KEY, next);
    this.pinnedResultFiles.delete(pinnedFolderKey(pin));
    this.rebuildCurrentNodes();
  }

  public async changeSort(): Promise<void> {
    const options: Array<vscode.QuickPickItem & { sortBy: FileSortMode }> = [
      { label: "Path", description: "Sort by relative path", sortBy: "path" },
      { label: "Name", description: "Sort by file name", sortBy: "name" },
      { label: "Extension", description: "Sort by file extension", sortBy: "extension" }
    ];
    const current = configuredSortBy();
    const selected = await vscode.window.showQuickPick(
      options.map((item) => ({ ...item, picked: item.sortBy === current })),
      {
        placeHolder: "Choose Folder File Filter result sort order"
      }
    );
    if (!selected) {
      return;
    }

    await vscode.workspace.getConfiguration("folderFileFilter").update("sortBy", selected.sortBy, vscode.ConfigurationTarget.Global);
    this.applyPresentationSettings();
  }

  public async toggleGroupByExtension(): Promise<void> {
    const next = !configuredGroupByExtension();
    await vscode.workspace.getConfiguration("folderFileFilter").update("groupByExtension", next, vscode.ConfigurationTarget.Global);
    this.applyPresentationSettings();
  }

  public applyPresentationSettings(): void {
    this.rebuildCurrentNodes();
  }

  public updateAutoRefreshWatcher(): void {
    this.disposeAutoRefreshWatcher();

    if (!configuredAutoRefreshResults() || !this.sourceFolder || !this.mask || !workspaceFolderForSourceFolder(this.sourceFolder)) {
      return;
    }

    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this.sourceFolder, this.mask));
    watcher.onDidCreate(() => this.scheduleAutoRefresh());
    watcher.onDidChange(() => this.scheduleAutoRefresh());
    watcher.onDidDelete(() => this.scheduleAutoRefresh());
    this.fileWatcher = watcher;
  }

  public clear(): void {
    this.mask = undefined;
    this.filterOrigin = undefined;
    this.resultCount = undefined;
    this.files = [];
    this.pinnedResultMask = undefined;
    this.pinnedResultFiles.clear();
    this.lastSelectionKeys.clear();
    this.disposeAutoRefreshWatcher();
    this.clearAutoRefreshTimer();
    this.nodes = this.withPinnedFolderNodes([
      {
        kind: "message",
        label: "No filter active",
        description: "Right-click a folder and choose Folder File Filter: Show Matching Files."
      }
    ]);
    this.updateTreeMessage();
    this.changed.fire(undefined);
  }

  private async search(
    sourceFolder: vscode.Uri,
    mask: string,
    origin: FilterOrigin,
    options: { quiet?: boolean } = {}
  ): Promise<void> {
    if (!workspaceFolderForSourceFolder(sourceFolder)) {
      vscode.window.showWarningMessage("Folder File Filter: source folder must be inside the current workspace.");
      return;
    }

    this.sourceFolder = sourceFolder;
    this.mask = mask;
    this.filterOrigin = origin;
    this.resultCount = undefined;
    if (!options.quiet) {
      this.lastSelectionKeys.clear();
      this.nodes = this.withRootNodes([
        {
          kind: "message",
          label: "Searching...",
          description: `${mask} in ${folderLabel(sourceFolder)}`
        }
      ]);
      this.updateTreeMessage();
      this.changed.fire(undefined);
    }

    try {
      const maxResults = configuredMaxResults();
      const pattern = new vscode.RelativePattern(sourceFolder, mask);
      const matches = await vscode.workspace.findFiles(pattern, undefined, maxResults);
      const files = matches.map((match): FileNode => ({
        kind: "file",
        uri: match,
        relativePath: relativePathFrom(sourceFolder, match)
      }));

      this.resultCount = files.length;
      this.files = files;
      await this.refreshPinnedFolderResults(mask);
      this.rebuildResultNodes({ fire: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.resultCount = undefined;
      this.files = [];
      this.pinnedResultMask = undefined;
      this.pinnedResultFiles.clear();
      this.nodes = this.withRootNodes([
        {
          kind: "message",
          label: "Search failed",
          description: message
        }
      ]);
      this.updateTreeMessage();
      vscode.window.showErrorMessage(`Folder File Filter: ${message}`);
    } finally {
      this.updateAutoRefreshWatcher();
      this.changed.fire(undefined);
    }
  }

  private async searchIfChanged(sourceFolder: vscode.Uri, mask: string, origin: FilterOrigin): Promise<void> {
    if (this.sourceFolder && sameUri(this.sourceFolder, sourceFolder) && this.mask === mask) {
      return;
    }

    await this.search(sourceFolder, mask, origin);
  }

  private async refreshPinnedFolderResults(mask: string): Promise<void> {
    const version = ++this.pinnedResultRefreshVersion;
    const nextResults = new Map<string, FileNode[]>();
    const maxResults = configuredMaxResults();

    for (const pin of this.pinnedFolders()) {
      const key = pinnedFolderKey(pin);
      const resolution = this.resolvePinnedFolder(pin);
      if (resolution.state !== "ready" || !resolution.sourceFolder) {
        continue;
      }
      const sourceFolder = resolution.sourceFolder;

      if (!await isDirectory(sourceFolder)) {
        this.missingPinnedFolderKeys.add(key);
        continue;
      }

      const matches = await vscode.workspace.findFiles(
        new vscode.RelativePattern(sourceFolder, mask),
        undefined,
        maxResults
      );
      nextResults.set(key, matches.map((match): FileNode => ({
        kind: "file",
        uri: match,
        relativePath: relativePathFrom(sourceFolder, match)
      })));
      this.missingPinnedFolderKeys.delete(key);
    }

    if (version !== this.pinnedResultRefreshVersion) {
      return;
    }

    this.pinnedResultMask = mask;
    this.pinnedResultFiles = nextResults;
  }

  private async promptForMask(defaultMask: string, sourceFolder?: vscode.Uri): Promise<string | undefined> {
    const folderExtensionMasks = sourceFolder ? await this.folderExtensionMasksFor(sourceFolder) : [];
    const mask = await promptForMask(
      defaultMask,
      this.recentMasks(),
      configuredMaskPresets(),
      folderExtensionMasks,
      configuredSavedFilters()
    );
    if (mask) {
      await this.globalState.update(RECENT_MASKS_KEY, updatedRecentMasks(this.recentMasks(), mask, RECENT_MASK_LIMIT));
    }

    return mask;
  }

  private async activeSourceFolder(): Promise<vscode.Uri | undefined> {
    const uri = activeTabUri() ?? vscode.window.activeTextEditor?.document.uri;
    if (!uri || uri.scheme !== "file" || !vscode.workspace.getWorkspaceFolder(uri) || await this.isWorkspaceDirectory(uri)) {
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
    if (uri.scheme !== "file" || !vscode.workspace.getWorkspaceFolder(uri)) {
      return undefined;
    }

    const sourceFolder = await this.isWorkspaceDirectory(uri) ? uri : parentFolderUri(uri);
    return workspaceFolderForSourceFolder(sourceFolder) ? sourceFolder : undefined;
  }

  private async isWorkspaceDirectory(uri: vscode.Uri): Promise<boolean> {
    if (uri.scheme !== "file" || !vscode.workspace.getWorkspaceFolder(uri)) {
      return false;
    }

    return isDirectory(uri);
  }

  private async folderExtensionMasksFor(sourceFolder: vscode.Uri): Promise<string[]> {
    if (!workspaceFolderForSourceFolder(sourceFolder)) {
      return [];
    }

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

  private pinForSourceFolder(sourceFolder: vscode.Uri): PinnedFolder | undefined {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(sourceFolder);
    if (!workspaceFolder) {
      return undefined;
    }

    const workspaceRelativePath = workspaceRelativeFolderPath(workspaceFolder.uri, sourceFolder);
    if (workspaceRelativePath === undefined) {
      return undefined;
    }

    return { workspaceFolderName: workspaceFolder.name, relativePath: workspaceRelativePath };
  }

  private resolvePinnedFolder(pin: PinnedFolder): {
    state: PinnedFolderNode["state"];
    sourceFolder?: vscode.Uri;
  } {
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    const matchingFolders = workspaceFolders.filter((folder) => folder.name === pin.workspaceFolderName);
    if (matchingFolders.length === 0) {
      return { state: "missingWorkspace" };
    }

    if (matchingFolders.length > 1) {
      return { state: "ambiguousWorkspace" };
    }

    const workspaceFolder = matchingFolders[0];
    const segments = pin.relativePath.split("/").filter((segment) => segment.length > 0);
    const sourceFolder = segments.length === 0
      ? workspaceFolder.uri
      : vscode.Uri.joinPath(workspaceFolder.uri, ...segments);
    if (workspaceRelativeFolderPath(workspaceFolder.uri, sourceFolder) === undefined) {
      return { state: "missingWorkspace" };
    }

    return { state: "ready", sourceFolder };
  }

  private recentMasks(): string[] {
    return normalizeMaskList(this.globalState.get<unknown>(RECENT_MASKS_KEY), []);
  }

  private pinnedFolders(): PinnedFolder[] {
    return normalizePinnedFolders(this.workspaceState.get<unknown>(PINNED_FOLDERS_KEY), PINNED_FOLDER_LIMIT);
  }

  private pinnedResultFilesFor(pin: PinnedFolder): FileNode[] {
    if (!this.mask || this.pinnedResultMask !== this.mask) {
      return [];
    }

    return sortFiles(this.pinnedResultFiles.get(pinnedFolderKey(pin)) ?? [], configuredSortBy());
  }

  private storedPinnedFolderFromCommandNode(node: FolderFileFilterNode | undefined): PinnedFolder | undefined {
    if (!isPinnedFolderNode(node)) {
      return undefined;
    }

    const [requestedPin] = normalizePinnedFolders([node.pin], 1);
    if (!requestedPin) {
      return undefined;
    }

    return this.pinnedFolders().find((storedPin) => samePinnedFolder(storedPin, requestedPin));
  }

  private withRootNodes(nodes: readonly FolderFileFilterNode[]): FolderFileFilterNode[] {
    return this.withPinnedFolderNodes(this.withFilterNode(nodes));
  }

  private withPinnedFolderNodes(nodes: readonly FolderFileFilterNode[]): FolderFileFilterNode[] {
    const pinnedGroup = this.pinnedFoldersGroupNode();
    return pinnedGroup ? [pinnedGroup, ...nodes] : [...nodes];
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

  private pinnedFoldersGroupNode(): PinnedFoldersGroupNode | undefined {
    const children = this.pinnedFolders().map((pin) => this.pinnedFolderNode(pin));
    if (children.length === 0) {
      return undefined;
    }

    return {
      kind: "pinnedGroup",
      label: "Pinned folders",
      description: `${children.length}`,
      children
    };
  }

  private pinnedFolderNodes(): PinnedFolderNode[] {
    const group = this.nodes.find((node): node is PinnedFoldersGroupNode => node.kind === "pinnedGroup");
    return group?.children ?? [];
  }

  private pinnedFolderNode(pin: PinnedFolder): PinnedFolderNode {
    const resolution = this.resolvePinnedFolder(pin);
    const label = pinnedFolderLabel(pin);
    if (this.missingPinnedFolderKeys.has(pinnedFolderKey(pin))) {
      return {
        kind: "pinnedFolder",
        pin,
        label,
        description: "missing folder",
        state: "missingFolder"
      };
    }

    if (resolution.state !== "ready") {
      return {
        kind: "pinnedFolder",
        pin,
        label,
        description: resolution.state === "ambiguousWorkspace" ? "ambiguous workspace" : "missing workspace",
        state: resolution.state
      };
    }

    const children = this.pinnedResultFilesFor(pin);
    const countText = this.mask && this.pinnedResultMask === this.mask ? ` ${children.length}` : "";
    return {
      kind: "pinnedFolder",
      pin,
      label,
      description: `${pin.workspaceFolderName}${countText}`,
      state: "ready",
      children
    };
  }

  private rebuildCurrentNodes(options: { fire?: boolean; probePinnedFolders?: boolean } = {}): void {
    if (this.mask) {
      this.rebuildResultNodes(options);
      return;
    }

    this.nodes = this.withPinnedFolderNodes([
      {
        kind: "message",
        label: "No filter active",
        description: "Right-click a folder and choose Folder File Filter: Show Matching Files."
      }
    ]);
    this.updateTreeMessage();
    if (options.fire !== false) {
      this.changed.fire(undefined);
    }
    if (options.probePinnedFolders !== false) {
      this.schedulePinnedFolderProbe();
    }
  }

  private rebuildResultNodes(options: { fire?: boolean; probePinnedFolders?: boolean } = {}): void {
    const files = sortFiles(this.files, configuredSortBy());
    const body = files.length > 0
      ? configuredGroupByExtension()
        ? groupFilesByExtension(files)
        : files
      : [
          {
            kind: "message" as const,
            label: "No matching files",
            description: this.sourceFolder && this.mask ? `${this.mask} in ${folderLabel(this.sourceFolder)}` : undefined
          }
        ];

    this.nodes = this.withRootNodes(body);
    this.updateTreeMessage();
    if (options.fire !== false) {
      this.changed.fire(undefined);
    }
    if (options.probePinnedFolders !== false) {
      this.schedulePinnedFolderProbe();
    }
  }

  private scheduleAutoRefresh(): void {
    if (!this.sourceFolder || !this.mask) {
      return;
    }

    this.clearAutoRefreshTimer();
    const sourceFolder = this.sourceFolder;
    const mask = this.mask;
    const origin = this.filterOrigin ?? "manual";
    this.autoRefreshTimer = setTimeout(async () => {
      this.autoRefreshTimer = undefined;
      await this.search(sourceFolder, mask, origin, { quiet: true });
    }, configuredAutoRefreshDebounceMs());
  }

  private disposeAutoRefreshWatcher(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = undefined;
    }
  }

  private clearAutoRefreshTimer(): void {
    if (this.autoRefreshTimer) {
      clearTimeout(this.autoRefreshTimer);
      this.autoRefreshTimer = undefined;
    }
  }

  private schedulePinnedFolderProbe(): void {
    const version = ++this.pinnedFolderProbeVersion;
    void this.probePinnedFolders(version);
  }

  private async probePinnedFolders(version: number): Promise<void> {
    const nextMissingKeys = new Set<string>();
    for (const pin of this.pinnedFolders()) {
      const resolution = this.resolvePinnedFolder(pin);
      if (resolution.state !== "ready" || !resolution.sourceFolder) {
        continue;
      }

      if (!await isDirectory(resolution.sourceFolder)) {
        nextMissingKeys.add(pinnedFolderKey(pin));
      }
    }

    if (version !== this.pinnedFolderProbeVersion || sameStringSet(this.missingPinnedFolderKeys, nextMissingKeys)) {
      return;
    }

    this.missingPinnedFolderKeys = nextMissingKeys;
    this.rebuildCurrentNodes({ probePinnedFolders: false });
  }

  private savedFilterLabelForMask(mask: string): string | undefined {
    return configuredSavedFilters().find((filter) => filter.mask === mask)?.label;
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

  private adjacentFileForSelection(direction: ResultNavigationDirection): FileNode | undefined {
    const displayFiles = this.fileNodesInDisplayOrder();
    if (displayFiles.length === 0) {
      return undefined;
    }

    const selectedFiles = this.treeView?.selection.filter(isFileNode) ?? [];
    const selectedFile = selectedFiles.length > 0 ? selectedFiles[selectedFiles.length - 1] : undefined;
    const selectedIndex = selectedFile
      ? displayFiles.findIndex((file) => sameUri(file.uri, selectedFile.uri))
      : -1;
    const currentIndex = selectedIndex >= 0
      ? selectedIndex
      : direction === "next"
        ? -1
        : displayFiles.length;
    const nextIndex = direction === "next"
      ? Math.min(currentIndex + 1, displayFiles.length - 1)
      : Math.max(currentIndex - 1, 0);

    return displayFiles[nextIndex];
  }

  private fileNodesInDisplayOrder(): FileNode[] {
    const files: FileNode[] = [];

    for (const node of this.nodes) {
      if (isFileNode(node)) {
        files.push(node);
      } else if (node.kind === "group") {
        files.push(...node.children);
      } else if (node.kind === "pinnedGroup") {
        for (const pinnedFolder of node.children) {
          files.push(...pinnedFolder.children ?? []);
        }
      }
    }

    return files;
  }

  private contextFileNodes(node?: FolderFileFilterNode): FileNode[] {
    const selected = uniqueFileNodes(
      (this.treeView?.selection ?? [])
        .map((selectedNode) => this.storedFileNodeFromCommandNode(selectedNode))
        .filter(isDefined)
    );
    const contextNode = this.storedFileNodeFromCommandNode(node);
    if (!contextNode) {
      return selected;
    }

    if (selected.some((selectedNode) => sameUri(selectedNode.uri, contextNode.uri))) {
      return selected;
    }

    return [contextNode];
  }

  private storedFileNodeFromCommandNode(node: FolderFileFilterNode | undefined): FileNode | undefined {
    if (!isFileNode(node)) {
      return undefined;
    }

    return this.ownedFileNodes().find((file) => sameUri(file.uri, node.uri));
  }

  private ownedFileNodes(): FileNode[] {
    return uniqueFileNodes([
      ...this.files,
      ...[...this.pinnedResultFiles.values()].flat()
    ]);
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
  folderExtensionMasks: readonly string[],
  namedFilters: readonly NamedFilter[]
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
      const items = createMaskQuickPickItems(quickPick.value, defaultMask, recentMasks, presetMasks, folderExtensionMasks, namedFilters);
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
  folderExtensionMasks: readonly string[],
  namedFilters: readonly NamedFilter[]
): MaskQuickPickItem[] {
  const items: MaskQuickPickItem[] = [];
  const added = new Set<string>();
  const typedMask = normalizeMask(inputValue);

  if (typedMask) {
    addMaskItem(items, added, typedMask, "Use typed mask", true);
  }

  addMaskSection(items, added, "Existing in this folder", folderExtensionMasks, "Folder extension");
  addNamedFilterSection(items, added, "Saved filters", namedFilters);
  addMaskSection(items, added, "Current", [defaultMask], "Current mask");
  addMaskSection(items, added, "Recent", recentMasks, "Recent mask");
  addMaskSection(items, added, "Generic patterns", presetMasks, "Pattern");

  return items;
}

function addNamedFilterSection(
  items: MaskQuickPickItem[],
  added: Set<string>,
  label: string,
  filters: readonly NamedFilter[]
): void {
  const sectionItems: MaskQuickPickItem[] = [];

  for (const filter of filters) {
    const normalized = normalizeMask(filter.mask);
    if (!normalized || added.has(normalized)) {
      continue;
    }

    added.add(normalized);
    sectionItems.push({
      label: filter.label,
      description: "Saved filter",
      detail: normalized,
      mask: normalized
    });
  }

  if (sectionItems.length === 0) {
    return;
  }

  items.push({ label, kind: vscode.QuickPickItemKind.Separator });
  items.push(...sectionItems);
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

function configuredSavedFilters(): NamedFilter[] {
  const configured = vscode.workspace.getConfiguration("folderFileFilter").get<unknown>("savedFilters");
  return normalizeNamedFilters(configured);
}

function configuredMaxResults(): number {
  const configured = vscode.workspace.getConfiguration("folderFileFilter").get<unknown>("maxResults");
  return normalizeMaxResults(configured, DEFAULT_MAX_RESULTS, MAX_RESULTS_LIMIT);
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

function configuredAutoRefreshResults(): boolean {
  const configured = vscode.workspace.getConfiguration("folderFileFilter").get<unknown>("autoRefreshResults");
  return normalizeAutoRefreshResults(configured, DEFAULT_AUTO_REFRESH_RESULTS);
}

function configuredAutoRefreshDebounceMs(): number {
  const configured = vscode.workspace.getConfiguration("folderFileFilter").get<unknown>("autoRefreshDebounceMs");
  return normalizeAutoRefreshDebounceMs(configured, DEFAULT_AUTO_REFRESH_DEBOUNCE_MS);
}

function configuredSortBy(): FileSortMode {
  const configured = vscode.workspace.getConfiguration("folderFileFilter").get<unknown>("sortBy");
  return normalizeFileSortMode(configured, DEFAULT_SORT_BY);
}

function configuredGroupByExtension(): boolean {
  const configured = vscode.workspace.getConfiguration("folderFileFilter").get<unknown>("groupByExtension");
  return normalizeGroupByExtension(configured, DEFAULT_GROUP_BY_EXTENSION);
}

function groupFilesByExtension(files: readonly FileNode[]): GroupNode[] {
  const grouped = new Map<string, FileNode[]>();
  for (const file of files) {
    const key = extensionLabel(file.relativePath);
    grouped.set(key, [...(grouped.get(key) ?? []), file]);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([label, children]) => ({
      kind: "group",
      label,
      description: `${children.length}`,
      children
    }));
}

function extensionLabel(relativePath: string): string {
  const fileName = relativePath.replace(/\\/g, "/").split("/").pop() ?? relativePath;
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 && dotIndex < fileName.length - 1 ? fileName.slice(dotIndex).toLowerCase() : "No extension";
}

function executeViewFocus(): void {
  void vscode.commands.executeCommand(VIEW_FOCUS_COMMAND).then(undefined, () => undefined);
}

function isFileNode(node: FolderFileFilterNode | undefined): node is FileNode {
  return node?.kind === "file";
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function isPinnedFolderNode(node: FolderFileFilterNode | undefined): node is PinnedFolderNode {
  return node?.kind === "pinnedFolder";
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

function uniqueFileNodes(files: readonly FileNode[]): FileNode[] {
  const seen = new Set<string>();
  const unique: FileNode[] = [];
  for (const file of files) {
    const key = selectionKeyForNode(file);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(file);
  }

  return unique;
}

function samePinnedFolder(left: PinnedFolder, right: PinnedFolder): boolean {
  return left.workspaceFolderName === right.workspaceFolderName && left.relativePath === right.relativePath;
}

function sameStringSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

function pinnedFolderKey(folder: PinnedFolder): string {
  return `${folder.workspaceFolderName}\u0000${folder.relativePath}`;
}

function workspaceFolderNameIsAmbiguous(name: string): boolean {
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  return workspaceFolders.filter((folder) => folder.name === name).length > 1;
}

function workspaceFolderForSourceFolder(sourceFolder: vscode.Uri): vscode.WorkspaceFolder | undefined {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(sourceFolder);
  if (!workspaceFolder) {
    return undefined;
  }

  return workspaceRelativeFolderPath(workspaceFolder.uri, sourceFolder) === undefined ? undefined : workspaceFolder;
}

function workspaceRelativeFolderPath(workspaceRoot: vscode.Uri, sourceFolder: vscode.Uri): string | undefined {
  if (workspaceRoot.scheme === "file" && sourceFolder.scheme === "file") {
    const relative = path.relative(workspaceRoot.fsPath, sourceFolder.fsPath);
    if (relative === "") {
      return "";
    }
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return undefined;
    }

    return relative.replace(/\\/g, "/");
  }

  if (workspaceRoot.scheme !== sourceFolder.scheme || workspaceRoot.authority !== sourceFolder.authority) {
    return undefined;
  }

  const rootPath = stripTrailingSlash(workspaceRoot.path);
  const sourcePath = stripTrailingSlash(sourceFolder.path);
  if (sourcePath === rootPath) {
    return "";
  }
  if (!sourcePath.startsWith(`${rootPath}/`)) {
    return undefined;
  }

  return sourcePath.slice(rootPath.length + 1);
}

function pinnedFolderLabel(pin: PinnedFolder): string {
  if (!pin.relativePath) {
    return pin.workspaceFolderName;
  }

  return pin.relativePath;
}

function pinnedFolderTooltip(node: PinnedFolderNode): string {
  const location = node.pin.relativePath
    ? `${node.pin.workspaceFolderName}/${node.pin.relativePath}`
    : node.pin.workspaceFolderName;
  if (node.state === "missingWorkspace") {
    return `${location} (workspace not open)`;
  }
  if (node.state === "ambiguousWorkspace") {
    return `${location} (ambiguous workspace name)`;
  }
  if (node.state === "missingFolder") {
    return `${location} (folder missing)`;
  }

  return location;
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
