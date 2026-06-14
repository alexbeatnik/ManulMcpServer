import { existsSync } from 'node:fs';
import * as path from 'node:path';

import type { ManulRuntimeSetting } from './defaults';

/** The concrete runtime an execution path uses, after resolving 'auto'. */
export type ResolvedRuntime = 'python' | 'go';

export interface RuntimeResolutionInput {
  /** The user's manul.runtime setting (auto | python | go). */
  readonly runtime: ManulRuntimeSetting;
  /** manul.binaryPath — path to the ManulHeart `manul` Go binary, if set. */
  readonly binaryPath: string;
  /** First workspace folder, used to look for a go.mod marker. */
  readonly workspacePath: string;
}

/**
 * Decide which runtime drives `.hunt` execution.
 *
 * Precedence:
 *   1. An explicit setting ('python' | 'go') always wins.
 *   2. 'auto' → 'go' when a ManulHeart binary is configured OR the workspace
 *      looks like a Go project (a go.mod at its root); otherwise 'python'.
 *
 * The go.mod signal mirrors ManulHeart's own README: "Open a workspace
 * containing go.mod and the extension auto-detects the Go runtime." We do not
 * probe a `manul` on PATH because ManulEngine's CLI is also named `manul`, so
 * its presence cannot disambiguate the two runtimes.
 */
export function resolveRuntime(input: RuntimeResolutionInput): ResolvedRuntime {
  if (input.runtime === 'python' || input.runtime === 'go') {
    return input.runtime;
  }

  if (input.binaryPath.trim().length > 0) {
    return 'go';
  }

  if (input.workspacePath && existsSync(path.join(input.workspacePath, 'go.mod'))) {
    return 'go';
  }

  return 'python';
}
