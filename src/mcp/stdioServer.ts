import { promises as fs } from 'node:fs';

import { getRuntimeSettingsFromEnv, getMcpServerLabelFromEnv } from '../config/runtimeSettings';
import { extractRunnableSteps, normalizeGoal, normalizeNaturalLanguageStep } from '../dsl/builder';
import { validateDocument, validateStep } from '../dsl/validator';
import { ManulMcpServer } from './server';
import { ManulApiClient } from '../services/apiClient';

type JsonRpcId = number | string | null;

interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id?: JsonRpcId;
  readonly method: string;
  readonly params?: unknown;
}

interface JsonRpcNotification {
  readonly jsonrpc: '2.0';
  readonly method: string;
  readonly params?: unknown;
}

interface JsonRpcResponse {
  readonly jsonrpc: '2.0';
  readonly id: JsonRpcId;
  readonly result?: unknown;
  readonly error?: {
    readonly code: number;
    readonly message: string;
    readonly data?: unknown;
  };
}

interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly handler: (argumentsValue: Record<string, unknown>) => Promise<McpToolResult>;
}

interface McpToolResult {
  readonly content: Array<{ type: 'text'; text: string }>;
  readonly structuredContent?: Record<string, unknown>;
  readonly isError?: boolean;
}

const PROTOCOL_VERSION = '2025-03-26';
const SERVER_VERSION = '0.0.1';
const label = getMcpServerLabelFromEnv();

const logger = {
  info(message: string): void {
    process.stderr.write(`[INFO] ${message}\n`);
  },
  warn(message: string): void {
    process.stderr.write(`[WARN] ${message}\n`);
  },
  error(message: string): void {
    process.stderr.write(`[ERROR] ${message}\n`);
  },
  step(message: string): void {
    process.stderr.write(`[STEP] ${message}\n`);
  },
  debug(scope: string, value: unknown): void {
    const body = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    process.stderr.write(`[DEBUG] ${scope}\n${body}\n`);
  },
};

const runtimeSettings = getRuntimeSettingsFromEnv();
const apiClient = new ManulApiClient(async () => runtimeSettings);
const manulServer = new ManulMcpServer(apiClient, logger);
const tools = new Map<string, ToolDefinition>(createTools().map((tool) => [tool.name, tool]));

let buffer = Buffer.alloc(0);

process.stdin.on('data', (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  consumeBuffer().catch((error) => {
    logger.error(error instanceof Error ? error.message : 'Unexpected MCP bridge failure.');
  });
});

process.stdin.on('end', () => {
  process.exit(0);
});

logger.info(`Starting ${label} MCP bridge against ${runtimeSettings.apiBaseUrl}`);

async function consumeBuffer(): Promise<void> {
  for (;;) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      return;
    }

    const headersText = buffer.subarray(0, headerEnd).toString('utf8');
    const contentLength = getContentLength(headersText);
    const totalLength = headerEnd + 4 + contentLength;
    if (buffer.length < totalLength) {
      return;
    }

    const body = buffer.subarray(headerEnd + 4, totalLength).toString('utf8');
    buffer = buffer.subarray(totalLength);

    const message = JSON.parse(body) as JsonRpcRequest | JsonRpcNotification;
    await handleMessage(message);
  }
}

async function handleMessage(message: JsonRpcRequest | JsonRpcNotification): Promise<void> {
  if ('id' in message && message.id !== undefined) {
    await handleRequest(message as JsonRpcRequest);
    return;
  }

  await handleNotification(message);
}

async function handleRequest(request: JsonRpcRequest): Promise<void> {
  try {
    switch (request.method) {
      case 'initialize':
        sendResponse({
          jsonrpc: '2.0',
          id: request.id ?? null,
          result: {
            protocolVersion: readProtocolVersion(request.params),
            capabilities: {
              tools: {
                listChanged: false,
              },
            },
            serverInfo: {
              name: 'manul-mcp-server',
              version: SERVER_VERSION,
              title: label,
            },
          },
        });
        return;
      case 'ping':
        sendResponse({ jsonrpc: '2.0', id: request.id ?? null, result: {} });
        return;
      case 'tools/list':
        sendResponse({
          jsonrpc: '2.0',
          id: request.id ?? null,
          result: {
            tools: [...tools.values()].map(({ name, description, inputSchema }) => ({
              name,
              description,
              inputSchema,
            })),
          },
        });
        return;
      case 'tools/call':
        await handleToolsCall(request);
        return;
      default:
        sendError(request.id ?? null, -32601, `Unsupported MCP method: ${request.method}`);
    }
  } catch (error) {
    sendError(
      request.id ?? null,
      -32000,
      error instanceof Error ? error.message : 'Unexpected MCP request failure.',
    );
  }
}

async function handleNotification(notification: JsonRpcNotification): Promise<void> {
  if (notification.method === 'notifications/initialized') {
    logger.info('MCP client initialized.');
    return;
  }

  logger.debug('Ignored notification', notification);
}

async function handleToolsCall(request: JsonRpcRequest): Promise<void> {
  const params = asObject(request.params);
  const name = asString(params.name);
  const tool = tools.get(name);
  if (!tool) {
    sendResponse({
      jsonrpc: '2.0',
      id: request.id ?? null,
      result: createErrorResult(`Unknown ManulMcpServer MCP tool: ${name}`),
    });
    return;
  }

  const argumentsValue = asObject(params.arguments);
  try {
    const result = await tool.handler(argumentsValue);
    sendResponse({ jsonrpc: '2.0', id: request.id ?? null, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tool execution failed.';
    sendResponse({
      jsonrpc: '2.0',
      id: request.id ?? null,
      result: createErrorResult(message),
    });
  }
}

function createTools(): ToolDefinition[] {
  return [
    {
      name: 'manul_run_step',
      description: 'Run a single Manul step. Accepts raw DSL or natural-language input and forwards the normalized step to the ManulMcpServer backend.',
      inputSchema: {
        type: 'object',
        properties: {
          step: { type: 'string', description: 'A single Manul DSL step or a natural-language action.' },
        },
        required: ['step'],
        additionalProperties: false,
      },
      handler: async (argumentsValue) => {
        const step = requireString(argumentsValue, 'step');
        const result = await manulServer.runStep(step);
        return createExecutionResult('Executed one ManulMcpServer step.', {
          normalization: result.normalization,
          issues: result.issues,
          response: result.response,
        });
      },
    },
    {
      name: 'manul_run_goal',
      description: 'Convert a natural-language goal into Manul steps, validate them, and execute them through the ManulMcpServer backend.',
      inputSchema: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'A short natural-language goal that should be converted into Manul steps.' },
        },
        required: ['goal'],
        additionalProperties: false,
      },
      handler: async (argumentsValue) => {
        const goal = requireString(argumentsValue, 'goal');
        const result = await manulServer.runGoal(goal);
        return createExecutionResult('Executed a normalized ManulMcpServer goal.', {
          normalization: result.normalization,
          issues: result.issues,
          response: result.response,
        });
      },
    },
    {
      name: 'manul_run_hunt',
      description: 'Validate and run a full .hunt document body through the ManulMcpServer backend.',
      inputSchema: {
        type: 'object',
        properties: {
          dsl: { type: 'string', description: 'Full .hunt file content.' },
        },
        required: ['dsl'],
        additionalProperties: false,
      },
      handler: async (argumentsValue) => {
        const dsl = requireString(argumentsValue, 'dsl');
        const steps = extractRunnableSteps(dsl);
        const result = await manulServer.runSteps(steps, dsl);
        return createExecutionResult(`Executed ${steps.length} ManulMcpServer step(s) from DSL.`, {
          stepCount: steps.length,
          normalization: result.normalization,
          issues: result.issues,
          response: result.response,
        });
      },
    },
    {
      name: 'manul_run_hunt_file',
      description: 'Read a .hunt file from disk, validate it, and run it through the ManulMcpServer backend.',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Absolute path to a .hunt file.' },
        },
        required: ['filePath'],
        additionalProperties: false,
      },
      handler: async (argumentsValue) => {
        const filePath = requireString(argumentsValue, 'filePath');
        const dsl = await fs.readFile(filePath, 'utf8');
        const steps = extractRunnableSteps(dsl);
        const result = await manulServer.runSteps(steps, dsl);
        return createExecutionResult(`Executed ${steps.length} ManulMcpServer step(s) from ${filePath}.`, {
          filePath,
          stepCount: steps.length,
          normalization: result.normalization,
          issues: result.issues,
          response: result.response,
        });
      },
    },
    {
      name: 'manul_validate_hunt',
      description: 'Validate a full .hunt document and return all diagnostics without running it through ManulMcpServer.',
      inputSchema: {
        type: 'object',
        properties: {
          dsl: { type: 'string', description: 'Full .hunt file content to validate.' },
        },
        required: ['dsl'],
        additionalProperties: false,
      },
      handler: async (argumentsValue) => {
        const dsl = requireString(argumentsValue, 'dsl');
        const issues = validateDocument(dsl);
        return createSuccessResult(`Validated Hunt document with ${issues.length} issue(s).`, {
          issues,
          ok: issues.every((issue) => issue.severity !== 'error'),
        });
      },
    },
    {
      name: 'manul_normalize_step',
      description: 'Normalize one Manul step or natural-language action into canonical DSL and return validation feedback without running it.',
      inputSchema: {
        type: 'object',
        properties: {
          step: { type: 'string', description: 'A single step to normalize.' },
        },
        required: ['step'],
        additionalProperties: false,
      },
      handler: async (argumentsValue) => {
        const step = requireString(argumentsValue, 'step');
        const normalization = normalizeNaturalLanguageStep(step);
        const issues = normalization.normalized ? validateStep(normalization.normalized) : [];
        return createSuccessResult('Normalized one Manul step.', {
          normalization,
          issues,
        });
      },
    },
    {
      name: 'manul_get_state',
      description: 'Return the current backend state from the ManulMcpServer API.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      handler: async () => {
        const response = await manulServer.getState();
        return createExecutionResult('Fetched ManulMcpServer backend state.', {
          response,
        });
      },
    },
    {
      name: 'manul_preview_goal',
      description: 'Preview how a natural-language goal would be split and normalized into Manul DSL without running it.',
      inputSchema: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'A natural-language goal to preview.' },
        },
        required: ['goal'],
        additionalProperties: false,
      },
      handler: async (argumentsValue) => {
        const goal = requireString(argumentsValue, 'goal');
        const preview = normalizeGoal(goal);
        return createSuccessResult('Previewed Manul goal normalization.', preview as unknown as Record<string, unknown>);
      },
    },
  ];
}

function createSuccessResult(summary: string, data: Record<string, unknown>): McpToolResult {
  return {
    content: [
      {
        type: 'text',
        text: `${summary}\n\n${JSON.stringify(data, null, 2)}`,
      },
    ],
    structuredContent: data,
  };
}

function createExecutionResult(summary: string, data: Record<string, unknown>): McpToolResult {
  const response = data.response;
  if (isApiFailure(response)) {
    return createErrorResult(`${summary}\n\n${response.error}`);
  }

  return createSuccessResult(summary, data);
}

function createErrorResult(message: string): McpToolResult {
  return {
    content: [
      {
        type: 'text',
        text: message,
      },
    ],
    structuredContent: { error: message },
    isError: true,
  };
}

function isApiFailure(value: unknown): value is { ok: false; error: string } {
  return typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === false && typeof (value as { error?: unknown }).error === 'string';
}

function getContentLength(headersText: string): number {
  const headerLines = headersText.split('\r\n');
  for (const line of headerLines) {
    const match = /^Content-Length:\s*(\d+)$/iu.exec(line.trim());
    if (match) {
      return Number(match[1]);
    }
  }

  throw new Error('Missing Content-Length header in MCP stdio message.');
}

function readProtocolVersion(params: unknown): string {
  const value = asObject(params).protocolVersion;
  return typeof value === 'string' && value.trim().length > 0 ? value : PROTOCOL_VERSION;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function requireString(argumentsValue: Record<string, unknown>, key: string): string {
  const value = argumentsValue[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Expected non-empty string argument: ${key}`);
  }

  return value;
}

function sendResponse(response: JsonRpcResponse): void {
  const payload = JSON.stringify(response);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`);
}

function sendError(id: JsonRpcId, code: number, message: string, data?: unknown): void {
  sendResponse({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      data,
    },
  });
}