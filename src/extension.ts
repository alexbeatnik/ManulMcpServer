import * as vscode from 'vscode';

import { createRunFileCommand } from './commands/runFile';
import { createRunStepCommand } from './commands/runStep';
import { getExtensionSettings } from './config/settings';
import { registerCompletionProvider } from './language/completion';
import { registerDiagnostics } from './language/diagnostics';
import { registerHoverProvider } from './language/hover';
import { registerLanguageConfiguration } from './language/languageConfig';
import { registerMcpServerProvider } from './mcp/provider';
import { ManulMcpServer } from './mcp/server';
import { ManulApiClient } from './services/apiClient';
import { ManulOutputChannel } from './services/output';
import { ManulStatusBar } from './services/statusBar';
import { registerUserMcpConfigSync } from './services/userMcpSync';

export function activate(context: vscode.ExtensionContext): void {
  const output = new ManulOutputChannel();
  const statusBar = new ManulStatusBar();
  const settingsProvider = () => getExtensionSettings(context);
  const apiClient = new ManulApiClient(settingsProvider);
  const mcpServer = new ManulMcpServer(apiClient, output);

  context.subscriptions.push(
    output,
    statusBar,
    registerUserMcpConfigSync(context, output),
    registerLanguageConfiguration(),
    registerCompletionProvider(),
    registerHoverProvider(),
    registerDiagnostics(output),
    vscode.commands.registerCommand('manul.runStep', createRunStepCommand(mcpServer, output, statusBar, settingsProvider)),
    vscode.commands.registerCommand('manul.runFile', createRunFileCommand(mcpServer, output, statusBar)),
    vscode.window.onDidChangeActiveTextEditor((editor) => statusBar.sync(editor)),
  );

  try {
    context.subscriptions.push(registerMcpServerProvider(context));
    output.info('ManulMcpServer MCP provider registered.');
  } catch (error) {
    output.error(`Failed to register ManulMcpServer MCP provider: ${toErrorMessage(error)}.`);
  }

  statusBar.sync(vscode.window.activeTextEditor);
  output.info('ManulMcpServer extension activated.');

  void warmBackendState(mcpServer, output);
}

export function deactivate(): void {
  // VS Code disposes registered resources from the extension context.
}

async function warmBackendState(mcpServer: ManulMcpServer, output: ManulOutputChannel): Promise<void> {
  try {
    const state = await mcpServer.getState();
    if (state.ok) {
      output.debug('Backend state', state.data);
      return;
    }

    output.warn(`Backend state check failed: ${state.error}`);
  } catch (error) {
    output.warn(`Backend state check crashed: ${toErrorMessage(error)}`);
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Unknown error';
}