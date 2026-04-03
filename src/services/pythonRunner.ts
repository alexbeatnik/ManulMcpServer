import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

import type { ApiResult, ManulEngineState } from '../types/api';
import type { ManulLogger } from './logger';

// Relative venv candidates checked in order under a given root directory.
const VENV_CANDIDATES = [
  path.join('.venv', 'bin', 'python3'),
  path.join('.venv', 'bin', 'python'),
  path.join('venv', 'bin', 'python3'),
  path.join('venv', 'bin', 'python'),
  path.join('.env', 'bin', 'python3'),
  path.join('.env', 'bin', 'python'),
  path.join('env', 'bin', 'python3'),
  path.join('env', 'bin', 'python'),
  // Windows paths
  path.join('.venv', 'Scripts', 'python.exe'),
  path.join('venv', 'Scripts', 'python.exe'),
];

/**
 * Resolve the Python executable to use.
 *
 * Priority:
 *   1. Explicit path (anything other than the bare default sentinel "python3")
 *   2. venv/virtualenv found under workspacePath (from MANUL_WORKSPACE_PATH env)
 *   3. venv/virtualenv found relative to CWD as a fallback
 *   4. Fall back to "python3" on PATH
 */
function resolvePython(configuredPath: string, workspacePath: string, extensionPath: string, logger: ManulLogger): string {
  // Explicit non-default path set via MANUL_PYTHON_PATH — use it as-is.
  if (configuredPath && configuredPath !== 'python3' && configuredPath !== 'python') {
    return configuredPath;
  }

  // Search roots: explicit workspace path first, then extension path, then CWD as fallback.
  const searchRoots: string[] = [];
  if (workspacePath) {
    searchRoots.push(workspacePath);
  }
  if (extensionPath && extensionPath !== workspacePath) {
    searchRoots.push(extensionPath);
  }
  const cwd = process.cwd();
  if (!searchRoots.some((r) => path.resolve(r) === path.resolve(cwd))) {
    searchRoots.push(cwd);
  }

  for (const root of searchRoots) {
    for (const candidate of VENV_CANDIDATES) {
      const full = path.resolve(root, candidate);
      if (existsSync(full)) {
        logger.info(`Found venv Python: ${full}`);
        return full;
      }
    }
  }

  logger.info('No local venv found, falling back to system python3.');
  return 'python3';
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

interface RunnerMessage {
  readonly id?: string;
  readonly type?: string;
  readonly ok?: boolean;
  readonly data?: JsonObject;
  readonly error?: string;
}

export interface PythonRunnerOptions {
  readonly pythonPath: string;
  readonly runnerScriptPath: string;
  readonly timeoutMs: number;
  readonly headless: boolean;
  readonly workspacePath: string;
  readonly extensionPath: string;
}

export class PythonRunner {
  private process: ChildProcess | null = null;
  private readonly pending = new Map<string, (msg: RunnerMessage) => void>();
  private messageCounter = 0;
  private lineBuffer = '';
  private ready = false;
  private readonly readyWaiters: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];
  private starting = false;

  public constructor(
    private readonly options: PythonRunnerOptions,
    private readonly logger: ManulLogger,
  ) {
    this.resolvedPythonPath = resolvePython(options.pythonPath, options.workspacePath, options.extensionPath, logger);
  }

  private readonly resolvedPythonPath: string;

  // ── public API (matches IManulBackend) ──────────────────────────────────────

  public async runStep(step: string): Promise<ApiResult> {
    const response = await this.send('run_steps', {
      steps: [step],
      headless: this.options.headless,
    });
    return this.toApiResult(response);
  }

  public async runSteps(steps: readonly string[], dsl?: string): Promise<ApiResult> {
    const context = dsl ? extractContext(dsl) : undefined;
    const title = dsl ? extractTitle(dsl) : undefined;
    const response = await this.send('run_steps', {
      steps: [...steps],
      ...(context !== undefined ? { context } : {}),
      ...(title !== undefined ? { title } : {}),
      headless: this.options.headless,
    });
    return this.toApiResult(response);
  }

  public async getState(): Promise<ApiResult<ManulEngineState>> {
    const response = await this.send('get_state', {});
    return this.toApiResult(response) as ApiResult<ManulEngineState>;
  }

  // ── extra API (only used by stdioServer.ts directly) ────────────────────────

  public async proposeHunt(context?: string, title?: string): Promise<ApiResult> {
    const params: JsonObject = {};
    if (context) params['context'] = context;
    if (title) params['title'] = title;
    const response = await this.send('propose_hunt', params);
    return this.toApiResult(response);
  }

  public async saveHunt(path: string, content: string): Promise<ApiResult> {
    const response = await this.send('save_hunt', { path, content });
    return this.toApiResult(response);
  }

  public async scanPage(): Promise<ApiResult> {
    const response = await this.send('scan_page', {});
    return this.toApiResult(response);
  }

  public async readPageText(): Promise<ApiResult> {
    const response = await this.send('read_page_text', {});
    return this.toApiResult(response);
  }

  public async reset(context?: string, title?: string): Promise<ApiResult> {
    const params: JsonObject = {};
    if (context) params['context'] = context;
    if (title) params['title'] = title;
    const response = await this.send('reset', params);
    return this.toApiResult(response);
  }

  public async shutdown(): Promise<void> {
    if (!this.process || this.process.killed) {
      return;
    }
    try {
      await Promise.race([
        this.send('shutdown', {}),
        new Promise<RunnerMessage>((resolve) => setTimeout(() => resolve({ ok: true } as RunnerMessage), 2000)),
      ]);
    } catch {
      // best-effort
    }
    this.process.kill();
    this.process = null;
    this.ready = false;
  }

  // ── subprocess lifecycle ────────────────────────────────────────────────────

  private ensureProcess(): Promise<void> {
    if (this.ready && this.process && !this.process.killed) {
      return Promise.resolve();
    }

    if (this.starting) {
      return new Promise((resolve, reject) => {
        this.readyWaiters.push({ resolve, reject });
      });
    }

    this.starting = true;
    return new Promise<void>((resolve, reject) => {
      this.logger.info(`Spawning Python runner: ${this.resolvedPythonPath} ${this.options.runnerScriptPath}`);

      const child = spawn(this.resolvedPythonPath, [this.options.runnerScriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: this.options.workspacePath || process.cwd(),
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
          MANUL_WORKSPACE_PATH: this.options.workspacePath || process.cwd(),
        },
      });

      child.stdout!.setEncoding('utf8');
      child.stdout!.on('data', (chunk: string) => {
        this.lineBuffer += chunk;
        const lines = this.lineBuffer.split('\n');
        this.lineBuffer = lines.pop() ?? '';

        for (const raw of lines) {
          const line = raw.trim();
          if (!line) {
            continue;
          }
          this.handleLine(line, resolve, reject);
        }
      });

      child.stderr!.setEncoding('utf8');
      child.stderr!.on('data', (chunk: string) => {
        for (const line of chunk.split('\n')) {
          const trimmed = line.trim();
          if (trimmed) {
            this.logger.info(trimmed);
          }
        }
      });

      child.on('error', (err) => {
        this.logger.error(`Python runner spawn error: ${err.message}`);
        this.ready = false;
        this.starting = false;
        this.process = null;
        for (const w of this.readyWaiters) { w.reject(err); }
        this.readyWaiters.length = 0;
        reject(err);
      });

      child.on('exit', (code) => {
        this.logger.warn(`Python runner exited (code ${String(code)})`);
        const wasStarting = !this.ready;
        this.ready = false;
        this.starting = false;
        this.process = null;
        const exitErr = new Error(`Runner process exited with code ${String(code)}`);
        for (const w of this.readyWaiters) { w.reject(exitErr); }
        this.readyWaiters.length = 0;
        // Reject the startup promise if the process exited before ever becoming ready
        if (wasStarting) {
          reject(exitErr);
        }
        // Reject any pending calls
        for (const cb of this.pending.values()) {
          cb({ ok: false, error: exitErr.message });
        }
        this.pending.clear();
      });

      this.process = child;
    });
  }

  private handleLine(line: string, readyResolve: () => void, readyReject: (e: Error) => void): void {
    let msg: RunnerMessage;
    try {
      msg = JSON.parse(line) as RunnerMessage;
    } catch {
      this.logger.warn(`Runner unparseable line: ${line}`);
      return;
    }

    if (msg.type === 'ready') {
      this.logger.info('Python runner ready.');
      this.ready = true;
      this.starting = false;
      readyResolve();
      for (const w of this.readyWaiters) { w.resolve(); }
      this.readyWaiters.length = 0;
      return;
    }

    if (msg.type === 'error' && !this.ready) {
      const err = new Error(msg.error ?? 'Python runner startup error');
      this.starting = false;
      for (const w of this.readyWaiters) { w.reject(err); }
      this.readyWaiters.length = 0;
      readyReject(err);
      return;
    }

    if (msg.id !== undefined) {
      const cb = this.pending.get(String(msg.id));
      if (cb) {
        this.pending.delete(String(msg.id));
        cb(msg);
      }
    }
  }

  // ── JSON-line protocol ──────────────────────────────────────────────────────

  private async send(method: string, params: JsonObject): Promise<RunnerMessage> {
    await this.ensureProcess();

    const id = String(++this.messageCounter);
    const payload = JSON.stringify({ id, method, params }) + '\n';

    return new Promise<RunnerMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Manul runner timeout for method "${method}" after ${this.options.timeoutMs}ms`));
      }, this.options.timeoutMs);

      this.pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });

      this.process!.stdin!.write(payload);
    });
  }

  // ── type helpers ─────────────────────────────────────────────────────────────

  private toApiResult(msg: RunnerMessage): ApiResult {
    if (msg.ok === false || !msg.ok) {
      return { ok: false, status: 0, error: msg.error ?? 'Python runner error.' };
    }
    return { ok: true, status: 200, data: msg.data ?? {} };
  }
}

// ── DSL header extraction ─────────────────────────────────────────────────────

function extractContext(dsl: string): string | undefined {
  const m = /^@context:\s*(.+)/mu.exec(dsl);
  return m ? m[1].trim() : undefined;
}

function extractTitle(dsl: string): string | undefined {
  const m = /^@title:\s*(.+)/mu.exec(dsl);
  return m ? m[1].trim() : undefined;
}
