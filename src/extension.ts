import * as vscode from 'vscode';

import { createRunFileCommand } from './commands/runFile';
import { createRunStepCommand } from './commands/runStep';
import { getExtensionSettings, type ManulExtensionSettings } from './config/settings';
import { normalizeRuntime, normalizePort, normalizeTimeout } from './config/defaults';
import { resolveRuntime } from './config/runtime';
import { GoRunner } from './services/goRunner';
import type { IManulBackend } from './types/api';
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
  const { backend, goRunner } = createEditorBackend(settingsProvider, output);
  const mcpServer = new ManulMcpServer(backend, output);

  if (goRunner) {
    context.subscriptions.push({ dispose: () => void goRunner.shutdown() });
  }

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

/**
 * Pick the backend the editor Run commands drive: the ManulHeart (Go) runner
 * when the Go runtime is resolved, otherwise the ManulEngine HTTP client
 * (`manul serve`). The choice is fixed at activation; changing manul.runtime
 * takes effect after a window reload.
 */
function createEditorBackend(
  settingsProvider: () => Promise<ManulExtensionSettings>,
  output: ManulOutputChannel,
): { backend: IManulBackend; goRunner?: GoRunner } {
  const configuration = vscode.workspace.getConfiguration('manul');
  const binaryPath = configuration.get<string>('binaryPath', '').trim();
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
  const runtime = resolveRuntime({
    runtime: normalizeRuntime(configuration.get<string>('runtime', 'auto')),
    binaryPath,
    workspacePath,
  });

  if (runtime === 'go') {
    output.info('Editor Run commands use the ManulHeart (Go) runtime.');
    const goRunner = new GoRunner(
      {
        binaryPath,
        executablePath: configuration.get<string>('executablePath', '').trim(),
        headless: configuration.get<boolean>('headless', false),
        cdpPort: normalizePort(configuration.get<number>('cdpPort', 0)),
        timeoutMs: normalizeTimeout(configuration.get<number>('requestTimeoutMs', 60000)),
        workspacePath,
      },
      output,
    );
    return { backend: goRunner, goRunner };
  }

  output.info('Editor Run commands use the ManulEngine (Python) HTTP API.');
  return { backend: new ManulApiClient(settingsProvider) };
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