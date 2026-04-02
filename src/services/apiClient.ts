import type { ManulExtensionSettings } from '../config/settings';
import type { ApiFailure, ApiResult, ApiSuccess, ManulEngineState } from '../types/api';

export class ManulApiClient {
  public constructor(
    private readonly settingsProvider: () => Promise<ManulExtensionSettings>,
  ) {}

  public async runStep(step: string): Promise<ApiResult> {
    return this.request('/run-step', {
      method: 'POST',
      body: JSON.stringify({ step }),
    });
  }

  public async runSteps(steps: readonly string[], dsl?: string): Promise<ApiResult> {
    return this.request('/run-steps', {
      method: 'POST',
      body: JSON.stringify({ steps, dsl }),
    });
  }

  public async getState(): Promise<ApiResult<ManulEngineState>> {
    return this.request<ManulEngineState>('/state', {
      method: 'GET',
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<ApiResult<T>> {
    const settings = await this.settingsProvider();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), settings.requestTimeoutMs);

    try {
      const response = await fetch(`${settings.apiBaseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
          sessionId: settings.sessionId,
          ...(init.headers ?? {}),
        },
      });

      const payload = await parseResponse<T>(response);

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: payload.error,
          details: payload.details,
        } satisfies ApiFailure;
      }

      return {
        ok: true,
        status: response.status,
        data: payload.data,
      } satisfies ApiSuccess<T>;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          ok: false,
          status: 408,
          error: `Request to ${path} timed out after ${settings.requestTimeoutMs}ms.`,
        } satisfies ApiFailure;
      }

      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : 'Unknown Manul API error.',
      } satisfies ApiFailure;
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function parseResponse<T>(response: Response): Promise<{
  data: T;
  error: string;
  details?: string;
}> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const json = (await response.json()) as T & { error?: string; detail?: string };
    return {
      data: json,
      error: readErrorMessage(json, response.statusText),
      details: typeof json.detail === 'string' ? json.detail : undefined,
    };
  }

  const text = await response.text();
  return {
    data: text as T,
    error: text || response.statusText || 'Unknown API error.',
    details: text || undefined,
  };
}

function readErrorMessage(payload: { error?: string; detail?: string }, fallback: string): string {
  if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
    return payload.error;
  }

  if (typeof payload.detail === 'string' && payload.detail.trim().length > 0) {
    return payload.detail;
  }

  return fallback || 'Unknown API error.';
}