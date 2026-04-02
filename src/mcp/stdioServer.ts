import { promises as fs } from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult, CreateTaskResult } from '@modelcontextprotocol/sdk/types.js';

import { getRuntimeSettingsFromEnv, getMcpServerLabelFromEnv } from '../config/runtimeSettings';
import { extractRunnableSteps, normalizeGoal, normalizeNaturalLanguageStep } from '../dsl/builder';
import { validateDocument, validateStep } from '../dsl/validator';
import { ManulMcpServer } from './server';
import { ManulApiClient } from '../services/apiClient';

interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly handler: (argumentsValue: Record<string, unknown>) => Promise<McpToolResult>;
}

type McpToolResult = CallToolResult;
type McpTaskResult = CreateTaskResult;

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

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function requireString(argumentsValue: Record<string, unknown>, key: string): string {
  const value = argumentsValue[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Expected non-empty string argument: ${key}`);
  }

  return value;
}

function createSdkServer(): Server {
  const server = new Server(
    {
      name: 'manul-mcp-server',
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
    },
  );

  server.oninitialized = () => {
    logger.info('MCP client initialized.');
  };
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...tools.values()].map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
      execution: {
        taskSupport: 'forbidden',
      },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.task) {
      return createForbiddenTaskResult(request.params.name);
    }

    const tool = tools.get(request.params.name);
    if (!tool) {
      return createErrorResult(`Unknown ManulMcpServer MCP tool: ${request.params.name}`);
    }

    try {
      return await tool.handler(asObject(request.params.arguments));
    } catch (error) {
      return createErrorResult(error instanceof Error ? error.message : 'Tool execution failed.');
    }
  });

  return server;
}

function createForbiddenTaskResult(toolName: string): McpTaskResult {
  const timestamp = new Date().toISOString();
  return {
    task: {
      taskId: `manul-task-${toolName}-${Date.now()}`,
      status: 'failed',
      ttl: null,
      createdAt: timestamp,
      lastUpdatedAt: timestamp,
      statusMessage: `Task mode is not supported for ${toolName}. Use a normal tools/call request instead.`,
    },
  };
}

let activeServer: Server | undefined;

async function main(): Promise<void> {
  logger.info(`Starting ${label} MCP bridge against ${runtimeSettings.apiBaseUrl}`);

  const server = createSdkServer();
  const transport = new StdioServerTransport();
  activeServer = server;

  await server.connect(transport);
  logger.info('ManulMcpServer MCP stdio transport connected.');
}

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down MCP bridge.`);
  await activeServer?.close();
  process.exit(0);
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('uncaughtException', (error) => {
  logger.error(error instanceof Error ? error.stack ?? error.message : 'Uncaught MCP bridge exception.');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error(reason instanceof Error ? reason.stack ?? reason.message : 'Unhandled MCP bridge rejection.');
  process.exit(1);
});

void main().catch((error) => {
  logger.error(error instanceof Error ? error.stack ?? error.message : 'Fatal MCP bridge startup error.');
  process.exit(1);
});