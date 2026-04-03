import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const USER_MCP_SERVER_KEY = 'ManulMcpServer';

type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;

interface JsonObject {
  [key: string]: JsonValue;
}

export interface ManagedMcpServerOptions {
  readonly command: string;
  readonly args: readonly string[];
  readonly apiBaseUrl: string;
  readonly requestTimeoutMs: number;
  readonly sessionId: string;
  readonly logNormalizedDsl: boolean;
  readonly pythonPath: string;
  readonly headless: boolean;
  readonly label: string;
  readonly extensionPath: string;
}

export type McpConfigUpsertResult = 'created' | 'updated' | 'unchanged';
export type McpConfigRemoveResult = 'deleted-file' | 'removed' | 'unchanged';

type ProductInstallMarker = '.vscode' | '.vscode-insiders' | '.vscode-oss' | '.vscodium' | '.cursor';

const PRODUCT_MARKERS: readonly ProductInstallMarker[] = ['.vscode', '.vscode-insiders', '.vscode-oss', '.vscodium', '.cursor'];

export async function upsertMcpServerAtPath(
  filePath: string,
  options: ManagedMcpServerOptions,
): Promise<McpConfigUpsertResult> {
  const existingContent = await readFileIfExists(filePath);
  const root = existingContent ? parseConfigFile(filePath, existingContent) : createDefaultRoot();
  const nextRoot = buildNextRoot(root, options);
  const nextContent = stringifyConfig(nextRoot);

  if (existingContent === nextContent) {
    return 'unchanged';
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, nextContent, 'utf8');
  return existingContent ? 'updated' : 'created';
}

export async function removeMcpServerAtPath(filePath: string): Promise<McpConfigRemoveResult> {
  const existingContent = await readFileIfExists(filePath);
  if (!existingContent) {
    return 'unchanged';
  }

  const root = parseConfigFile(filePath, existingContent);
  const existingServers = asObject(root['servers']);
  if (!existingServers || !(USER_MCP_SERVER_KEY in existingServers)) {
    return 'unchanged';
  }

  const nextServers: JsonObject = { ...existingServers };
  delete nextServers[USER_MCP_SERVER_KEY];

  const nextRoot: JsonObject = { ...root, servers: nextServers };
  if (shouldDeleteConfigFile(nextRoot)) {
    await fs.unlink(filePath);
    return 'deleted-file';
  }

  await fs.writeFile(filePath, stringifyConfig(nextRoot), 'utf8');
  return 'removed';
}

export function resolveUserMcpConfigPathFromExtensionRoot(extensionRoot: string): string | null {
  const marker = detectProductInstallMarker(extensionRoot);
  if (!marker) {
    return null;
  }

  const baseDir = getUserDataBaseDir();
  const appFolder = getUserDataFolderName(marker);
  if (!baseDir || !appFolder) {
    return null;
  }

  return path.join(baseDir, appFolder, 'User', 'mcp.json');
}

function buildNextRoot(root: JsonObject, options: ManagedMcpServerOptions): JsonObject {
  const existingServers = asObject(root['servers']) ?? {};
  const existingServer = asObject(existingServers[USER_MCP_SERVER_KEY]) ?? {};
  const existingEnv = asObject(existingServer['env']) ?? {};
  const managedServer = createManagedServerDefinition(options, existingServer, existingEnv);

  return {
    ...root,
    inputs: Array.isArray(root['inputs']) ? root['inputs'] : [],
    servers: {
      ...existingServers,
      [USER_MCP_SERVER_KEY]: managedServer,
    },
  };
}

function createManagedServerDefinition(
  options: ManagedMcpServerOptions,
  existingServer: JsonObject,
  existingEnv: JsonObject,
): JsonObject {
  const { cwd: _cwd, command: _command, args: _args, env: _env, type: _type, ...restServer } = existingServer;

  return {
    ...restServer,
    type: 'stdio',
    command: options.command,
    args: [...options.args],
    env: {
      ...existingEnv,
      MANUL_API_BASE_URL: options.apiBaseUrl,
      MANUL_HEADLESS: String(options.headless),
      MANUL_SESSION_ID: options.sessionId,
      MANUL_REQUEST_TIMEOUT_MS: String(options.requestTimeoutMs),
      MANUL_LOG_NORMALIZED_DSL: String(options.logNormalizedDsl),
      MANUL_PYTHON_PATH: options.pythonPath,
      MANUL_EXTENSION_PATH: options.extensionPath,
      MANUL_MCP_LABEL: options.label,
    },
  };
}

function createDefaultRoot(): JsonObject {
  return {
    inputs: [],
    servers: {},
  };
}

function parseConfigFile(filePath: string, content: string): JsonObject {
  const parsed = JSON.parse(content) as unknown;
  const root = asObject(parsed);
  if (!root) {
    throw new Error(`Expected ${filePath} to contain a JSON object.`);
  }

  return root;
}

function stringifyConfig(root: JsonObject): string {
  return `${JSON.stringify(root, null, '\t')}\n`;
}

function asObject(value: JsonValue | unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as JsonObject;
}

async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
}

function shouldDeleteConfigFile(root: JsonObject): boolean {
  const keys = Object.keys(root);
  const unsupportedKeys = keys.filter((key) => key !== 'inputs' && key !== 'servers');
  if (unsupportedKeys.length > 0) {
    return false;
  }

  const inputs = root['inputs'];
  if (Array.isArray(inputs) && inputs.length > 0) {
    return false;
  }
  if (inputs !== undefined && !Array.isArray(inputs)) {
    return false;
  }

  const servers = asObject(root['servers']);
  return !servers || Object.keys(servers).length === 0;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  if (!error || typeof error !== 'object') {
    return false;
  }

  return 'code' in error && error.code === 'ENOENT';
}

function detectProductInstallMarker(extensionRoot: string): ProductInstallMarker | null {
  const normalizedRoot = path.resolve(extensionRoot);
  const segments = normalizedRoot.split(path.sep).filter((segment) => segment.length > 0);

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

function getUserDataBaseDir(): string | null {
  switch (process.platform) {
    case 'win32':
      return process.env['APPDATA']?.trim() || path.join(os.homedir(), 'AppData', 'Roaming');
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support');
    default:
      return process.env['XDG_CONFIG_HOME']?.trim() || path.join(os.homedir(), '.config');
  }
}

function getUserDataFolderName(marker: ProductInstallMarker): string | null {
  switch (marker) {
    case '.vscode':
      return 'Code';
    case '.vscode-insiders':
      return 'Code - Insiders';
    case '.vscode-oss':
      return 'Code - OSS';
    case '.vscodium':
      return 'VSCodium';
    case '.cursor':
      return 'Cursor';
    default:
      return null;
  }
}