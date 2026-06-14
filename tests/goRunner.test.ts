import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { GoRunner, buildHunt, extractHeader, mapResults, parseJson } from '../src/services/goRunner';
import type { ManulLogger } from '../src/services/logger';

const noopLogger: ManulLogger = {
  info() {},
  warn() {},
  error() {},
  step() {},
  debug() {},
};

describe('goRunner pure helpers', () => {
  it('buildHunt wraps steps in a STEP block with headers and DONE.', () => {
    const hunt = buildHunt(["CLICK the 'Login' button", "VERIFY that 'Home' is present"], 'ctx', 'My Title');
    expect(hunt).toBe(
      [
        '@context: ctx',
        '@title: My Title',
        '',
        'STEP 1: Mission',
        "    CLICK the 'Login' button",
        "    VERIFY that 'Home' is present",
        'DONE.',
        '',
      ].join('\n'),
    );
  });

  it('buildHunt omits empty headers', () => {
    const hunt = buildHunt(['NAVIGATE to https://example.com'], '', '');
    expect(hunt).toBe(['STEP 1: Mission', '    NAVIGATE to https://example.com', 'DONE.', ''].join('\n'));
  });

  it('extractHeader reads @context: and @title: from a document', () => {
    const dsl = '@context: smoke\n@title: Login\nSTEP 1: x\n';
    expect(extractHeader(dsl, 'context')).toBe('smoke');
    expect(extractHeader(dsl, 'title')).toBe('Login');
    expect(extractHeader('STEP 1: x', 'title')).toBeUndefined();
  });

  it('parseJson returns objects and rejects non-object / garbage', () => {
    expect(parseJson('{"ok":true}')).toEqual({ ok: true });
    expect(parseJson('   \n {"a":1} \n ')).toEqual({ a: 1 });
    expect(parseJson('[1,2,3]')).toBeNull();
    expect(parseJson('not json')).toBeNull();
    expect(parseJson('')).toBeNull();
  });

  it('mapResults projects HuntResult results to {step,status,error}', () => {
    const hunt = {
      results: [
        { step: "CLICK 'A'", success: true, error: '' },
        { step: "VERIFY 'B'", success: false, error: 'not found' },
      ],
    };
    expect(mapResults(hunt)).toEqual([
      { step: "CLICK 'A'", status: 'pass', error: '' },
      { step: "VERIFY 'B'", status: 'fail', error: 'not found' },
    ]);
  });

  it('mapResults tolerates a missing results array', () => {
    expect(mapResults({})).toEqual([]);
  });
});

describe('GoRunner.getState (stub binary, POSIX)', () => {
  const stubs: string[] = [];

  afterEach(async () => {
    await Promise.all(stubs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
  });

  it.skipIf(process.platform === 'win32')('reads the engine version and runtime metadata', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'manul-stub-'));
    stubs.push(dir);
    const binary = path.join(dir, 'manul');
    await fs.writeFile(binary, '#!/usr/bin/env bash\necho "manul v0.0.10"\n', { mode: 0o755 });

    const runner = new GoRunner(
      { binaryPath: binary, executablePath: '', headless: true, cdpPort: 0, timeoutMs: 5000, workspacePath: dir },
      noopLogger,
    );

    const state = await runner.getState();
    expect(state.ok).toBe(true);
    if (state.ok) {
      expect(state.data.engine).toBe('ManulHeart');
      expect(String(state.data.engine_version)).toContain('v0.0.10');
      expect(state.data.browser_open).toBe(false);
      expect(state.data.step_count).toBe(0);
    }
  });
});
