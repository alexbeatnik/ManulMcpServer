import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { DEFAULT_API_BASE_URL, DEFAULT_TIMEOUT_MS, DEFAULT_PYTHON_PATH, normalizeBaseUrl, normalizeTimeout } from './defaults';

const MANUL_CONFIGURATION_SECTION = 'manul';
const SESSION_STATE_KEY = 'manul.sessionId';

export interface ManulExtensionSettings {
  readonly apiBaseUrl: string;
  readonly requestTimeoutMs: number;
  readonly sessionId: string;
  readonly logNormalizedDsl: boolean;
  readonly pythonPath: string;
  readonly executablePath: string;
  readonly headless: boolean;
  readonly workspacePath: string;
  readonly extensionPath: string;
}

export async function getExtensionSettings(
  context: vscode.ExtensionContext,
): Promise<ManulExtensionSettings> {
  const configuration = vscode.workspace.getConfiguration(MANUL_CONFIGURATION_SECTION);
  const configuredSessionId = configuration.get<string>('sessionId', '').trim();

  const sessionId = configuredSessionId || (await getOrCreateSessionId(context));

  return {
    apiBaseUrl: normalizeBaseUrl(configuration.get<string>('apiBaseUrl', DEFAULT_API_BASE_URL)),
    requestTimeoutMs: normalizeTimeout(configuration.get<number>('requestTimeoutMs', DEFAULT_TIMEOUT_MS)),
    sessionId,
    logNormalizedDsl: configuration.get<boolean>('logNormalizedDsl', true),
    pythonPath: configuration.get<string>('pythonPath', DEFAULT_PYTHON_PATH).trim() || DEFAULT_PYTHON_PATH,
    executablePath: configuration.get<string>('executablePath', '').trim(),
    headless: configuration.get<boolean>('headless', false),
    workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '',
    extensionPath: context.extensionPath,
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