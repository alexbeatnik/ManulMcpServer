import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { resolveInsideWorkspace } from '../src/security/pathValidator';

async function createTempWorkspace(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'manul-mcp-path-validator-'));
}

async function removeTempWorkspace(workspaceRoot: string): Promise<void> {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
}

describe('resolveInsideWorkspace', () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => removeTempWorkspace(root)));
  });

  it('resolves a relative path inside the workspace', async () => {
    const root = await createTempWorkspace();
    tempRoots.push(root);

    const result = await resolveInsideWorkspace('tests/example.hunt', root);
    expect(result.resolvedPath).toBe(path.join(root, 'tests', 'example.hunt'));
  });

  it('rejects paths that escape the workspace', async () => {
    const root = await createTempWorkspace();
    tempRoots.push(root);

    await expect(resolveInsideWorkspace('../secret.txt', root)).rejects.toThrow('Access denied');
  });

  it('rejects disallowed file extensions', async () => {
    const root = await createTempWorkspace();
    tempRoots.push(root);

    await expect(resolveInsideWorkspace('tests/example.txt', root, { allowedExtensions: ['.hunt'] })).rejects.toThrow(
      'only .hunt files are allowed',
    );
  });

  it('requires an existing file when requireExists is true', async () => {
    const root = await createTempWorkspace();
    tempRoots.push(root);

    await expect(resolveInsideWorkspace('missing/example.hunt', root, { requireExists: true })).rejects.toThrow();
  });

  it('returns the real path for an existing file when requireExists is true', async () => {
    const root = await createTempWorkspace();
    tempRoots.push(root);

    const filePath = path.join(root, 'tests', 'example.hunt');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, 'DONE.\n', 'utf8');

    const result = await resolveInsideWorkspace(filePath, root, { requireExists: true });
    expect(result.resolvedPath).toBe(filePath);
  });

  it('rejects a symlink that points outside the workspace', async () => {
    const root = await createTempWorkspace();
    tempRoots.push(root);

    const externalRoot = await createTempWorkspace();
    tempRoots.push(externalRoot);

    const externalFile = path.join(externalRoot, 'secret.hunt');
    const linkPath = path.join(root, 'linked.hunt');
    await fs.writeFile(externalFile, 'DONE.\n', 'utf8');
    await fs.symlink(externalFile, linkPath);

    await expect(resolveInsideWorkspace(linkPath, root)).rejects.toThrow('Access denied');
  });

  it('resolves a new file inside a symlinked directory that stays within the workspace', async () => {
    const root = await createTempWorkspace();
    tempRoots.push(root);

    const realDir = path.join(root, 'actual');
    const linkDir = path.join(root, 'alias');
    await fs.mkdir(realDir, { recursive: true });
    await fs.symlink(realDir, linkDir);

    const result = await resolveInsideWorkspace(path.join('alias', 'new.hunt'), root, { allowedExtensions: ['.hunt'] });
    expect(result.resolvedPath).toBe(path.join(realDir, 'new.hunt'));
  });
});