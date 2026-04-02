import * as vscode from 'vscode';

import { extractRunnableSteps } from '../dsl/builder';
import type { ManulMcpServer } from '../mcp/server';
import type { ManulOutputChannel } from '../services/output';
import type { ManulStatusBar } from '../services/statusBar';

export function createRunFileCommand(
  server: ManulMcpServer,
  output: ManulOutputChannel,
  statusBar: ManulStatusBar,
): () => Promise<void> {
  return async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !isHuntDocument(editor.document)) {
      void vscode.window.showErrorMessage('Open a .hunt file to run Manul.');
      return;
    }

    const dsl = editor.document.getText();
    const steps = extractRunnableSteps(dsl);
    if (steps.length === 0) {
      void vscode.window.showErrorMessage('The active .hunt file does not contain any executable steps.');
      return;
    }

    statusBar.setRunning('Running file');
    output.reveal(true);
    output.info(`Running ${editor.document.fileName}`);

    try {
      const result = await server.runSteps(steps, dsl);
      if (!result.response.ok) {
        throw new Error(result.response.error);
      }

      output.debug('Run file response', result.response.data);
      statusBar.setReady();
      vscode.window.showInformationMessage(`Manul ran ${steps.length} step(s) successfully.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to run .hunt file.';
      output.error(message);
      statusBar.setError(message);
      void vscode.window.showErrorMessage(message);
    }
  };
}

function isHuntDocument(document: vscode.TextDocument): boolean {
  return document.languageId === 'hunt' || document.uri.fsPath.endsWith('.hunt');
}