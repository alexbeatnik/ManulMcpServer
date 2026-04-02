import * as vscode from 'vscode';

import type { ManulExtensionSettings } from '../config/settings';
import type { ManulMcpServer } from '../mcp/server';
import type { ManulOutputChannel } from '../services/output';
import type { ManulStatusBar } from '../services/statusBar';

export function createRunStepCommand(
  server: ManulMcpServer,
  output: ManulOutputChannel,
  statusBar: ManulStatusBar,
  settingsProvider: () => Promise<ManulExtensionSettings>,
): () => Promise<void> {
  return async () => {
    const userInput = await vscode.window.showInputBox({
      prompt: 'Enter a Manul step or natural-language instruction',
      placeHolder: "clik login or Click the 'Login' button",
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim().length > 0 ? undefined : 'A step is required.'),
    });

    if (!userInput) {
      return;
    }

    const settings = await settingsProvider();
    statusBar.setRunning('Running step');
    output.reveal(true);

    try {
      const result = await server.runStep(userInput);
      const normalization = result.normalization[0];
      if (settings.logNormalizedDsl && normalization && normalization.input !== normalization.normalized) {
        output.info(`Normalized step: ${normalization.normalized}`);
      }

      if (!result.response.ok) {
        throw new Error(result.response.error);
      }

      output.debug('Run step response', result.response.data);
      statusBar.setReady();
      vscode.window.showInformationMessage('Manul step executed successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to run Manul step.';
      output.error(message);
      statusBar.setError(message);
      void vscode.window.showErrorMessage(message);
    }
  };
}