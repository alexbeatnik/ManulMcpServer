import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';

const MANUL_CONFIGURATION_SECTION = 'manul';
const SESSION_STATE_KEY = 'manul.sessionId';

export interface ManulExtensionSettings {
  readonly apiBaseUrl: string;
  readonly requestTimeoutMs: number;
  readonly sessionId: string;
  readonly logNormalizedDsl: boolean;
  readonly pythonPath: string;
  readonly headless: boolean;
  readonly workspacePath: string;
}

export async function getExtensionSettings(
  context: vscode.ExtensionContext,
): Promise<ManulExtensionSettings> {
  const configuration = vscode.workspace.getConfiguration(MANUL_CONFIGURATION_SECTION);
  const configuredSessionId = configuration.get<string>('sessionId', '').trim();

  const sessionId = configuredSessionId || (await getOrCreateSessionId(context));

  return {
    apiBaseUrl: normalizeBaseUrl(configuration.get<string>('apiBaseUrl', 'http://127.0.0.1:8000')),
    requestTimeoutMs: normalizeTimeout(configuration.get<number>('requestTimeoutMs', 60000)),
    sessionId,
    logNormalizedDsl: configuration.get<boolean>('logNormalizedDsl', true),
    pythonPath: configuration.get<string>('pythonPath', 'python3').trim() || 'python3',
    headless: configuration.get<boolean>('headless', false),
    workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '',
  };
}

async function getOrCreateSessionId(context: vscode.ExtensionContext): Promise<string> {
  const existing = context.globalState.get<string>(SESSION_STATE_KEY);
  if (existing && existing.trim().length > 0) {
    return existing;
  }

  const generated = randomUUID();
  await context.globalState.update(SESSION_STATE_KEY, generated);
  return generated;
}

function normalizeBaseUrl(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return 'http://127.0.0.1:8000';
  }

  return trimmed.replace(/\/+$/, '');
}

function normalizeTimeout(rawValue: number): number {
  if (!Number.isFinite(rawValue)) {
    return 60000;
  }

  return Math.max(1000, Math.trunc(rawValue));
}