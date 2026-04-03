import * as path from 'node:path';

import { createManagedMcpConfigLaunchSpec } from '../mcp/launcher';
import { resolveUserMcpConfigPathFromExtensionRoot, upsertMcpServerAtPath } from '../mcp/userConfig';

async function main(): Promise<void> {
  const extensionRoot = path.resolve(__dirname, '..', '..');
  const filePath = resolveUserMcpConfigPathFromExtensionRoot(extensionRoot);
  if (!filePath) {
    console.warn('ManulMcpServer install: could not resolve the user mcp.json path for this VS Code build.');
    return;
  }

  const launchSpec = createManagedMcpConfigLaunchSpec(extensionRoot);
  const result = await upsertMcpServerAtPath(filePath, {
    command: launchSpec.command,
    args: launchSpec.args,
    apiBaseUrl: 'http://127.0.0.1:8000',
    requestTimeoutMs: 60000,
    sessionId: '',
    logNormalizedDsl: true,
    pythonPath: 'python3',
    headless: false,
    workspacePath: '',
    label: 'ManulMcpServer',
    extensionPath: extensionRoot,
  });

  if (result !== 'unchanged') {
    console.log(`ManulMcpServer install: user mcp.json ${result} at ${filePath}`);
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`ManulMcpServer install failed: ${message}`);
  process.exitCode = 1;
});