import * as vscode from 'vscode';

import { getExtensionSettings } from '../config/settings';
import { createDirectMcpBridgeLaunchSpec } from './launcher';

const MCP_PROVIDER_ID = 'manul.mcp-servers';

export function registerMcpServerProvider(context: vscode.ExtensionContext): vscode.Disposable {
  const didChangeEmitter = new vscode.EventEmitter<void>();

  const provider: vscode.McpServerDefinitionProvider = {
    onDidChangeMcpServerDefinitions: didChangeEmitter.event,
    provideMcpServerDefinitions: async () => [await createServerDefinition(context)],
    resolveMcpServerDefinition: async () => createServerDefinition(context),
  };

  const registration = vscode.Disposable.from(
    didChangeEmitter,
    vscode.lm.registerMcpServerDefinitionProvider(MCP_PROVIDER_ID, provider),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('manul')) {
        didChangeEmitter.fire();
      }
    }),
  );

  setTimeout(() => didChangeEmitter.fire(), 0);

  return registration;
}

async function createServerDefinition(context: vscode.ExtensionContext): Promise<vscode.McpStdioServerDefinition> {
  const settings = await getExtensionSettings(context);
  const configuration = vscode.workspace.getConfiguration('manul');
  const label = configuration.get<string>('mcpServerLabel', 'ManulMcpServer').trim() || 'ManulMcpServer';
  const launchSpec = createDirectMcpBridgeLaunchSpec(context.extensionPath);

  return new vscode.McpStdioServerDefinition(
    label,
    launchSpec.command,
    [...launchSpec.args],
    {
      MANUL_API_BASE_URL: settings.apiBaseUrl,
      MANUL_SESSION_ID: settings.sessionId,
      MANUL_REQUEST_TIMEOUT_MS: String(settings.requestTimeoutMs),
      MANUL_LOG_NORMALIZED_DSL: String(settings.logNormalizedDsl),
      MANUL_PYTHON_PATH: settings.pythonPath,
      MANUL_EXECUTABLE_PATH: settings.executablePath,
      MANUL_HEADLESS: String(settings.headless),
      MANUL_WORKSPACE_PATH: settings.workspacePath,
      MANUL_EXTENSION_PATH: context.extensionPath,
      MANUL_MCP_LABEL: label,
    },
    '0.0.5',
  );
}