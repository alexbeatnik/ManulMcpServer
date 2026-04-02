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

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = new ManulOutputChannel();
  const statusBar = new ManulStatusBar();
  const settingsProvider = () => getExtensionSettings(context);
  const apiClient = new ManulApiClient(settingsProvider);
  const mcpServer = new ManulMcpServer(apiClient, output);

  context.subscriptions.push(
    output,
    statusBar,
    registerLanguageConfiguration(),
    registerCompletionProvider(),
    registerHoverProvider(),
    registerDiagnostics(output),
    registerMcpServerProvider(context),
    vscode.commands.registerCommand('manul.runStep', createRunStepCommand(mcpServer, output, statusBar, settingsProvider)),
    vscode.commands.registerCommand('manul.runFile', createRunFileCommand(mcpServer, output, statusBar)),
    vscode.window.onDidChangeActiveTextEditor((editor) => statusBar.sync(editor)),
  );

  statusBar.sync(vscode.window.activeTextEditor);
  output.info('ManulMcpServer extension activated.');
  output.info('ManulMcpServer MCP provider registered.');

  const state = await mcpServer.getState();
  if (state.ok) {
    output.debug('Backend state', state.data);
  } else {
    output.warn(`Backend state check failed: ${state.error}`);
  }
}

export function deactivate(): void {
  // VS Code disposes registered resources from the extension context.
}