import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

import type { ManulLogger } from './logger';

// Chrome/Chromium binaries to try, in order, when no explicit path is given.
// Names are looked up on PATH; absolute paths cover the common macOS/Windows
// install locations that are not on PATH.
const CHROME_CANDIDATES: readonly string[] = [
  process.env.CHROME_PATH ?? '',
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter((value) => value.length > 0);

export interface ChromeProcessOptions {
  /** Explicit Chrome/Chromium executable. Empty → probe CHROME_CANDIDATES. */
  readonly executablePath: string;
  /** Debug port to bind. 0 → auto-pick a free port. */
  readonly port: number;
  readonly headless: boolean;
  /** Milliseconds to wait for the DevTools endpoint to come up. */
  readonly readyTimeoutMs: number;
  readonly logger: ManulLogger;
}

/**
 * Owns a Chrome process started with the CDP debug port open, so the ManulHeart
 * `manul` CLI (which is stateless per invocation) can attach to a persistent
 * browser session via `--cdp http://127.0.0.1:<port>`. Mirrors how OS-MANUL
 * drives ManulHeart against a long-lived Chrome on the debug port.
 */
export class ChromeProcess {
  private process: ChildProcess | null = null;
  private boundPort = 0;
  private startingPromise: Promise<void> | null = null;

  public constructor(private readonly options: ChromeProcessOptions) {}

  /** Launch Chrome (idempotent) and wait until its DevTools endpoint answers. */
  public ensureRunning(): Promise<void> {
    if (this.process && !this.process.killed && this.boundPort > 0) {
      return Promise.resolve();
    }
    if (this.startingPromise) {
      return this.startingPromise;
    }
    this.startingPromise = this.launch();
    return this.startingPromise;
  }

  public endpoint(): string {
    return `http://127.0.0.1:${this.boundPort}`;
  }

  public isAlive(): boolean {
    return Boolean(this.process && !this.process.killed && this.boundPort > 0);
  }

  public kill(): void {
    if (this.process && !this.process.killed) {
      this.process.kill();
    }
    this.process = null;
    this.boundPort = 0;
    this.startingPromise = null;
  }

  private async launch(): Promise<void> {
    const executable = resolveChromeExecutable(this.options.executablePath);
    if (!executable) {
      this.startingPromise = null;
      throw new Error(
        'Could not find Chrome/Chromium. Set manul.executablePath to the browser binary used by the ManulHeart (Go) runtime.',
      );
    }

    const port = this.options.port > 0 ? this.options.port : await pickFreePort();
    const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'manulheart-chrome-'));

    const args = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-allow-origins=*',
    ];
    if (this.options.headless) {
      args.push('--headless=new', '--disable-gpu');
    }

    this.options.logger.info(`Launching Chrome for ManulHeart: ${executable} (CDP port ${port})`);

    const child = spawn(executable, args, { stdio: 'ignore' });

    // Surface a spawn failure (e.g. Chrome not installed → ENOENT) immediately
    // instead of polling the dead endpoint for the full ready timeout.
    const earlyExit = new Promise<never>((_, reject) => {
      child.once('error', (err) => {
        this.options.logger.error(`Chrome spawn error: ${err.message}`);
        reject(new Error(`Failed to launch Chrome "${executable}": ${err.message}`));
      });
      child.once('exit', (code) => {
        reject(new Error(`Chrome exited during startup (code ${String(code)}).`));
      });
    });
    // Once Chrome is up, an exit just marks the session dead for the next call.
    child.on('exit', (code) => {
      this.options.logger.warn(`Chrome exited (code ${String(code)})`);
      this.process = null;
      this.boundPort = 0;
      this.startingPromise = null;
    });

    this.process = child;

    try {
      await Promise.race([waitForDevTools(port, this.options.readyTimeoutMs), earlyExit]);
    } catch (error) {
      this.kill();
      throw error;
    } finally {
      // The race is settled; swallow any later rejection from the orphaned
      // earlyExit promise (it rejects again if Chrome exits post-startup).
      void earlyExit.catch(() => {});
    }

    this.boundPort = port;
  }
}

/** Resolve the Chrome executable from an explicit path or the candidate list. */
export function resolveChromeExecutable(explicitPath: string): string | null {
  const trimmed = explicitPath.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  for (const candidate of CHROME_CANDIDATES) {
    // Absolute paths are checked on disk; bare command names are returned as-is
    // and resolved by the OS via PATH at spawn time.
    if (path.isAbsolute(candidate)) {
      if (existsSync(candidate)) {
        return candidate;
      }
    } else {
      return candidate;
    }
  }
  return null;
}

/** Ask the OS for an unused TCP port by binding to port 0. */
export function pickFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const { port } = address;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Failed to acquire a free port.')));
      }
    });
  });
}

/** Poll the CDP /json/version endpoint until it responds or the deadline passes. */
async function waitForDevTools(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const url = `http://127.0.0.1:${port}/json/version`;
  let lastError = 'no response';

  while (Date.now() < deadline) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (response.ok) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'fetch failed';
    }
    await delay(150);
  }

  throw new Error(`Chrome DevTools endpoint did not come up on port ${port} (${lastError}).`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
