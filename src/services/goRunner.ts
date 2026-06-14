import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';

import type { ApiResult, IManulRunner, ManulEngineState } from '../types/api';
import type { ManulLogger } from './logger';
import { ChromeProcess } from './chromeProcess';

export interface GoRunnerOptions {
  /** Path to the ManulHeart `manul` Go binary. Empty → resolve `manul` on PATH. */
  readonly binaryPath: string;
  /** Chrome/Chromium executable for the managed browser session. */
  readonly executablePath: string;
  readonly headless: boolean;
  /** CDP port for the managed Chrome. 0 → auto-pick. */
  readonly cdpPort: number;
  readonly timeoutMs: number;
  readonly workspacePath: string;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

interface CommandResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Drives the ManulHeart (Go) `manul` CLI against a managed Chrome session.
 *
 * ManulHeart's CLI is stateless per invocation, so to give the MCP tools a
 * persistent browser (like the Python runner) this owns a Chrome process with
 * the CDP debug port open and points every `manul` call at it via `--cdp`.
 * Executed steps are accumulated into a `.hunt` proposal on the TS side so
 * manul_run_goal / manul_save_hunt behave the same as on the Python runtime.
 */
export class GoRunner implements IManulRunner {
  private readonly chrome: ChromeProcess;
  private readonly binary: string;
  private readonly executedSteps: string[] = [];
  private proposalContext = '';
  private proposalTitle = '';

  public constructor(
    private readonly options: GoRunnerOptions,
    private readonly logger: ManulLogger,
  ) {
    this.binary = options.binaryPath.trim() || 'manul';
    this.chrome = new ChromeProcess({
      executablePath: options.executablePath,
      port: options.cdpPort,
      headless: options.headless,
      readyTimeoutMs: 30000,
      logger,
    });
  }

  // ── IManulBackend ────────────────────────────────────────────────────────────

  public async runStep(step: string): Promise<ApiResult> {
    let endpoint: string;
    try {
      endpoint = await this.ensureChrome();
    } catch (error) {
      return failure(error);
    }

    this.logger.step(`Executing step (Go): ${step}`);
    const result = await this.exec(['run-step', step, '--compact', '--cdp', endpoint]);
    const outcome = parseJson(result.stdout);
    if (!outcome) {
      return { ok: false, status: 0, error: errorText(result, 'ManulHeart run-step produced no result.') };
    }

    const ok = outcome['ok'] === true;
    if (ok) {
      this.executedSteps.push(step);
    }
    const data: JsonObject = { ...outcome, hunt_proposal: this.buildProposal() };
    if (!ok) {
      return { ok: false, status: 0, error: outcomeError(outcome) };
    }
    return { ok: true, status: 200, data };
  }

  public async runSteps(steps: readonly string[], dsl?: string): Promise<ApiResult> {
    let endpoint: string;
    try {
      endpoint = await this.ensureChrome();
    } catch (error) {
      return failure(error);
    }

    const context = dsl ? extractHeader(dsl, 'context') : undefined;
    const title = dsl ? extractHeader(dsl, 'title') : undefined;
    const huntText = buildHunt(steps, context ?? this.proposalContext, title ?? this.proposalTitle);

    this.logger.step(`Executing ${steps.length} step(s) (Go).`);
    const result = await this.exec(['-', '--json', '--cdp', endpoint], huntText);
    const hunt = parseJson(result.stdout);
    if (!hunt) {
      return { ok: false, status: 0, error: errorText(result, 'ManulHeart run produced no result.') };
    }

    this.executedSteps.push(...steps);
    const success = hunt['success'] === true;
    const data: JsonObject = {
      ...hunt,
      results: mapResults(hunt),
      pass_count: typeof hunt['passed'] === 'number' ? hunt['passed'] : 0,
      total: typeof hunt['total_steps'] === 'number' ? hunt['total_steps'] : steps.length,
      hunt_proposal: this.buildProposal(),
    };
    if (!success) {
      return { ok: false, status: 0, error: huntError(hunt) };
    }
    return { ok: true, status: 200, data };
  }

  public async getState(): Promise<ApiResult<ManulEngineState>> {
    let version = '';
    try {
      const result = await this.exec(['--version']);
      version = result.stdout.trim() || result.stderr.trim();
    } catch {
      version = 'unknown';
    }
    const data: ManulEngineState = {
      runtime: 'go',
      engine: 'ManulHeart',
      engine_version: version,
      browser_open: this.chrome.isAlive(),
      running: this.chrome.isAlive(),
      step_count: this.executedSteps.length,
      hunt_proposal: this.buildProposal(),
    };
    return { ok: true, status: 200, data };
  }

  // ── IManulRunner (MCP-only) ──────────────────────────────────────────────────

  public async proposeHunt(context?: string, title?: string): Promise<ApiResult> {
    if (context) this.proposalContext = context;
    if (title) this.proposalTitle = title;
    return { ok: true, status: 200, data: { hunt_proposal: this.buildProposal() } };
  }

  public async reset(context?: string, title?: string): Promise<ApiResult> {
    this.executedSteps.length = 0;
    this.proposalContext = context ?? '';
    this.proposalTitle = title ?? '';
    return { ok: true, status: 200, data: { hunt_proposal: '' } };
  }

  public async saveHunt(path: string, content: string): Promise<ApiResult> {
    try {
      await fs.writeFile(path, content, 'utf8');
      return { ok: true, status: 200, data: { path, bytes: Buffer.byteLength(content, 'utf8') } };
    } catch (error) {
      return failure(error);
    }
  }

  public async scanPage(): Promise<ApiResult> {
    let endpoint: string;
    try {
      endpoint = await this.ensureChrome();
    } catch (error) {
      return failure(error);
    }
    const result = await this.exec(['map', '--cdp', endpoint]);
    const map = parseJson(result.stdout);
    if (!map) {
      return { ok: false, status: 0, error: errorText(result, 'ManulHeart map produced no result.') };
    }
    return { ok: true, status: 200, data: map };
  }

  public async readPageText(): Promise<ApiResult> {
    let endpoint: string;
    try {
      endpoint = await this.ensureChrome();
    } catch (error) {
      return failure(error);
    }
    const result = await this.exec(['read', '--selector', 'body', '--cdp', endpoint, '--json']);
    const read = parseJson(result.stdout);
    if (!read) {
      return { ok: false, status: 0, error: errorText(result, 'ManulHeart read produced no result.') };
    }
    return { ok: true, status: 200, data: { text: typeof read['text'] === 'string' ? read['text'] : '' } };
  }

  public async shutdown(): Promise<void> {
    this.chrome.kill();
  }

  // ── internals ────────────────────────────────────────────────────────────────

  private async ensureChrome(): Promise<string> {
    await this.chrome.ensureRunning();
    return this.chrome.endpoint();
  }

  private buildProposal(): string {
    if (this.executedSteps.length === 0) {
      return '';
    }
    return buildHunt(this.executedSteps, this.proposalContext, this.proposalTitle);
  }

  private exec(args: readonly string[], stdin?: string): Promise<CommandResult> {
    return new Promise<CommandResult>((resolve, reject) => {
      const child = spawn(this.binary, [...args], {
        cwd: this.options.workspacePath || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      child.stdout!.setEncoding('utf8');
      child.stderr!.setEncoding('utf8');
      child.stdout!.on('data', (chunk: string) => { stdout += chunk; });
      child.stderr!.on('data', (chunk: string) => { stderr += chunk; });

      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`ManulHeart "${args[0]}" timed out after ${this.options.timeoutMs}ms.`));
      }, this.options.timeoutMs);

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`Failed to run ManulHeart binary "${this.binary}": ${err.message}`));
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });

      if (stdin !== undefined) {
        child.stdin!.write(stdin);
      }
      child.stdin!.end();
    });
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

export function buildHunt(steps: readonly string[], context: string, title: string): string {
  const lines: string[] = [];
  if (context.trim()) lines.push(`@context: ${context.trim()}`);
  if (title.trim()) lines.push(`@title: ${title.trim()}`);
  if (lines.length > 0) lines.push('');
  lines.push('STEP 1: Mission');
  for (const step of steps) {
    lines.push(`    ${step}`);
  }
  lines.push('DONE.');
  return lines.join('\n') + '\n';
}

export function extractHeader(dsl: string, key: 'context' | 'title'): string | undefined {
  const m = new RegExp(String.raw`^@${key}:\s*(.+)`, 'mu').exec(dsl);
  return m ? m[1].trim() : undefined;
}

/** ManulHeart routes logs to stderr in --json mode, so stdout is pure JSON. */
export function parseJson(stdout: string): JsonObject | null {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const value = JSON.parse(trimmed) as JsonValue;
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** Map a HuntResult's per-command results into the {step, status, error} shape. */
export function mapResults(hunt: JsonObject): JsonValue {
  const results = hunt['results'];
  if (!Array.isArray(results)) {
    return [];
  }
  return results.map((entry) => {
    const r = (entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {}) as JsonObject;
    return {
      step: typeof r['step'] === 'string' ? r['step'] : '',
      status: r['success'] === true ? 'pass' : 'fail',
      error: typeof r['error'] === 'string' ? r['error'] : '',
    };
  });
}

function outcomeError(outcome: JsonObject): string {
  const error = typeof outcome['error'] === 'string' ? outcome['error'] : '';
  const reason = typeof outcome['reason'] === 'string' ? outcome['reason'] : '';
  return error || reason || 'ManulHeart step failed.';
}

function huntError(hunt: JsonObject): string {
  const results = hunt['results'];
  if (Array.isArray(results)) {
    for (const entry of results) {
      const r = (entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {}) as JsonObject;
      if (r['success'] !== true && typeof r['error'] === 'string' && r['error']) {
        return r['error'];
      }
    }
  }
  const failed = typeof hunt['failed'] === 'number' ? hunt['failed'] : 0;
  return `ManulHeart run failed (${failed} step(s) failed).`;
}

function errorText(result: CommandResult, fallback: string): string {
  const stderr = result.stderr.trim();
  return stderr || fallback;
}

function failure(error: unknown): ApiResult {
  return { ok: false, status: 0, error: error instanceof Error ? error.message : 'ManulHeart runner error.' };
}
