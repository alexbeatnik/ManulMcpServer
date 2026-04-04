import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export interface JailResult {
  readonly resolvedPath: string;
}

/**
 * Resolve a file path inside the workspace root, rejecting any escape
 * (including symlink-based escapes). Optionally restrict to a set of
 * allowed extensions.
 */
export async function resolveInsideWorkspace(
  filePath: string,
  workspaceRoot: string,
  options?: { allowedExtensions?: readonly string[]; requireExists?: boolean },
): Promise<JailResult> {
  const root = path.resolve(workspaceRoot);
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
  const relative = path.relative(root, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Access denied: path must be inside the workspace (${root})`);
  }

  if (options?.allowedExtensions) {
    const ext = path.extname(resolved).toLowerCase();
    if (!options.allowedExtensions.includes(ext)) {
      throw new Error(`Access denied: only ${options.allowedExtensions.join(', ')} files are allowed`);
    }
  }

  // Resolve symlinks to prevent escaping via symlinked directories
  const realRoot = await fs.realpath(root);

  if (options?.requireExists) {
    const realFile = await fs.realpath(resolved);
    const realRelative = path.relative(realRoot, realFile);
    if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
      throw new Error(`Access denied: path must be inside the workspace (${root})`);
    }
    return { resolvedPath: realFile };
  }

  // For files that may not exist yet, check the parent directory
  const parentDir = path.dirname(resolved);
  const realParent = await fs.realpath(parentDir);
  const realFile = path.join(realParent, path.basename(resolved));
  const realRelative = path.relative(realRoot, realFile);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new Error(`Access denied: path must be inside the workspace (${root})`);
  }

  return { resolvedPath: realFile };
}
