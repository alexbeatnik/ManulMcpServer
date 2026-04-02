import type { ValidationIssue } from '../types/api';

const QUOTED = String.raw`['"][^'"]+['"]`;
const OPTIONAL_IF_EXISTS = String.raw`(?:\s+if exists)?`;
const OPTIONAL_QUALIFIER = String.raw`(?:\s+(?:NEAR\s+['"][^'"]+['"]|ON\s+(?:HEADER|FOOTER)|INSIDE\s+['"][^'"]+['"]\s+row\s+with\s+['"][^'"]+['"]))?`;

const LINE_PATTERNS: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: 'navigate', pattern: /^NAVIGATE\s+to\s+\S.+$/iu },
  { id: 'open_app', pattern: /^OPEN\s+APP$/iu },
  { id: 'click', pattern: new RegExp(`^(?:Click(?: on)?\\s+(?:the\\s+)?${QUOTED}\\s+(?:button|link|menu|tab|element)|Click\\s+the\\s+radio button\\s+for\\s+${QUOTED})${OPTIONAL_QUALIFIER}${OPTIONAL_IF_EXISTS}$`, 'iu') },
  { id: 'double_click', pattern: new RegExp(`^DOUBLE\\s+CLICK\\s+(?:the\\s+)?${QUOTED}(?:\\s+(?:button|link|element|menu|tab))?${OPTIONAL_QUALIFIER}${OPTIONAL_IF_EXISTS}$`, 'iu') },
  { id: 'check', pattern: new RegExp(`^Check\\s+the\\s+checkbox\\s+for\\s+${QUOTED}${OPTIONAL_QUALIFIER}${OPTIONAL_IF_EXISTS}$`, 'iu') },
  { id: 'uncheck', pattern: new RegExp(`^Uncheck\\s+the\\s+checkbox\\s+for\\s+${QUOTED}${OPTIONAL_QUALIFIER}${OPTIONAL_IF_EXISTS}$`, 'iu') },
  { id: 'fill', pattern: new RegExp(`^Fill\\s+${QUOTED}\\s+(?:field|input)\\s+with\\s+${QUOTED}${OPTIONAL_QUALIFIER}${OPTIONAL_IF_EXISTS}$`, 'iu') },
  { id: 'type', pattern: new RegExp(`^Type\\s+${QUOTED}\\s+into\\s+(?:the\\s+)?${QUOTED}\\s+(?:field|input|element)${OPTIONAL_QUALIFIER}${OPTIONAL_IF_EXISTS}$`, 'iu') },
  { id: 'select', pattern: new RegExp(`^Select\\s+${QUOTED}\\s+from\\s+(?:the\\s+)?${QUOTED}\\s+dropdown${OPTIONAL_QUALIFIER}${OPTIONAL_IF_EXISTS}$`, 'iu') },
  { id: 'hover', pattern: new RegExp(`^HOVER\\s+over\\s+(?:the\\s+)?${QUOTED}(?:\\s+(?:menu|button|link|element))?${OPTIONAL_QUALIFIER}${OPTIONAL_IF_EXISTS}$`, 'iu') },
  { id: 'drag', pattern: new RegExp(`^Drag\\s+(?:the\\s+element\\s+)?${QUOTED}\\s+and\\s+drop\\s+it\\s+into\\s+${QUOTED}${OPTIONAL_IF_EXISTS}$`, 'iu') },
  { id: 'scroll', pattern: /^SCROLL\s+DOWN(?:\s+inside\s+the\s+.+)?$/iu },
  { id: 'wait', pattern: /^WAIT\s+\d+(?:\.\d+)?$/iu },
  { id: 'wait_for_element', pattern: new RegExp(`^Wait\\s+for\\s+${QUOTED}\\s+to\\s+(?:be\\s+(?:visible|hidden)|disappear)$`, 'iu') },
  { id: 'wait_for_response', pattern: /^WAIT\s+FOR\s+RESPONSE\s+["'].+["']$/iu },
  { id: 'extract', pattern: new RegExp(`^EXTRACT\\s+the\\s+${QUOTED}\\s+into\\s+\\{[A-Za-z_]\\w*\\}$`, 'iu') },
  { id: 'verify', pattern: new RegExp(`^VERIFY\\s+that\\s+${QUOTED}\\s+is\\s+(?:present|NOT present|ENABLED|DISABLED|checked|NOT checked)$`, 'iu') },
  { id: 'verify_text_strict', pattern: new RegExp(`^Verify\\s+${QUOTED}\\s+(?:button|field|element|input)\\s+has\\s+text\\s+${QUOTED}$`, 'iu') },
  { id: 'verify_placeholder_strict', pattern: new RegExp(`^Verify\\s+${QUOTED}\\s+(?:button|field|element|input)\\s+has\\s+placeholder\\s+${QUOTED}$`, 'iu') },
  { id: 'verify_value_strict', pattern: new RegExp(`^Verify\\s+${QUOTED}\\s+(?:button|field|element|input)\\s+has\\s+value\\s+${QUOTED}$`, 'iu') },
  { id: 'verify_softly', pattern: new RegExp(`^VERIFY\\s+SOFTLY\\s+that\\s+${QUOTED}\\s+is\\s+(?:present|NOT present|ENABLED|DISABLED|checked|NOT checked)$`, 'iu') },
  { id: 'verify_visual', pattern: new RegExp(`^VERIFY\\s+VISUAL\\s+${QUOTED}$`, 'iu') },
  { id: 'press_enter', pattern: /^PRESS\s+ENTER$/iu },
  { id: 'press', pattern: new RegExp(`^PRESS\\s+[A-Za-z0-9+_-]+(?:\\s+on\\s+${QUOTED})?$`, 'iu') },
  { id: 'right_click', pattern: new RegExp(`^RIGHT\\s+CLICK\\s+${QUOTED}${OPTIONAL_QUALIFIER}${OPTIONAL_IF_EXISTS}$`, 'iu') },
  { id: 'upload', pattern: new RegExp(`^UPLOAD\\s+${QUOTED}\\s+to\\s+${QUOTED}${OPTIONAL_IF_EXISTS}$`, 'iu') },
  { id: 'mock', pattern: new RegExp(`^MOCK\\s+(?:GET|POST|PUT|PATCH|DELETE)\\s+["'].+["']\\s+with\\s+${QUOTED}$`, 'iu') },
  { id: 'scan_page', pattern: /^SCAN\s+PAGE(?:\s+into\s+\{[A-Za-z_]\w*\})?$/iu },
  { id: 'call_python', pattern: /^CALL\s+PYTHON\s+(?:\{[A-Za-z_]\w*\}(?:\.\w+)?|[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+)(?:\s+with\s+args:\s+(?:["'][^"']*["']\s*)+)?(?:\s+(?:into|to)\s+\{[A-Za-z_]\w*\})?$/iu },
  { id: 'set_var', pattern: /^SET\s+(?:\{[A-Za-z_]\w*\}|[A-Za-z_]\w*)\s*=\s*.+$/iu },
  { id: 'debug_vars', pattern: /^DEBUG\s+VARS$/iu },
  { id: 'debug', pattern: /^(?:DEBUG|PAUSE)$/iu },
  { id: 'done', pattern: /^DONE\.$/iu },
  { id: 'step', pattern: /^STEP\s+\d*\s*:\s*.+$/iu },
  { id: 'metadata', pattern: /^@(context|title|blueprint|tags|var|script|data|schedule):\s*.+$/iu },
  { id: 'hook_marker', pattern: /^\[(?:SETUP|END SETUP|TEARDOWN|END TEARDOWN)\]$/iu },
  { id: 'hook_print', pattern: /^PRINT\s+".*"$/u },
];

export function validateStep(step: string, lineNumber = 1): ValidationIssue[] {
  const trimmed = step.trim();
  if (!trimmed) {
    return [];
  }

  if (isRecognizedLine(trimmed)) {
    return [];
  }

  return [
    createIssue(lineNumber, 1, trimmed.length + 1, 'Unknown or malformed Manul DSL command.', 'error', 'invalid-command'),
  ];
}

export function validateDocument(documentText: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lines = documentText.split(/\r?\n/u);
  let insideHookBlock = false;
  let currentHookStartLine = 0;
  let currentStepHeader = false;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? '';
    const lineNumber = index + 1;
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    if (/^\[(SETUP|TEARDOWN)\]$/iu.test(trimmed)) {
      if (rawLine !== trimmed) {
        issues.push(createIssue(lineNumber, 1, rawLine.length + 1, 'Hook block markers must be flush-left.', 'warning', 'indentation-hook-marker'));
      }

      insideHookBlock = true;
      currentHookStartLine = lineNumber;
      continue;
    }

    if (/^\[END\s+(SETUP|TEARDOWN)\]$/iu.test(trimmed)) {
      if (rawLine !== trimmed) {
        issues.push(createIssue(lineNumber, 1, rawLine.length + 1, 'Hook block markers must be flush-left.', 'warning', 'indentation-hook-marker'));
      }

      insideHookBlock = false;
      currentHookStartLine = 0;
      continue;
    }

    if (insideHookBlock) {
      if (!rawLine.startsWith('    ')) {
        issues.push(createIssue(lineNumber, 1, rawLine.length + 1, 'Lines inside hook blocks must use a 4-space indent.', 'warning', 'indentation-hook-body'));
      }

      if (!/^(PRINT\s+".*"|CALL\s+PYTHON\s+.+)$/u.test(trimmed)) {
        issues.push(createIssue(lineNumber, 1, trimmed.length + 1, 'Only PRINT and CALL PYTHON are valid inside hook blocks.', 'error', 'invalid-hook-command'));
      }
      continue;
    }

    if (/^@(context|title|blueprint|tags|var|script|data|schedule):/iu.test(trimmed)) {
      if (rawLine !== trimmed) {
        issues.push(createIssue(lineNumber, 1, rawLine.length + 1, 'Metadata lines must be flush-left.', 'warning', 'indentation-metadata'));
      }
      continue;
    }

    if (/^STEP\s+\d*\s*:/iu.test(trimmed)) {
      if (rawLine !== trimmed) {
        issues.push(createIssue(lineNumber, 1, rawLine.length + 1, 'STEP headers must be flush-left.', 'warning', 'indentation-step'));
      }
      currentStepHeader = true;
      continue;
    }

    if (trimmed === 'DONE.') {
      if (rawLine !== trimmed) {
        issues.push(createIssue(lineNumber, 1, rawLine.length + 1, 'DONE. must be flush-left.', 'warning', 'indentation-done'));
      }
      continue;
    }

    if (!rawLine.startsWith('    ')) {
      issues.push(createIssue(lineNumber, 1, rawLine.length + 1, 'Action lines must be indented with 4 spaces under a STEP header.', 'warning', 'indentation-action'));
    }

    if (!currentStepHeader) {
      issues.push(createIssue(lineNumber, 1, rawLine.length + 1, 'Action lines should appear after a STEP header.', 'warning', 'missing-step-header'));
    }

    issues.push(...validateStep(trimmed, lineNumber));
  }

  if (insideHookBlock) {
    issues.push(createIssue(currentHookStartLine, 1, 2, 'Hook block is not closed.', 'error', 'unclosed-hook-block'));
  }

  return issues;
}

export function isRecognizedLine(line: string): boolean {
  return LINE_PATTERNS.some(({ pattern }) => pattern.test(line));
}

export function suggestClosestCommand(input: string, candidates: readonly string[]): string | undefined {
  const normalized = input.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  let bestMatch: { word: string; distance: number } | undefined;

  for (const candidate of candidates) {
    const distance = levenshteinDistance(normalized, candidate.toLowerCase());
    if (!bestMatch || distance < bestMatch.distance) {
      bestMatch = { word: candidate, distance };
    }
  }

  if (!bestMatch || bestMatch.distance > 3) {
    return undefined;
  }

  return bestMatch.word;
}

function createIssue(
  line: number,
  column: number,
  endColumn: number,
  message: string,
  severity: ValidationIssue['severity'],
  code: string,
): ValidationIssue {
  return {
    line,
    column,
    endColumn,
    message,
    severity,
    code,
  };
}

function levenshteinDistance(left: string, right: string): number {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(columns).fill(0));

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row;
  }

  for (let column = 0; column < columns; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost,
      );
    }
  }

  return matrix[rows - 1][columns - 1];
}