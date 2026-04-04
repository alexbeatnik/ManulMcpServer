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

  // If the target already exists, validate its real path (prevents symlink-file escape)
  try {
    const stat = await fs.lstat(resolved);
    if (stat.isSymbolicLink()) {
      const realFile = await fs.realpath(resolved);
      const realRelative = path.relative(realRoot, realFile);
      if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
        throw new Error(`Access denied: path must be inside the workspace (${root})`);
      }
      return { resolvedPath: realFile };
    }
    // Exists and is not a symlink — safe
    return { resolvedPath: resolved };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }

  // For files that may not exist yet, check the nearest existing ancestor
  let ancestor = path.dirname(resolved);
  while (ancestor !== path.dirname(ancestor)) {
    try {
      const realAncestor = await fs.realpath(ancestor);
      const realFile = path.join(realAncestor, path.relative(ancestor, resolved));
      const realRelative = path.relative(realRoot, realFile);
      if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
        throw new Error(`Access denied: path must be inside the workspace (${root})`);
      }
      return { resolvedPath: realFile };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        ancestor = path.dirname(ancestor);
        continue;
      }
      throw err;
    }
  }

  // All ancestors resolved to root — path is safe
  return { resolvedPath: resolved };
}
