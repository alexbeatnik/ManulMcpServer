export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  readonly line: number;
  readonly column: number;
  readonly endColumn: number;
  readonly message: string;
  readonly severity: ValidationSeverity;
  readonly code: string;
}

export interface NormalizationResult {
  readonly input: string;
  readonly normalized: string;
  readonly appliedFixes: readonly string[];
}

export interface GoalNormalizationResult {
  readonly goal: string;
  readonly steps: readonly string[];
  readonly appliedFixes: readonly string[];
}

export interface RunStepRequest {
  readonly step: string;
}

export interface RunStepsRequest {
  readonly steps: readonly string[];
  readonly dsl?: string;
}

export interface ApiSuccess<T = unknown> {
  readonly ok: true;
  readonly status: number;
  readonly data: T;
}

export interface ApiFailure {
  readonly ok: false;
  readonly status: number;
  readonly error: string;
  readonly details?: string;
}

export type ApiResult<T = unknown> = ApiSuccess<T> | ApiFailure;

export interface RunExecutionResult {
  readonly normalization: readonly NormalizationResult[];
  readonly issues: readonly ValidationIssue[];
  readonly response: ApiResult;
}

export interface ManulEngineState {
  readonly sessionId?: string;
  readonly status?: string;
  readonly running?: boolean;
  readonly lastError?: string;
  readonly lastRunAt?: string;
  readonly [key: string]: unknown;
}