import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { resolveRuntime } from '../src/config/runtime';

async function tempDir(withGoMod: boolean): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'manul-runtime-'));
  if (withGoMod) {
    await fs.writeFile(path.join(dir, 'go.mod'), 'module example.com/x\n', 'utf8');
  }
  return dir;
}

describe('resolveRuntime', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
  });

  it('honors an explicit python setting even with a go.mod present', async () => {
    const ws = await tempDir(true);
    dirs.push(ws);
    expect(resolveRuntime({ runtime: 'python', binaryPath: '/usr/bin/manul', workspacePath: ws })).toBe('python');
  });

  it('honors an explicit go setting', () => {
    expect(resolveRuntime({ runtime: 'go', binaryPath: '', workspacePath: '' })).toBe('go');
  });

  it('auto → go when a binaryPath is configured', () => {
    expect(resolveRuntime({ runtime: 'auto', binaryPath: '/opt/manul', workspacePath: '' })).toBe('go');
  });

  it('auto → go when the workspace contains a go.mod', async () => {
    const ws = await tempDir(true);
    dirs.push(ws);
    expect(resolveRuntime({ runtime: 'auto', binaryPath: '', workspacePath: ws })).toBe('go');
  });

  it('auto → python when there is no go.mod and no binaryPath', async () => {
    const ws = await tempDir(false);
    dirs.push(ws);
    expect(resolveRuntime({ runtime: 'auto', binaryPath: '', workspacePath: ws })).toBe('python');
  });

  it('auto → python when no workspace is open', () => {
    expect(resolveRuntime({ runtime: 'auto', binaryPath: '', workspacePath: '' })).toBe('python');
  });
});
