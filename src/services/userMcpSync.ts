import * as path from 'node:path';
import * as vscode from 'vscode';

import { getExtensionSettings } from '../config/settings';
import { createManagedMcpConfigLaunchSpec } from '../mcp/launcher';
import { upsertMcpServerAtPath } from '../mcp/userConfig';
import type { ManulLogger } from './logger';

const MANUL_CONFIGURATION_SECTION = 'manul';

export function registerUserMcpConfigSync(context: vscode.ExtensionContext, logger: ManulLogger): vscode.Disposable {
  const sync = async (reason: string): Promise<void> => {
    try {
      const settings = await getExtensionSettings(context);
      const configuration = vscode.workspace.getConfiguration(MANUL_CONFIGURATION_SECTION);
      const label = configuration.get<string>('mcpServerLabel', 'ManulMcpServer').trim() || 'ManulMcpServer';
      const configuredSessionId = configuration.get<string>('sessionId', '').trim();
      const filePath = getUserMcpConfigPath(context);
      const launchSpec = createManagedMcpConfigLaunchSpec(context.extensionPath);
      const result = await upsertMcpServerAtPath(filePath, {
        command: launchSpec.command,
        args: launchSpec.args,
        apiBaseUrl: settings.apiBaseUrl,
        requestTimeoutMs: settings.requestTimeoutMs,
        sessionId: configuredSessionId,
        logNormalizedDsl: settings.logNormalizedDsl,
        pythonPath: settings.pythonPath,
        headless: settings.headless,
        label,
        extensionPath: context.extensionPath,
      });

      if (result !== 'unchanged') {
        logger.info(`User mcp.json ${result} after ${reason}: ${filePath}`);
      }
    } catch (error) {
      logger.warn(`Failed to sync user mcp.json after ${reason}: ${toErrorMessage(error)}`);
    }
  };

  void sync('activation');

  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration(MANUL_CONFIGURATION_SECTION)) {
      void sync('settings change');
    }
  });
}

function getUserMcpConfigPath(context: vscode.ExtensionContext): string {
  const userDir = path.dirname(path.dirname(context.globalStorageUri.fsPath));
  return path.join(userDir, 'mcp.json');
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Unknown error';
}