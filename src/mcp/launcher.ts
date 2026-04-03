import * as path from 'node:path';

export interface McpBridgeLaunchSpec {
  readonly command: string;
  readonly args: readonly string[];
}

export function createMcpBridgeLaunchSpec(extensionPath: string): McpBridgeLaunchSpec {
  return {
    command: 'node',
    args: [path.join(extensionPath, 'out', 'mcp', 'stdioServer.js')],
  };
}