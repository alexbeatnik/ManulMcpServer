import * as vscode from 'vscode';

import { validateDocument } from '../dsl/validator';
import type { ManulOutputChannel } from '../services/output';
import type { ValidationIssue } from '../types/api';

const HUNT_SELECTOR = 'hunt';

export function registerDiagnostics(output: ManulOutputChannel): vscode.Disposable {
  const collection = vscode.languages.createDiagnosticCollection('manul');

  const refresh = (document: vscode.TextDocument): void => {
    if (!isHuntDocument(document)) {
      return;
    }

    const issues = validateDocument(document.getText());
    collection.set(document.uri, issues.map((issue) => toDiagnostic(document, issue)));
  };

  for (const document of vscode.workspace.textDocuments) {
    refresh(document);
  }

  return vscode.Disposable.from(
    collection,
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((event) => refresh(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => collection.delete(document.uri)),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (!isHuntDocument(document)) {
        return;
      }

      const issues = validateDocument(document.getText());
      if (issues.some((issue) => issue.severity === 'error')) {
        output.warn(`Saved ${document.fileName} with validation errors.`);
      }
    }),
  );
}

function toDiagnostic(document: vscode.TextDocument, issue: ValidationIssue): vscode.Diagnostic {
  const line = Math.max(issue.line - 1, 0);
  const startColumn = Math.max(issue.column - 1, 0);
  const endColumn = Math.max(issue.endColumn - 1, startColumn + 1);
  const range = new vscode.Range(line, startColumn, line, clampEndColumn(document, line, endColumn));
  const diagnostic = new vscode.Diagnostic(
    range,
    issue.message,
    issue.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning,
  );
  diagnostic.code = issue.code;
  diagnostic.source = 'manul';
  return diagnostic;
}

function clampEndColumn(document: vscode.TextDocument, lineNumber: number, endColumn: number): number {
  return Math.min(document.lineAt(lineNumber).text.length, endColumn);
}

function isHuntDocument(document: vscode.TextDocument): boolean {
  return document.languageId === HUNT_SELECTOR || document.uri.fsPath.endsWith('.hunt');
}