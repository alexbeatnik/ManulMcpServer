export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000';
export const DEFAULT_TIMEOUT_MS = 60000;
export const DEFAULT_PYTHON_PATH = 'python3';

export function normalizeBaseUrl(rawValue: string): string {
  const trimmed = rawValue.trim();
  return trimmed.length > 0 ? trimmed.replace(/\/+$/u, '') : DEFAULT_API_BASE_URL;
}

export function normalizeTimeout(rawValue: number | string | undefined): number {
  const parsed = Number(rawValue ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.max(1000, Math.trunc(parsed));
}

export function normalizeBoolean(rawValue: string | undefined, fallback: boolean): boolean {
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
