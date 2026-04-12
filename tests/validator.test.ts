import { describe, it, expect } from 'vitest';
import { validateStep, validateDocument, isRecognizedLine } from '../src/dsl/validator';

describe('validateStep', () => {
  it('accepts valid NAVIGATE command', () => {
    expect(validateStep("NAVIGATE to 'https://example.com'")).toEqual([]);
  });

  it('accepts valid Click command', () => {
    expect(validateStep("Click the 'Submit' button")).toEqual([]);
  });

  it('accepts valid Fill command', () => {
    expect(validateStep("Fill 'Email' field with 'test@example.com'")).toEqual([]);
  });

  it('accepts valid Type command', () => {
    expect(validateStep("Type 'hello' into the 'Search' field")).toEqual([]);
  });

  it('accepts valid VERIFY command', () => {
    expect(validateStep("VERIFY that 'Success' is present")).toEqual([]);
  });

  it('accepts valid VERIFY SOFTLY command', () => {
    expect(validateStep("VERIFY SOFTLY that 'Warning' is present")).toEqual([]);
  });

  it('accepts valid Select command', () => {
    expect(validateStep("Select 'Option A' from the 'Dropdown' dropdown")).toEqual([]);
  });

  it('accepts DONE.', () => {
    expect(validateStep('DONE.')).toEqual([]);
  });

  it('accepts STEP header', () => {
    expect(validateStep('STEP 1: Navigate to homepage')).toEqual([]);
  });

  it('accepts PRESS ENTER', () => {
    expect(validateStep('PRESS ENTER')).toEqual([]);
  });

  it('accepts PRESS key combo', () => {
    expect(validateStep('PRESS Control+A')).toEqual([]);
  });

  it('accepts WAIT command', () => {
    expect(validateStep('WAIT 2')).toEqual([]);
  });

  it('accepts EXTRACT command', () => {
    expect(validateStep("EXTRACT the 'Price' into {price}")).toEqual([]);
  });

  it('accepts SET variable', () => {
    expect(validateStep('SET {name} = John')).toEqual([]);
  });

  it('accepts SCROLL DOWN', () => {
    expect(validateStep('SCROLL DOWN')).toEqual([]);
  });

  it('accepts DEBUG', () => {
    expect(validateStep('DEBUG')).toEqual([]);
  });

  it('accepts SCAN PAGE', () => {
    expect(validateStep('SCAN PAGE')).toEqual([]);
  });

  it('accepts USE import directive expansion', () => {
    expect(validateStep('USE Login')).toEqual([]);
  });

  it('rejects unknown command', () => {
    const issues = validateStep('FOOBAR something');
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].code).toBe('invalid-command');
  });

  it('accepts empty input', () => {
    expect(validateStep('')).toEqual([]);
  });

  it('accepts Click with qualifier NEAR', () => {
    expect(validateStep("Click the 'Edit' button NEAR 'John Doe'")).toEqual([]);
  });

  it('accepts Check checkbox', () => {
    expect(validateStep("Check the checkbox for 'Terms'")).toEqual([]);
  });

  it('accepts Uncheck checkbox', () => {
    expect(validateStep("Uncheck the checkbox for 'Newsletter'")).toEqual([]);
  });

  it('accepts IF block header', () => {
    expect(validateStep("IF button 'Save' exists:")).toEqual([]);
  });

  it('accepts ELIF block header', () => {
    expect(validateStep("ELIF text 'Error' is present:")).toEqual([]);
  });

  it('accepts ELSE block header', () => {
    expect(validateStep('ELSE:')).toEqual([]);
  });
});

describe('validateDocument', () => {
  it('validates a well-formed document', () => {
    const doc = `@context: Test context
@title: Test

STEP 1: Navigate
    NAVIGATE to 'https://example.com'
    VERIFY that 'Example' is present

DONE.`;
    expect(validateDocument(doc)).toEqual([]);
  });

  it('warns about content after DONE.', () => {
    const doc = `STEP 1: Test
    NAVIGATE to 'https://example.com'
DONE.
    VERIFY that 'Something' is present`;
    const issues = validateDocument(doc);
    expect(issues.some((i) => i.code === 'content-after-done')).toBe(true);
  });

  it('warns about missing STEP header', () => {
    const doc = `    NAVIGATE to 'https://example.com'`;
    const issues = validateDocument(doc);
    expect(issues.some((i) => i.code === 'missing-step-header')).toBe(true);
  });

  it('warns about indented STEP header', () => {
    const doc = `    STEP 1: Test
    NAVIGATE to 'https://example.com'`;
    const issues = validateDocument(doc);
    expect(issues.some((i) => i.code === 'indentation-step')).toBe(true);
  });

  it('reports unclosed hook block', () => {
    const doc = `[SETUP]
    PRINT "hello"`;
    const issues = validateDocument(doc);
    expect(issues.some((i) => i.code === 'unclosed-hook-block')).toBe(true);
  });

  it('validates hook block content', () => {
    const doc = `[SETUP]
    NAVIGATE to 'https://example.com'
[END SETUP]`;
    const issues = validateDocument(doc);
    expect(issues.some((i) => i.code === 'invalid-hook-command')).toBe(true);
  });

  it('validates a well-formed conditional block', () => {
    const doc = `STEP 1: Conditional
    IF button 'Save' exists:
        Click the 'Save' button
    ELIF text 'Error' is present:
        Click the 'Retry' button
    ELSE:
        Click the 'Cancel' button

DONE.`;
    expect(validateDocument(doc)).toEqual([]);
  });

  it('validates IF with body only (no ELIF/ELSE)', () => {
    const doc = `STEP 1: Conditional
    IF button 'Save' exists:
        Click the 'Save' button

DONE.`;
    expect(validateDocument(doc)).toEqual([]);
  });

  it('reports ELIF without preceding IF', () => {
    const doc = `STEP 1: Test
    ELIF text 'Error' is present:
        Click the 'Retry' button`;
    const issues = validateDocument(doc);
    expect(issues.some((i) => i.code === 'elif-without-if')).toBe(true);
  });

  it('reports ELSE without preceding IF', () => {
    const doc = `STEP 1: Test
    ELSE:
        Click the 'Cancel' button`;
    const issues = validateDocument(doc);
    expect(issues.some((i) => i.code === 'else-without-if')).toBe(true);
  });

  it('reports ELIF after ELSE', () => {
    const doc = `STEP 1: Test
    IF button 'Save' exists:
        Click the 'Save' button
    ELSE:
        Click the 'Cancel' button
    ELIF text 'Error' is present:
        Click the 'Retry' button`;
    const issues = validateDocument(doc);
    expect(issues.some((i) => i.code === 'elif-after-else')).toBe(true);
  });

  it('reports duplicate ELSE', () => {
    const doc = `STEP 1: Test
    IF button 'Save' exists:
        Click the 'Save' button
    ELSE:
        Click the 'Cancel' button
    ELSE:
        Click the 'Retry' button`;
    const issues = validateDocument(doc);
    expect(issues.some((i) => i.code === 'duplicate-else')).toBe(true);
  });

  it('validates 8-space indent for conditional body lines', () => {
    const doc = `STEP 1: Test
    IF button 'Save' exists:
        Click the 'Save' button
        VERIFY that 'Saved' is present`;
    const issues = validateDocument(doc);
    expect(issues).toEqual([]);
  });

  it('warns about 4-space indent inside conditional body', () => {
    const doc = `STEP 1: Test
    IF button 'Save' exists:
    Click the 'Save' button`;
    const issues = validateDocument(doc);
    expect(issues.some((i) => i.code === 'indentation-conditional-body')).toBe(true);
  });

  it('resets conditional state on new STEP header', () => {
    const doc = `STEP 1: First
    IF button 'Save' exists:
        Click the 'Save' button

STEP 2: Second
    ELIF text 'Error' is present:
        Click the 'Retry' button`;
    const issues = validateDocument(doc);
    expect(issues.some((i) => i.code === 'elif-without-if')).toBe(true);
  });
});

describe('isRecognizedLine', () => {
  it('recognizes NAVIGATE', () => {
    expect(isRecognizedLine("NAVIGATE to 'https://example.com'")).toBe(true);
  });

  it('does not recognize gibberish', () => {
    expect(isRecognizedLine('FOOBAR baz')).toBe(false);
  });

  it('recognizes metadata lines', () => {
    expect(isRecognizedLine('@context: some context')).toBe(true);
    expect(isRecognizedLine('@import: Login from auth.hunt')).toBe(true);
    expect(isRecognizedLine('@export: Login')).toBe(true);
  });

  it('recognizes hook markers', () => {
    expect(isRecognizedLine('[SETUP]')).toBe(true);
    expect(isRecognizedLine('[END SETUP]')).toBe(true);
  });

  it('recognizes conditional block headers', () => {
    expect(isRecognizedLine("IF button 'Save' exists:")).toBe(true);
    expect(isRecognizedLine("ELIF text 'Error' is present:")).toBe(true);
    expect(isRecognizedLine('ELSE:')).toBe(true);
  });
});
