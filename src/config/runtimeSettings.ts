import type { ManulExtensionSettings } from './settings';

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000';
const DEFAULT_TIMEOUT_MS = 60000;

export function getRuntimeSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): ManulExtensionSettings {
  return {
    apiBaseUrl: normalizeBaseUrl(env.MANUL_API_BASE_URL ?? DEFAULT_API_BASE_URL),
    requestTimeoutMs: normalizeTimeout(env.MANUL_REQUEST_TIMEOUT_MS),
    sessionId: (env.MANUL_SESSION_ID ?? '').trim(),
    logNormalizedDsl: normalizeBoolean(env.MANUL_LOG_NORMALIZED_DSL, true),
  };
}

export function getMcpServerLabelFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const label = env.MANUL_MCP_LABEL?.trim();
  return label && label.length > 0 ? label : 'ManulMcpServer';
}

function normalizeBaseUrl(rawValue: string): string {
  const trimmed = rawValue.trim();
  return trimmed.length > 0 ? trimmed.replace(/\/+$/u, '') : DEFAULT_API_BASE_URL;
}

function normalizeTimeout(rawValue: string | undefined): number {
  const parsed = Number(rawValue ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.max(1000, Math.trunc(parsed));
}

function normalizeBoolean(rawValue: string | undefined, fallback: boolean): boolean {
  if (typeof rawValue !== 'string') {
    return fallback;
  }

  switch (rawValue.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true;
    case '0':
    case 'false':
    case 'no':
    case 'off':
      return false;
    default:
      return fallback;
  }
}