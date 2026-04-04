import { describe, it, expect } from 'vitest';
import { iterateDslLines } from '../src/dsl/parser';

describe('iterateDslLines', () => {
  it('classifies blank lines', () => {
    const lines = [...iterateDslLines('\n\n')];
    expect(lines.every((l) => l.kind === 'blank')).toBe(true);
  });

  it('classifies comments', () => {
    const lines = [...iterateDslLines('# this is a comment')];
    expect(lines[0].kind).toBe('comment');
  });

  it('classifies metadata', () => {
    const lines = [...iterateDslLines('@context: some context')];
    expect(lines[0].kind).toBe('metadata');
  });

  it('classifies step headers', () => {
    const lines = [...iterateDslLines('STEP 1: Navigate')];
    expect(lines[0].kind).toBe('step_header');
  });

  it('classifies DONE', () => {
    const lines = [...iterateDslLines('DONE.')];
    expect(lines[0].kind).toBe('done');
  });

  it('classifies hook blocks', () => {
    const lines = [...iterateDslLines('[SETUP]\n    PRINT "hi"\n[END SETUP]')];
    expect(lines[0].kind).toBe('hook_open');
    expect(lines[1].kind).toBe('action');
    expect(lines[1].insideHookBlock).toBe(true);
    expect(lines[2].kind).toBe('hook_close');
  });

  it('classifies action lines', () => {
    const lines = [...iterateDslLines("    NAVIGATE to 'https://example.com'")];
    expect(lines[0].kind).toBe('action');
  });

  it('tracks insideHookBlock state', () => {
    const dsl = `[SETUP]
    PRINT "test"
[END SETUP]
STEP 1: Test
    NAVIGATE to 'https://example.com'`;
    const lines = [...iterateDslLines(dsl)];
    const hookBody = lines.find((l) => l.trimmed === 'PRINT "test"');
    const action = lines.find((l) => l.trimmed.startsWith('NAVIGATE'));
    expect(hookBody?.insideHookBlock).toBe(true);
    expect(action?.insideHookBlock).toBe(false);
  });

  it('provides correct line numbers', () => {
    const lines = [...iterateDslLines('line1\nline2\nline3')];
    expect(lines.map((l) => l.lineNumber)).toEqual([1, 2, 3]);
  });
});
