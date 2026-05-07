export interface RelativeFile {
  relativePath: string;
}

export type FileSortMode = "path" | "name" | "extension";

export interface NamedFilter {
  label: string;
  mask: string;
}

export interface PinnedFolder {
  workspaceFolderName: string;
  relativePath: string;
}

export function normalizeMask(value: string): string | undefined {
  const mask = value.trim();
  return mask.length > 0 ? mask : undefined;
}

export function normalizeMaskList(value: unknown, fallback: readonly string[]): string[] {
  const normalizedFallback = normalizeMaskArray(fallback);
  if (!Array.isArray(value)) {
    return normalizedFallback;
  }

  const normalized = normalizeMaskArray(value);
  return normalized.length > 0 ? normalized : normalizedFallback;
}

export function rememberRecentMask(recentMasks: readonly string[], mask: string, limit: number): string[] {
  const maxCount = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  if (maxCount <= 0) {
    return [];
  }

  const existing = normalizeMaskList(recentMasks, []);
  const normalized = normalizeMask(mask);
  if (!normalized) {
    return existing.slice(0, maxCount);
  }

  return uniqueInOrder([normalized, ...existing]).slice(0, maxCount);
}

export function normalizeMaxResults(
  value: unknown,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER
): number {
  const maxValue = Number.isFinite(maximum) ? Math.max(1, Math.floor(maximum)) : Number.MAX_SAFE_INTEGER;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return Math.min(fallback, maxValue);
  }

  return Math.min(Math.floor(value), maxValue);
}

export function normalizeOpenOnSelection(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeAutoFilterFilesFromSelectedFile(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeAutoFilterFromActiveFile(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeRestoreFocusDelayMs(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }

  return Math.floor(value);
}

export function normalizeAutoRefreshResults(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeAutoRefreshDebounceMs(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.floor(value);
}

export function normalizeFileSortMode(value: unknown, fallback: FileSortMode): FileSortMode {
  return value === "path" || value === "name" || value === "extension" ? value : fallback;
}

export function normalizeGroupByExtension(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeNamedFilters(value: unknown): NamedFilter[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const filters: NamedFilter[] = [];
  const seenLabels = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const label = typeof item.label === "string" ? item.label.trim() : "";
    const mask = typeof item.mask === "string" ? normalizeMask(item.mask) : undefined;
    if (!label || !mask || seenLabels.has(label)) {
      continue;
    }

    seenLabels.add(label);
    filters.push({ label, mask });
  }

  return filters;
}

export function normalizePinnedFolders(value: unknown, limit: number): PinnedFolder[] {
  const maxCount = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  if (!Array.isArray(value) || maxCount <= 0) {
    return [];
  }

  const folders: PinnedFolder[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const pinnedFolder = normalizePinnedFolder(item);
    if (!pinnedFolder) {
      continue;
    }

    const key = pinnedFolderKey(pinnedFolder);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    folders.push(pinnedFolder);
    if (folders.length >= maxCount) {
      break;
    }
  }

  return folders;
}

export function upsertPinnedFolder(
  folders: readonly PinnedFolder[],
  folder: PinnedFolder,
  limit: number
): PinnedFolder[] {
  const current = normalizePinnedFolders(folders, limit);
  const [normalized] = normalizePinnedFolders([folder], 1);
  if (!normalized) {
    return current;
  }

  const existingIndex = current.findIndex((item) => samePinnedFolder(item, normalized));
  if (existingIndex >= 0) {
    return current.map((item, index) => (index === existingIndex ? normalized : item));
  }

  return current.length < Math.max(0, Math.floor(limit)) ? [...current, normalized] : current;
}

export function removePinnedFolder(folders: readonly PinnedFolder[], folder: PinnedFolder): PinnedFolder[] {
  const [normalized] = normalizePinnedFolders([folder], 1);
  if (!normalized) {
    return normalizePinnedFolders(folders, Number.MAX_SAFE_INTEGER);
  }

  return normalizePinnedFolders(folders, Number.MAX_SAFE_INTEGER)
    .filter((item) => !samePinnedFolder(item, normalized));
}

export function upsertNamedFilter(filters: readonly NamedFilter[], label: string, mask: string): NamedFilter[] {
  const normalizedLabel = label.trim();
  const normalizedMask = normalizeMask(mask);
  if (!normalizedLabel || !normalizedMask) {
    return normalizeNamedFilters(filters);
  }

  const current = normalizeNamedFilters(filters);
  const existingIndex = current.findIndex((filter) => filter.label === normalizedLabel);
  const next = { label: normalizedLabel, mask: normalizedMask };
  if (existingIndex === -1) {
    return [...current, next];
  }

  return current.map((filter, index) => (index === existingIndex ? next : filter));
}

export function inferMaskFromFileName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return "*";
  }

  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex > 0 && dotIndex < trimmed.length - 1) {
    return `*${trimmed.slice(dotIndex)}`;
  }

  if (dotIndex === 0 && trimmed.indexOf(".", 1) === -1) {
    return ".*";
  }

  return trimmed;
}

export function inferMaskFromFileNames(fileNames: readonly string[]): string {
  const masks = uniqueInOrder(fileNames.map(inferMaskFromFileName));
  if (masks.length === 0) {
    return "*";
  }

  return masks.length === 1 ? masks[0] : `{${masks.join(",")}}`;
}

export function inferFolderExtensionMasks(fileNames: readonly string[], limit: number): string[] {
  const maxCount = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  if (maxCount <= 0) {
    return [];
  }

  const counts = new Map<string, number>();
  for (const fileName of fileNames) {
    const mask = inferExtensionMaskForSuggestion(fileName);
    if (!mask) {
      continue;
    }

    counts.set(mask, (counts.get(mask) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([leftMask, leftCount], [rightMask, rightCount]) =>
      rightCount - leftCount || leftMask.localeCompare(rightMask)
    )
    .map(([mask]) => mask)
    .slice(0, maxCount);
}

export function sortByRelativePath<T extends RelativeFile>(files: readonly T[]): T[] {
  return [...files].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export function sortFiles<T extends RelativeFile>(files: readonly T[], mode: FileSortMode): T[] {
  if (mode === "name") {
    return [...files].sort((left, right) =>
      fileNameForSort(left.relativePath).localeCompare(fileNameForSort(right.relativePath), undefined, { numeric: true })
      || left.relativePath.localeCompare(right.relativePath, undefined, { numeric: true })
    );
  }

  if (mode === "extension") {
    return [...files].sort((left, right) =>
      extensionForSort(left.relativePath).localeCompare(extensionForSort(right.relativePath), undefined, { numeric: true })
      || fileNameForSort(left.relativePath).localeCompare(fileNameForSort(right.relativePath), undefined, { numeric: true })
      || left.relativePath.localeCompare(right.relativePath, undefined, { numeric: true })
    );
  }

  return sortByRelativePath(files);
}

export function pickSelectionKeyToOpen(
  previousSelectionKeys: ReadonlySet<string>,
  currentSelectionKeys: readonly string[]
): string | undefined {
  for (const key of currentSelectionKeys) {
    if (!previousSelectionKeys.has(key)) {
      return key;
    }
  }

  return currentSelectionKeys[currentSelectionKeys.length - 1];
}

function uniqueInOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    unique.push(value);
  }

  return unique;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizePinnedFolder(value: unknown): PinnedFolder | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const workspaceFolderName = typeof value.workspaceFolderName === "string"
    ? value.workspaceFolderName.trim()
    : "";
  const relativePath = typeof value.relativePath === "string"
    ? normalizePinnedRelativePath(value.relativePath)
    : undefined;
  if (!workspaceFolderName || relativePath === undefined) {
    return undefined;
  }

  return { workspaceFolderName, relativePath };
}

function normalizePinnedRelativePath(value: string): string | undefined {
  let normalized = value.trim().replace(/\\/g, "/").replace(/\/+/g, "/");
  if (normalized === "." || normalized === "./") {
    normalized = "";
  }
  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  normalized = normalized.replace(/\/+$/, "");

  if (
    normalized.startsWith("/")
    || /^[A-Za-z]:/.test(normalized)
    || normalized.toLowerCase().startsWith("file:")
  ) {
    return undefined;
  }

  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === "..")) {
    return undefined;
  }

  return segments.join("/");
}

function samePinnedFolder(left: PinnedFolder, right: PinnedFolder): boolean {
  return left.workspaceFolderName === right.workspaceFolderName && left.relativePath === right.relativePath;
}

function pinnedFolderKey(folder: PinnedFolder): string {
  return `${folder.workspaceFolderName}\u0000${folder.relativePath}`;
}

function fileNameForSort(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  const slash = normalized.lastIndexOf("/");
  return (slash >= 0 ? normalized.slice(slash + 1) : normalized).toLowerCase();
}

function extensionForSort(relativePath: string): string {
  const fileName = fileNameForSort(relativePath);
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 && dotIndex < fileName.length - 1 ? fileName.slice(dotIndex) : "";
}

function inferExtensionMaskForSuggestion(fileName: string): string | undefined {
  const trimmed = fileName.trim();
  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex >= trimmed.length - 1) {
    return undefined;
  }

  return `*${trimmed.slice(dotIndex).toLowerCase()}`;
}

function normalizeMaskArray(values: readonly unknown[]): string[] {
  const normalized: string[] = [];

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const mask = normalizeMask(value);
    if (mask) {
      normalized.push(mask);
    }
  }

  return uniqueInOrder(normalized);
}
