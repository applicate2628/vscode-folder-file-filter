export interface RelativeFile {
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

export function normalizeMaxResults(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return fallback;
  }

  return Math.floor(value);
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
