import type { ValidationIssue } from '../types/api';
import { iterateDslLines } from './parser';

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
  { id: 'use_import', pattern: /^USE\s+[A-Za-z_][\w-]*$/iu },
  { id: 'if_block', pattern: /^IF\s+\S.+:\s*$/iu },
  { id: 'elif_block', pattern: /^ELIF\s+\S.+:\s*$/iu },
  { id: 'else_block', pattern: /^ELSE\s*:\s*$/iu },
  { id: 'done', pattern: /^DONE\.$/iu },
  { id: 'step', pattern: /^STEP\s+\d*\s*:\s*.+$/iu },
  { id: 'metadata', pattern: /^@(context|title|blueprint|tags|var|script|data|schedule|import|export):\s*.+$/iu },
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

const IF_PATTERN = /^IF\s+\S.+:\s*$/iu;
const ELIF_PATTERN = /^ELIF\s+\S.+:\s*$/iu;
const ELSE_PATTERN = /^ELSE\s*:\s*$/iu;

export function validateDocument(documentText: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let currentStepHeader = false;
  let doneSeen = false;
  let lastHookOpenLine = 0;
  let unclosedHook = false;
  let lastConditionalBranch: 'none' | 'if' | 'elif' | 'else' = 'none';

  for (const line of iterateDslLines(documentText)) {
    if (line.kind === 'blank' || line.kind === 'comment') {
      continue;
    }

    if (doneSeen) {
      issues.push(createIssue(line.lineNumber, 1, line.raw.length + 1, 'Content after DONE. is not allowed.', 'warning', 'content-after-done'));
      continue;
    }

    if (line.kind === 'hook_open') {
      if (line.raw !== line.trimmed) {
        issues.push(createIssue(line.lineNumber, 1, line.raw.length + 1, 'Hook block markers must be flush-left.', 'warning', 'indentation-hook-marker'));
      }
      lastHookOpenLine = line.lineNumber;
      unclosedHook = true;
      continue;
    }

    if (line.kind === 'hook_close') {
      if (line.raw !== line.trimmed) {
        issues.push(createIssue(line.lineNumber, 1, line.raw.length + 1, 'Hook block markers must be flush-left.', 'warning', 'indentation-hook-marker'));
      }
      unclosedHook = false;
      continue;
    }

    if (line.insideHookBlock) {
      if (!line.raw.startsWith('    ')) {
        issues.push(createIssue(line.lineNumber, 1, line.raw.length + 1, 'Lines inside hook blocks must use a 4-space indent.', 'warning', 'indentation-hook-body'));
      }
      if (!/^(PRINT\s+".*"|CALL\s+PYTHON\s+.+)$/u.test(line.trimmed)) {
        issues.push(createIssue(line.lineNumber, 1, line.trimmed.length + 1, 'Only PRINT and CALL PYTHON are valid inside hook blocks.', 'error', 'invalid-hook-command'));
      }
      continue;
    }

    if (line.kind === 'metadata') {
      if (line.raw !== line.trimmed) {
        issues.push(createIssue(line.lineNumber, 1, line.raw.length + 1, 'Metadata lines must be flush-left.', 'warning', 'indentation-metadata'));
      }
      continue;
    }

    if (line.kind === 'step_header') {
      if (line.raw !== line.trimmed) {
        issues.push(createIssue(line.lineNumber, 1, line.raw.length + 1, 'STEP headers must be flush-left.', 'warning', 'indentation-step'));
      }
      currentStepHeader = true;
      lastConditionalBranch = 'none';
      continue;
    }

    if (line.kind === 'done') {
      if (line.raw !== line.trimmed) {
        issues.push(createIssue(line.lineNumber, 1, line.raw.length + 1, 'DONE. must be flush-left.', 'warning', 'indentation-done'));
      }
      doneSeen = true;
      currentStepHeader = false;
      lastConditionalBranch = 'none';
      continue;
    }

    // Detect conditional branch headers
    const isIfLine = IF_PATTERN.test(line.trimmed);
    const isElifLine = ELIF_PATTERN.test(line.trimmed);
    const isElseLine = ELSE_PATTERN.test(line.trimmed);

    if (isElifLine) {
      if (lastConditionalBranch === 'else') {
        issues.push(createIssue(line.lineNumber, 1, line.raw.length + 1, 'ELIF cannot appear after ELSE.', 'error', 'elif-after-else'));
      } else if (lastConditionalBranch !== 'if' && lastConditionalBranch !== 'elif') {
        issues.push(createIssue(line.lineNumber, 1, line.raw.length + 1, 'ELIF must follow an IF or ELIF block.', 'error', 'elif-without-if'));
      }
    }

    if (isElseLine) {
      if (lastConditionalBranch === 'else') {
        issues.push(createIssue(line.lineNumber, 1, line.raw.length + 1, 'Only one ELSE block is allowed per IF.', 'error', 'duplicate-else'));
      } else if (lastConditionalBranch !== 'if' && lastConditionalBranch !== 'elif') {
        issues.push(createIssue(line.lineNumber, 1, line.raw.length + 1, 'ELSE must follow an IF or ELIF block.', 'error', 'else-without-if'));
      }
    }

    if (isIfLine || isElifLine || isElseLine) {
      if (isIfLine) { lastConditionalBranch = 'if'; }
      else if (isElifLine) { lastConditionalBranch = 'elif'; }
      else { lastConditionalBranch = 'else'; }

      if (!line.raw.startsWith('    ')) {
        issues.push(createIssue(line.lineNumber, 1, line.raw.length + 1, 'Action lines must be indented with 4 spaces under a STEP header.', 'warning', 'indentation-action'));
      }
      if (!currentStepHeader) {
        issues.push(createIssue(line.lineNumber, 1, line.raw.length + 1, 'Action lines should appear after a STEP header.', 'warning', 'missing-step-header'));
      }
      continue;
    }

    // Body line inside a conditional block — expect 8-space indent
    if (lastConditionalBranch !== 'none') {
      if (line.raw.startsWith('        ')) {
        if (!currentStepHeader) {
          issues.push(createIssue(line.lineNumber, 1, line.raw.length + 1, 'Action lines should appear after a STEP header.', 'warning', 'missing-step-header'));
        }
        issues.push(...validateStep(line.trimmed, line.lineNumber));
        continue;
      }
      if (line.raw.startsWith('    ') && !line.raw.startsWith('        ')) {
        issues.push(createIssue(line.lineNumber, 1, line.raw.length + 1, 'Lines inside a conditional block must use an 8-space indent (4 base + 4 extra).', 'warning', 'indentation-conditional-body'));
        issues.push(...validateStep(line.trimmed, line.lineNumber));
        continue;
      }
      lastConditionalBranch = 'none';
    }

    // action line
    if (!line.raw.startsWith('    ')) {
      issues.push(createIssue(line.lineNumber, 1, line.raw.length + 1, 'Action lines must be indented with 4 spaces under a STEP header.', 'warning', 'indentation-action'));
    }

    if (!currentStepHeader) {
      issues.push(createIssue(line.lineNumber, 1, line.raw.length + 1, 'Action lines should appear after a STEP header.', 'warning', 'missing-step-header'));
    }

    issues.push(...validateStep(line.trimmed, line.lineNumber));
  }

  if (unclosedHook) {
    issues.push(createIssue(lastHookOpenLine, 1, 2, 'Hook block is not closed.', 'error', 'unclosed-hook-block'));
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