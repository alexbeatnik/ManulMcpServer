import { describe, it, expect } from 'vitest';
import { extractRunnableSteps, normalizeNaturalLanguageStep, normalizeGoal } from '../src/dsl/builder';

describe('extractRunnableSteps', () => {
  it('extracts action lines from a well-formed document', () => {
    const dsl = `@context: Test
@title: Test

STEP 1: Navigate
    NAVIGATE to 'https://example.com'
    VERIFY that 'Example' is present

DONE.`;
    const steps = extractRunnableSteps(dsl);
    expect(steps).toEqual([
      "NAVIGATE to 'https://example.com'",
      "VERIFY that 'Example' is present",
    ]);
  });

  it('skips metadata, STEP headers, DONE, and comments', () => {
    const dsl = `@context: ctx
# comment
STEP 1: Test
    Click the 'Button' button
DONE.`;
    expect(extractRunnableSteps(dsl)).toEqual(["Click the 'Button' button"]);
  });

  it('skips hook block contents', () => {
    const dsl = `[SETUP]
    PRINT "hi"
[END SETUP]

STEP 1: Test
    NAVIGATE to 'https://example.com'

DONE.`;
    expect(extractRunnableSteps(dsl)).toEqual(["NAVIGATE to 'https://example.com'"]);
  });

  it('returns empty array for empty input', () => {
    expect(extractRunnableSteps('')).toEqual([]);
  });

  it('ignores import and export metadata lines', () => {
    const dsl = `@import: Login from auth.hunt
@export: Login
STEP 1: Reuse
    USE Login
DONE.`;
    expect(extractRunnableSteps(dsl)).toEqual(['USE Login']);
  });
});

describe('normalizeNaturalLanguageStep', () => {
  it('passes through valid DSL unchanged', () => {
    const result = normalizeNaturalLanguageStep("NAVIGATE to 'https://example.com'");
    expect(result.normalized).toBe("NAVIGATE to 'https://example.com'");
  });

  it('normalizes click command', () => {
    const result = normalizeNaturalLanguageStep('click Submit');
    expect(result.normalized).toContain('Submit');
    expect(result.appliedFixes.length).toBeGreaterThan(0);
  });

  it('normalizes fill command', () => {
    const result = normalizeNaturalLanguageStep('fill Email with test@example.com');
    expect(result.normalized).toContain('Email');
    expect(result.normalized).toContain('test@example.com');
  });

  it('normalizes type command', () => {
    const result = normalizeNaturalLanguageStep('type hello into search');
    expect(result.normalized).toBe("Type 'hello' into the 'search' field");
  });

  it('normalizes navigate command', () => {
    const result = normalizeNaturalLanguageStep('go to https://example.com');
    expect(result.normalized).toBe('NAVIGATE to https://example.com');
  });

  it('normalizes open app navigation', () => {
    const result = normalizeNaturalLanguageStep('open app');
    expect(result.normalized).toBe('OPEN APP');
  });

  it('normalizes verify negative command', () => {
    const result = normalizeNaturalLanguageStep('verify login failed is not present');
    expect(result.normalized).toBe("VERIFY that 'login failed' is NOT present");
  });

  it('normalizes select command', () => {
    const result = normalizeNaturalLanguageStep('choose Admin from role');
    expect(result.normalized).toBe("Select 'Admin' from the 'role' dropdown");
  });

  it('normalizes hover command', () => {
    const result = normalizeNaturalLanguageStep('hover profile menu');
    expect(result.normalized).toBe("HOVER over the 'profile'");
  });

  it('normalizes check and uncheck commands', () => {
    expect(normalizeNaturalLanguageStep('check terms').normalized).toBe("Check the checkbox for 'terms'");
    expect(normalizeNaturalLanguageStep('uncheck newsletter').normalized).toBe("Uncheck the checkbox for 'newsletter'");
  });

  it('preserves USE directive as DSL', () => {
    const result = normalizeNaturalLanguageStep('USE Login');
    expect(result.normalized).toBe('USE Login');
  });

  it('corrects typos', () => {
    const result = normalizeNaturalLanguageStep('clik the button');
    expect(result.appliedFixes).toContain('Corrected common DSL verb typos.');
  });

  it('returns empty for empty input', () => {
    const result = normalizeNaturalLanguageStep('');
    expect(result.normalized).toBe('');
  });
});

describe('normalizeGoal', () => {
  it('splits a multi-sentence goal', () => {
    const result = normalizeGoal('Navigate to https://example.com then click Submit');
    expect(result.steps.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty steps for empty goal', () => {
    const result = normalizeGoal('');
    expect(result.steps).toEqual([]);
  });

  it('splits lines and punctuation into multiple steps', () => {
    const result = normalizeGoal('open app. click Login\nfill Username with admin');
    expect(result.steps).toEqual([
      'OPEN APP',
      "Click the 'Login' button",
      "Fill 'Username' field with 'admin'",
    ]);
  });
});
