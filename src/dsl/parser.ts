export type DslLineKind = 'blank' | 'comment' | 'metadata' | 'step_header' | 'done' | 'hook_open' | 'hook_close' | 'action';

export interface DslLine {
  readonly kind: DslLineKind;
  readonly raw: string;
  readonly trimmed: string;
  readonly lineNumber: number;
  readonly insideHookBlock: boolean;
}

export function* iterateDslLines(dsl: string): Generator<DslLine> {
  const lines = dsl.split(/\r?\n/u);
  let insideHookBlock = false;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? '';
    const trimmed = raw.trim();
    const lineNumber = index + 1;

    if (!trimmed) {
      yield { kind: 'blank', raw, trimmed, lineNumber, insideHookBlock };
      continue;
    }

    if (trimmed.startsWith('#')) {
      yield { kind: 'comment', raw, trimmed, lineNumber, insideHookBlock };
      continue;
    }

    if (/^\[(SETUP|TEARDOWN)\]$/iu.test(trimmed)) {
      insideHookBlock = true;
      yield { kind: 'hook_open', raw, trimmed, lineNumber, insideHookBlock };
      continue;
    }

    if (/^\[END\s+(SETUP|TEARDOWN)\]$/iu.test(trimmed)) {
      yield { kind: 'hook_close', raw, trimmed, lineNumber, insideHookBlock };
      insideHookBlock = false;
      continue;
    }

    if (/^@(context|title|blueprint|tags|var|script|data|schedule):/iu.test(trimmed)) {
      yield { kind: 'metadata', raw, trimmed, lineNumber, insideHookBlock };
      continue;
    }

    if (/^STEP\s+\d*\s*:/iu.test(trimmed)) {
      yield { kind: 'step_header', raw, trimmed, lineNumber, insideHookBlock };
      continue;
    }

    if (trimmed === 'DONE.') {
      yield { kind: 'done', raw, trimmed, lineNumber, insideHookBlock };
      continue;
    }

    yield { kind: 'action', raw, trimmed, lineNumber, insideHookBlock };
  }
}
