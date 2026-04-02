import type { GoalNormalizationResult, NormalizationResult } from '../types/api';

const TYPO_CORRECTIONS = new Map<string, string>([
  ['clik', 'click'],
  ['clic', 'click'],
  ['clk', 'click'],
  ['naviagte', 'navigate'],
  ['nagivate', 'navigate'],
  ['verfiy', 'verify'],
  ['verfy', 'verify'],
  ['fll', 'fill'],
  ['selct', 'select'],
]);

const KNOWN_ACTIONS = ['click', 'fill', 'type', 'navigate', 'verify', 'select', 'hover', 'check', 'uncheck'];

export function normalizeNaturalLanguageStep(input: string): NormalizationResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      input,
      normalized: '',
      appliedFixes: [],
    };
  }

  const fixes: string[] = [];
  const corrected = correctTypos(trimmed, fixes);

  if (looksLikeDsl(corrected)) {
    return {
      input,
      normalized: corrected,
      appliedFixes: fixes,
    };
  }

  const normalized =
    normalizeClick(corrected, fixes) ??
    normalizeFill(corrected, fixes) ??
    normalizeType(corrected, fixes) ??
    normalizeNavigate(corrected, fixes) ??
    normalizeVerify(corrected, fixes) ??
    normalizeSelect(corrected, fixes) ??
    normalizeHover(corrected, fixes) ??
    normalizeCheckbox(corrected, fixes) ??
    corrected;

  return {
    input,
    normalized,
    appliedFixes: fixes,
  };
}

export function normalizeGoal(goal: string): GoalNormalizationResult {
  const steps: string[] = [];
  const appliedFixes = new Set<string>();

  for (const fragment of splitGoal(goal)) {
    const normalized = normalizeNaturalLanguageStep(fragment);
    if (normalized.normalized) {
      steps.push(normalized.normalized);
      for (const fix of normalized.appliedFixes) {
        appliedFixes.add(fix);
      }
    }
  }

  return {
    goal,
    steps,
    appliedFixes: [...appliedFixes],
  };
}

export function extractRunnableSteps(dsl: string): string[] {
  const steps: string[] = [];
  const lines = dsl.split(/\r?\n/u);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    if (
      trimmed.startsWith('@') ||
      trimmed === '[SETUP]' ||
      trimmed === '[END SETUP]' ||
      trimmed === '[TEARDOWN]' ||
      trimmed === '[END TEARDOWN]' ||
      /^STEP\s+\d*\s*:/iu.test(trimmed) ||
      trimmed === 'DONE.'
    ) {
      continue;
    }

    steps.push(trimmed);
  }

  return steps;
}

function splitGoal(goal: string): string[] {
  return goal
    .split(/\r?\n|\.(?=\s+[A-Za-z])|\bthen\b|\band then\b/iu)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function correctTypos(step: string, fixes: string[]): string {
  const segments = step.split(/(\s+)/u);
  let changed = false;

  const corrected = segments
    .map((segment) => {
      const lower = segment.toLowerCase();
      const replacement = TYPO_CORRECTIONS.get(lower);
      if (!replacement) {
        return segment;
      }

      changed = true;
      return preserveCapitalization(segment, replacement);
    })
    .join('');

  if (changed) {
    fixes.push('Corrected common DSL verb typos.');
  }

  return corrected;
}

function looksLikeDsl(step: string): boolean {
  return /^(?:@\w|\[(?:SETUP|END SETUP|TEARDOWN|END TEARDOWN)\]|STEP\s+\d*\s*:|DONE\.|NAVIGATE\b|OPEN APP\b|WAIT\b|VERIFY\b|DEBUG\b|DEBUG VARS\b|EXTRACT\b|CALL PYTHON\b|SET\b|Click\b|DOUBLE CLICK\b|Fill\b|Type\b|Select\b|Check\b|Uncheck\b|HOVER\b|Drag\b|RIGHT CLICK\b|PRESS\b|MOCK\b|SCAN PAGE\b)/u.test(
    step,
  );
}

function normalizeClick(step: string, fixes: string[]): string | undefined {
  const match = /^(?:click(?: on)?|tap|press)\s+(?:the\s+)?(.+)$/iu.exec(step);
  if (!match) {
    return undefined;
  }

  const rawTarget = stripKnownSuffixes(match[1]);
  fixes.push('Normalized natural-language click into Manul DSL.');
  return `Click the '${escapeSingleQuotes(rawTarget)}' button`;
}

function normalizeFill(step: string, fixes: string[]): string | undefined {
  const match = /^(?:fill|enter)\s+(.+?)\s+(?:with|as)\s+(.+)$/iu.exec(step);
  if (!match) {
    return undefined;
  }

  fixes.push('Normalized natural-language fill into Manul DSL.');
  return `Fill '${escapeSingleQuotes(stripFieldSuffix(match[1]))}' field with '${escapeSingleQuotes(unquote(match[2]))}'`;
}

function normalizeType(step: string, fixes: string[]): string | undefined {
  const match = /^type\s+(.+?)\s+into\s+(?:the\s+)?(.+)$/iu.exec(step);
  if (!match) {
    return undefined;
  }

  fixes.push('Normalized natural-language type into Manul DSL.');
  return `Type '${escapeSingleQuotes(unquote(match[1]))}' into the '${escapeSingleQuotes(stripFieldSuffix(match[2]))}' field`;
}

function normalizeNavigate(step: string, fixes: string[]): string | undefined {
  const match = /^(?:navigate|go|open)\s+(?:to\s+)?(.+)$/iu.exec(step);
  if (!match) {
    return undefined;
  }

  const destination = match[1].trim();
  if (!/^https?:\/\//iu.test(destination) && destination.toUpperCase() !== 'APP') {
    return undefined;
  }

  fixes.push('Normalized navigation into Manul DSL.');
  return destination.toUpperCase() === 'APP' ? 'OPEN APP' : `NAVIGATE to ${destination}`;
}

function normalizeVerify(step: string, fixes: string[]): string | undefined {
  const negative = /^(?:verify|assert|check)\s+(?:that\s+)?(.+?)\s+(?:is\s+)?(?:missing|absent|not present)$/iu.exec(step);
  if (negative) {
    fixes.push('Normalized natural-language verify into Manul DSL.');
    return `VERIFY that '${escapeSingleQuotes(unquote(negative[1]))}' is NOT present`;
  }

  const positive = /^(?:verify|assert|check)\s+(?:that\s+)?(.+?)\s+(?:is\s+)?(?:visible|present|shown)?$/iu.exec(step);
  if (!positive) {
    return undefined;
  }

  fixes.push('Normalized natural-language verify into Manul DSL.');
  return `VERIFY that '${escapeSingleQuotes(unquote(positive[1]))}' is present`;
}

function normalizeSelect(step: string, fixes: string[]): string | undefined {
  const match = /^(?:select|choose)\s+(.+?)\s+from\s+(?:the\s+)?(.+)$/iu.exec(step);
  if (!match) {
    return undefined;
  }

  fixes.push('Normalized natural-language select into Manul DSL.');
  return `Select '${escapeSingleQuotes(unquote(match[1]))}' from the '${escapeSingleQuotes(stripDropdownSuffix(match[2]))}' dropdown`;
}

function normalizeHover(step: string, fixes: string[]): string | undefined {
  const match = /^hover(?: over)?\s+(?:the\s+)?(.+)$/iu.exec(step);
  if (!match) {
    return undefined;
  }

  fixes.push('Normalized natural-language hover into Manul DSL.');
  return `HOVER over the '${escapeSingleQuotes(stripKnownSuffixes(match[1]))}'`;
}

function normalizeCheckbox(step: string, fixes: string[]): string | undefined {
  const checkMatch = /^(check|uncheck)\s+(?:the\s+)?(?:checkbox\s+for\s+)?(.+)$/iu.exec(step);
  if (!checkMatch) {
    return undefined;
  }

  fixes.push('Normalized natural-language checkbox action into Manul DSL.');
  const verb = checkMatch[1].toLowerCase() === 'check' ? 'Check' : 'Uncheck';
  return `${verb} the checkbox for '${escapeSingleQuotes(stripKnownSuffixes(checkMatch[2]))}'`;
}

function stripFieldSuffix(input: string): string {
  return stripKnownSuffixes(input).replace(/\s+(?:field|input)$/iu, '').trim();
}

function stripDropdownSuffix(input: string): string {
  return stripKnownSuffixes(input).replace(/\s+dropdown$/iu, '').trim();
}

function stripKnownSuffixes(input: string): string {
  return unquote(input)
    .replace(/\s+(?:button|link|field|input|dropdown|menu|tab|checkbox|radio button|radio)$/iu, '')
    .trim();
}

function unquote(input: string): string {
  const trimmed = input.trim();
  return trimmed.replace(/^['"]|['"]$/gu, '').trim();
}

function escapeSingleQuotes(input: string): string {
  return input.replace(/'/gu, "\\'");
}

function preserveCapitalization(source: string, replacement: string): string {
  if (!source) {
    return replacement;
  }

  if (source === source.toUpperCase()) {
    return replacement.toUpperCase();
  }

  if (source[0] === source[0].toUpperCase()) {
    return `${replacement[0]?.toUpperCase() ?? ''}${replacement.slice(1)}`;
  }

  return replacement;
}

export function getCommandKeywordSuggestions(): readonly string[] {
  return KNOWN_ACTIONS;
}