export interface RelativeFile {
  relativePath: string;
}

export function normalizeMask(value: string): string | undefined {
  const mask = value.trim();
  return mask.length > 0 ? mask : undefined;
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

export function sortByRelativePath<T extends RelativeFile>(files: readonly T[]): T[] {
  return [...files].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}
