import * as path from 'node:path';

import { removeMcpServerAtPath, resolveUserMcpConfigPathFromExtensionRoot } from '../mcp/userConfig';

async function main(): Promise<void> {
  const extensionRoot = path.resolve(__dirname, '..', '..');
  const filePath = resolveUserMcpConfigPathFromExtensionRoot(extensionRoot);
  if (!filePath) {
    console.warn('ManulMcpServer uninstall: could not resolve the user mcp.json path for this VS Code build.');
    return;
  }

  const result = await removeMcpServerAtPath(filePath);
  if (result !== 'unchanged') {
    console.log(`ManulMcpServer uninstall: user mcp.json ${result} at ${filePath}`);
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`ManulMcpServer uninstall failed: ${message}`);
  process.exitCode = 1;
});