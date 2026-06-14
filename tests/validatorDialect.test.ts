import { describe, expect, it } from 'vitest';

import { isRecognizedLine, validateDocument } from '../src/dsl/validator';

describe('ManulHeart (Go) dialect — recognized lines', () => {
  const recognized = [
    'CALL GO scripts.IssueToken into {token}',
    'CALL GO auth.Login',
    'CALL Login',
    'PRINT "hello world"',
    'PRINT {token}',
    'SCREENSHOT',
    "WAIT_FOR 'Results table'",
    'END IF',
    'END REPEAT',
    'END FOR',
    'END WHILE',
  ];

  for (const line of recognized) {
    it(`recognizes: ${line}`, () => {
      expect(isRecognizedLine(line)).toBe(true);
    });
  }

  it('still recognizes ManulEngine CALL PYTHON', () => {
    expect(isRecognizedLine('CALL PYTHON scripts.helpers.issue_token into {token}')).toBe(true);
  });

  it('does not confuse CALL PYTHON/CALL GO with a bare CALL block', () => {
    // These route to call_python / call_go, not call_block — all still valid.
    expect(isRecognizedLine('CALL PYTHON mod.fn')).toBe(true);
    expect(isRecognizedLine('CALL GO mod.Fn')).toBe(true);
  });
});

describe('validateDocument — ManulHeart explicit terminators', () => {
  it('accepts a hunt with explicit END IF / END REPEAT terminators', () => {
    const dsl = [
      '@title: Go dialect',
      '',
      'STEP 1: Flow',
      '    REPEAT 2 TIMES:',
      "        CLICK the 'Next' button",
      '    END REPEAT',
      "    IF button 'Save' exists:",
      "        CLICK the 'Save' button",
      '    ELSE:',
      '        PRINT "nothing to save"',
      '    END IF',
      '    SCREENSHOT',
      'DONE.',
    ].join('\n');

    const errors = validateDocument(dsl).filter((issue) => issue.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('accepts CALL GO inside a hook block', () => {
    const dsl = [
      '[SETUP]',
      '    PRINT "setting up"',
      '    CALL GO fixtures.Seed',
      '[END SETUP]',
      '',
      'STEP 1: Flow',
      '    NAVIGATE to https://example.com',
      'DONE.',
    ].join('\n');

    const errors = validateDocument(dsl).filter((issue) => issue.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('still flags genuinely unknown commands', () => {
    const dsl = ['STEP 1: Flow', '    FLY to the moon', 'DONE.'].join('\n');
    const errors = validateDocument(dsl).filter((issue) => issue.severity === 'error');
    expect(errors.length).toBeGreaterThan(0);
  });
});
