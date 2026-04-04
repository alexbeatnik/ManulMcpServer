import type { ManulExtensionSettings } from './settings';
import { DEFAULT_API_BASE_URL, DEFAULT_PYTHON_PATH, normalizeBaseUrl, normalizeTimeout, normalizeBoolean } from './defaults';

export function getRuntimeSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): ManulExtensionSettings {
  return {
    apiBaseUrl: normalizeBaseUrl(env.MANUL_API_BASE_URL ?? DEFAULT_API_BASE_URL),
    requestTimeoutMs: normalizeTimeout(env.MANUL_REQUEST_TIMEOUT_MS),
    sessionId: (env.MANUL_SESSION_ID ?? '').trim(),
    logNormalizedDsl: normalizeBoolean(env.MANUL_LOG_NORMALIZED_DSL, true),
    pythonPath: (env.MANUL_PYTHON_PATH ?? '').trim() || DEFAULT_PYTHON_PATH,
    headless: normalizeBoolean(env.MANUL_HEADLESS, false),
    workspacePath: (env.MANUL_WORKSPACE_PATH ?? '').trim(),
    extensionPath: (env.MANUL_EXTENSION_PATH ?? '').trim(),
  };
}

export function getMcpServerLabelFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const label = env.MANUL_MCP_LABEL?.trim();
  return label && label.length > 0 ? label : 'ManulMcpServer';
}