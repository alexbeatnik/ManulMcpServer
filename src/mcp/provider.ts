import * as path from 'node:path';
import * as vscode from 'vscode';

import { getExtensionSettings } from '../config/settings';

const MCP_PROVIDER_ID = 'manul.mcp-servers';

export function registerMcpServerProvider(context: vscode.ExtensionContext): vscode.Disposable {
  const didChangeEmitter = new vscode.EventEmitter<void>();

  const provider: vscode.McpServerDefinitionProvider = {
    onDidChangeMcpServerDefinitions: didChangeEmitter.event,
    provideMcpServerDefinitions: async () => [await createServerDefinition(context)],
    resolveMcpServerDefinition: async () => createServerDefinition(context),
  };

  return vscode.Disposable.from(
    didChangeEmitter,
    vscode.lm.registerMcpServerDefinitionProvider(MCP_PROVIDER_ID, provider),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('manul')) {
        didChangeEmitter.fire();
      }
    }),
  );
}

async function createServerDefinition(context: vscode.ExtensionContext): Promise<vscode.McpStdioServerDefinition> {
  const settings = await getExtensionSettings(context);
  const configuration = vscode.workspace.getConfiguration('manul');
  const label = configuration.get<string>('mcpServerLabel', 'ManulMcpServer').trim() || 'ManulMcpServer';
  const bridgePath = path.join(context.extensionPath, 'out', 'mcp', 'stdioServer.js');

  return new vscode.McpStdioServerDefinition(
    label,
    process.execPath,
    [bridgePath],
    {
      MANUL_API_BASE_URL: settings.apiBaseUrl,
      MANUL_SESSION_ID: settings.sessionId,
      MANUL_REQUEST_TIMEOUT_MS: String(settings.requestTimeoutMs),
      MANUL_LOG_NORMALIZED_DSL: String(settings.logNormalizedDsl),
      MANUL_MCP_LABEL: label,
    },
    '0.0.1',
  );
}