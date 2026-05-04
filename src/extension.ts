import * as path from "node:path";
import * as vscode from "vscode";
import {
  inferMaskFromFileName,
  normalizeAutoFilterFilesFromSelectedFile,
  normalizeMask,
  normalizeMaxResults,
  normalizeOpenOnSelection,
  sortByRelativePath
} from "./filtering";

const VIEW_ID = "folderFileFilter.results";
const DEFAULT_MASK = "**/*";
const DEFAULT_MAX_RESULTS = 500;
const DEFAULT_OPEN_ON_SELECTION = false;
const DEFAULT_AUTO_FILTER_FILES_FROM_SELECTED_FILE = true;
const VIEW_FOCUS_COMMAND = `${VIEW_ID}.focus`;
const LIST_FOCUS_DOWN_COMMAND = "list.focusDown";
const LIST_FOCUS_UP_COMMAND = "list.focusUp";
const LIST_SELECT_COMMAND = "list.select";

type FolderFileFilterNode = FileNode | MessageNode;

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
    vscode.commands.registerCommand("folderFileFilter.showMatchingFilesFromFile", async (uri?: vscode.Uri) => {
      await provider.showMatchingFilesFromFile(uri);
    }),
    vscode.commands.registerCommand("folderFileFilter.refresh", async () => {
      await provider.refresh();
    }),
    vscode.commands.registerCommand("folderFileFilter.clear", () => {
      provider.clear();
    }),
    vscode.commands.registerCommand("folderFileFilter.focusDownAndSelect", async () => {
      await provider.focusAndSelect(LIST_FOCUS_DOWN_COMMAND);
    }),
    vscode.commands.registerCommand("folderFileFilter.focusUpAndSelect", async () => {
      await provider.focusAndSelect(LIST_FOCUS_UP_COMMAND);
    })
  );
}

export function deactivate(): void {
  // No resources to release.
}

class FolderFileFilterProvider implements vscode.TreeDataProvider<FolderFileFilterNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<FolderFileFilterNode | undefined>();
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

  public readonly onDidChangeTreeData = this.changed.event;

  public bindTreeView(treeView: vscode.TreeView<FolderFileFilterNode>): void {
    this.treeView = treeView;
    this.updateTreeMessage();
  }

  public dispose(): void {
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

  public async openSelectedFile(selection: readonly FolderFileFilterNode[]): Promise<void> {
    if (!configuredOpenOnSelection()) {
      return;
    }

    const node = selection.find(isFileNode);
    if (!node) {
      return;
    }

    try {
      await vscode.commands.executeCommand("vscode.open", node.uri, {
        preview: true,
        preserveFocus: true
      });
      await vscode.commands.executeCommand(VIEW_FOCUS_COMMAND);
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

    await this.search(uri, mask);
  }

  public async showMatchingFilesFromFile(uri?: vscode.Uri): Promise<void> {
    if (!uri) {
      vscode.window.showWarningMessage("Folder File Filter: right-click a file in Explorer first.");
      return;
    }

    if (await isDirectory(uri)) {
      await this.showMatchingFiles(uri);
      return;
    }

    const sourceFolder = parentFolderUri(uri);
    const inferredMask = inferMaskFromFileName(fileNameFromUri(uri));
    const mask = configuredAutoFilterFilesFromSelectedFile()
      ? inferredMask
      : await promptForMask(inferredMask);
    if (!mask) {
      return;
    }

    await this.search(sourceFolder, mask);
  }

  public async refresh(): Promise<void> {
    if (!this.sourceFolder || !this.mask) {
      vscode.window.showInformationMessage("Folder File Filter: no active folder and mask to refresh.");
      return;
    }

    await this.search(this.sourceFolder, this.mask);
  }

  public clear(): void {
    this.sourceFolder = undefined;
    this.mask = undefined;
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

  private async search(sourceFolder: vscode.Uri, mask: string): Promise<void> {
    this.sourceFolder = sourceFolder;
    this.mask = mask;
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

function isFileNode(node: FolderFileFilterNode): node is FileNode {
  return node.kind === "file";
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
