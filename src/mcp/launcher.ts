export interface McpBridgeLaunchSpec {
  readonly command: string;
  readonly args: readonly string[];
}

type ProductInstallMarker = '.vscode' | '.vscode-insiders' | '.vscode-oss' | '.vscodium' | '.cursor';

const PRODUCT_MARKERS: readonly ProductInstallMarker[] = ['.vscode', '.vscode-insiders', '.vscode-oss', '.vscodium', '.cursor'];
const EXTENSION_PREFIX = 'manul-engine.manul-mcp-server-';

export function createDirectMcpBridgeLaunchSpec(extensionPath: string): McpBridgeLaunchSpec {
  return {
    command: 'node',
    args: [joinPath(extensionPath, 'out', 'mcp', 'stdioServer.js')],
  };
}

export function createManagedMcpConfigLaunchSpec(extensionPath: string): McpBridgeLaunchSpec {
  const installMarker = detectProductInstallMarker(extensionPath) ?? '.vscode';
  const script = [
    "const fs=require('fs'),path=require('path'),os=require('os');",
    `const base=path.join(os.homedir(),${quote(installMarker)},'extensions');`,
    `const dirs=fs.readdirSync(base).filter(d=>d.startsWith(${quote(EXTENSION_PREFIX)})).sort();`,
    "const ext=dirs[dirs.length-1];",
    "if(!ext){console.error('ManulMcpServer extension not found');process.exit(1)}",
    "const extDir=path.join(base,ext);",
    "process.env.MANUL_EXTENSION_PATH=extDir;",
    "require(path.join(extDir,'out','mcp','stdioServer.js'));",
  ].join('');

  return {
    command: 'node',
    args: ['-e', script],
  };
}

function detectProductInstallMarker(extensionPath: string): ProductInstallMarker | null {
  const segments = extensionPath.split(/[\\/]+/u).filter((segment) => segment.length > 0);

  for (const segment of segments) {
    if (isProductInstallMarker(segment)) {
      return segment;
    }
  }

  return null;
}

function isProductInstallMarker(value: string): value is ProductInstallMarker {
  return PRODUCT_MARKERS.includes(value as ProductInstallMarker);
}

function joinPath(...segments: readonly string[]): string {
  return segments.join('/').replace(/\/+/gu, '/').replace(/\/+/gu, '/');
}

function quote(value: string): string {
  return JSON.stringify(value);
}