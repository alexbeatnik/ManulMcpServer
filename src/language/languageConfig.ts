import * as vscode from 'vscode';

export function registerLanguageConfiguration(): vscode.Disposable {
  return vscode.languages.setLanguageConfiguration('hunt', {
    comments: {
      lineComment: '#',
    },
    brackets: [
      ['[', ']'],
      ['{', '}'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: "'", close: "'" },
      { open: '"', close: '"' },
      { open: '[', close: ']' },
      { open: '{', close: '}' },
      { open: '(', close: ')' },
    ],
    wordPattern: /(-?\d*\.\d\w*)|([^\s\[\]\{\}\(\),:]+)/gu,
    indentationRules: {
      increaseIndentPattern: /^\s*(STEP(?:\s+\d+)?\s*:[^\r\n]*|\[(?:SETUP|TEARDOWN)\])\s*$/u,
      decreaseIndentPattern: /^\s*\[END\s+(?:SETUP|TEARDOWN)\]\s*$/u,
    },
  });
}