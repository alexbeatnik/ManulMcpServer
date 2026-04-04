import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult, CreateTaskResult } from '@modelcontextprotocol/sdk/types.js';

import { getRuntimeSettingsFromEnv, getMcpServerLabelFromEnv } from '../config/runtimeSettings';
import { extractRunnableSteps, normalizeGoal, normalizeNaturalLanguageStep } from '../dsl/builder';
import { validateDocument, validateStep } from '../dsl/validator';
import { ManulMcpServer } from './server';
import { PythonRunner } from '../services/pythonRunner';
import { resolveInsideWorkspace } from '../security/pathValidator';

interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly handler: (argumentsValue: Record<string, unknown>) => Promise<McpToolResult>;
}

type McpToolResult = CallToolResult;
type McpTaskResult = CreateTaskResult;

const SERVER_VERSION = '0.0.4';
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
const runnerScriptPath = path.join(__dirname, '..', '..', 'python', 'manul_runner.py');
const pythonRunner = new PythonRunner(
  {
    pythonPath: runtimeSettings.pythonPath,
    runnerScriptPath,
    timeoutMs: runtimeSettings.requestTimeoutMs,
    headless: runtimeSettings.headless,
    workspacePath: runtimeSettings.workspacePath,
    extensionPath: runtimeSettings.extensionPath,
  },
  logger,
);
const manulServer = new ManulMcpServer(pythonRunner, logger);
const tools = new Map<string, ToolDefinition>(createTools().map((tool) => [tool.name, tool]));

function createTools(): ToolDefinition[] {
  return [
    {
      name: 'manul_run_step',
      description: 'Run a single Manul DSL step against the live browser session. Opens the browser the first time it is called. Accepts raw DSL (e.g. "NAVIGATE to https://example.com") or natural-language input.',
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
        const data = asObject((result.response as { ok: boolean; data?: unknown }).data);
        const huntProposal = typeof data['hunt_proposal'] === 'string' ? data['hunt_proposal'] : '';
        return createExecutionResult('Executed one ManulMcpServer step.', {
          normalization: result.normalization,
          issues: result.issues,
          response: result.response,
          ...(huntProposal ? { hunt_proposal: huntProposal } : {}),
        });
      },
    },
    {
      name: 'manul_run_goal',
      description:
        'Convert a natural-language goal into Manul DSL steps, execute them in the live browser session, ' +
        'and return a ready-to-save .hunt file proposal. ' +
        'The browser opens automatically on the first call. ' +
        'After reviewing the proposal, call manul_save_hunt to persist it.',
      inputSchema: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'A natural-language automation goal (e.g. "Navigate to Amazon and search for MacBook").' },
          title: { type: 'string', description: 'Optional short title for the generated .hunt file.' },
          context: { type: 'string', description: 'Optional strategic context to embed as @context: in the .hunt file.' },
        },
        required: ['goal'],
        additionalProperties: false,
      },
      handler: async (argumentsValue) => {
        const goal = requireString(argumentsValue, 'goal');
        const title = typeof argumentsValue['title'] === 'string' ? argumentsValue['title'] : undefined;
        const context = typeof argumentsValue['context'] === 'string' ? argumentsValue['context'] : undefined;
        // Always reset so the proposal covers only steps from this goal invocation
        await pythonRunner.reset(context ?? goal, title ?? goal);
        const result = await manulServer.runGoal(goal);
        const data = asObject((result.response as { ok: boolean; data?: unknown }).data);
        const huntProposal = typeof data['hunt_proposal'] === 'string' ? data['hunt_proposal'] : '';
        return createGoalResult(goal, result.normalization, result.issues, result.response, huntProposal);
      },
    },
    {
      name: 'manul_run_hunt',
      description: 'Validate and run a full .hunt document in the live browser session.',
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
        const data = asObject((result.response as { ok: boolean; data?: unknown }).data);
        const huntProposal = typeof data['hunt_proposal'] === 'string' ? data['hunt_proposal'] : '';
        return createExecutionResult(`Executed ${steps.length} ManulMcpServer step(s) from DSL.`, {
          stepCount: steps.length,
          normalization: result.normalization,
          issues: result.issues,
          response: result.response,
          ...(huntProposal ? { hunt_proposal: huntProposal } : {}),
        });
      },
    },
    {
      name: 'manul_run_hunt_file',
      description: 'Read a .hunt file from disk, validate it, and run it in the live browser session.',
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
        const workspaceRoot = path.resolve(runtimeSettings.workspacePath || process.cwd());
        const { resolvedPath } = await resolveInsideWorkspace(filePath, workspaceRoot, {
          allowedExtensions: ['.hunt'],
          requireExists: true,
        });
        const dsl = await fs.readFile(resolvedPath, 'utf8');
        const steps = extractRunnableSteps(dsl);
        const result = await manulServer.runSteps(steps, dsl);
        const data = asObject((result.response as { ok: boolean; data?: unknown }).data);
        const huntProposal = typeof data['hunt_proposal'] === 'string' ? data['hunt_proposal'] : '';
        return createExecutionResult(`Executed ${steps.length} ManulMcpServer step(s) from ${filePath}.`, {
          filePath,
          stepCount: steps.length,
          normalization: result.normalization,
          issues: result.issues,
          response: result.response,
          ...(huntProposal ? { hunt_proposal: huntProposal } : {}),
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
      description: 'Return the current runner state: engine version, whether the browser is open, how many steps have been executed, and the accumulated hunt proposal.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      handler: async () => {
        const response = await manulServer.getState();
        return createExecutionResult('Fetched ManulMcpServer runner state.', {
          response,
        });
      },
    },
    {
      name: 'manul_save_hunt',
      description:
        'Save a .hunt file to disk. Typically called after manul_run_goal returns a hunt_proposal. ' +
        'The file is created (or overwritten) at the given path.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to write (e.g. "tests/amazon_search.hunt"). Relative paths resolve from the current working directory.' },
          content: { type: 'string', description: 'Full .hunt file content to write.' },
        },
        required: ['path', 'content'],
        additionalProperties: false,
      },
      handler: async (argumentsValue) => {
        const filePath = requireString(argumentsValue, 'path');
        const content = requireString(argumentsValue, 'content');
        const workspaceRoot = path.resolve(runtimeSettings.workspacePath || process.cwd());
        const { resolvedPath } = await resolveInsideWorkspace(filePath, workspaceRoot, {
          allowedExtensions: ['.hunt'],
        });
        const response = await pythonRunner.saveHunt(resolvedPath, content);
        return createExecutionResult(`Hunt file saved.`, { response });
      },
    },
    {
      name: 'manul_scan_page',
      description:
        'Scan the currently open browser page and return all interactive elements (inputs, buttons, selects, checkboxes, radios, links). ' +
        'Use this after NAVIGATE to discover exact element identifiers before deciding the next step.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      handler: async () => {
        const response = await pythonRunner.scanPage();
        return createExecutionResult('Scanned page elements.', { response });
      },
    },
    {
      name: 'manul_read_page_text',
      description:
        'Return all visible text content from the currently open browser page (document.body.innerText). ' +
        'Use this to read prices, labels, headings, or any static text that does not appear in manul_scan_page.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      handler: async () => {
        const response = await pythonRunner.readPageText();
        return createExecutionResult('Read page text content.', { response });
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

  const huntProposal = typeof data['hunt_proposal'] === 'string' ? data['hunt_proposal'] : '';
  if (huntProposal) {
    const text =
      `${summary}\n\n` +
      `--- Proposed .hunt file ---\n${huntProposal}\n--- end ---\n\n` +
      `To save this hunt file, call manul_save_hunt with the desired path (e.g. "tests/my_test.hunt") and the content above.`;
    return {
      content: [{ type: 'text', text }],
      structuredContent: data,
    };
  }

  return createSuccessResult(summary, data);
}

function createGoalResult(
  goal: string,
  normalization: readonly unknown[],
  issues: readonly unknown[],
  response: unknown,
  huntProposal: string,
): McpToolResult {
  if (isApiFailure(response)) {
    return createErrorResult(`Goal execution failed: "${goal}"\n\n${response.error}`);
  }

  const data = asObject((response as { data?: unknown }).data);
  const results = Array.isArray(data['results'])
    ? (data['results'] as Array<{ step: string; status: string; error?: string }>)
    : [];
  const passCount = typeof data['pass_count'] === 'number' ? data['pass_count'] : results.filter((r) => r.status === 'pass').length;
  const total = typeof data['total'] === 'number' ? data['total'] : results.length;

  const stepLines = results
    .map((r) => `  ${r.status === 'pass' ? '✓' : '✗'} ${r.step}${r.error ? ` — ${r.error}` : ''}`)
    .join('\n');

  let text = `Goal executed: "${goal}"\nSteps: ${passCount}/${total} passed.`;
  if (stepLines) {
    text += `\n${stepLines}`;
  }

  if (huntProposal) {
    text +=
      `\n\n--- Proposed .hunt file ---\n${huntProposal}\n--- end ---` +
      `\n\nTo save, call manul_save_hunt with the path and the content above.`;
  } else {
    text += '\n\nNo steps were executed successfully, so no hunt file was generated.';
  }

  return {
    content: [{ type: 'text', text }],
    structuredContent: { goal, normalization, issues, response, hunt_proposal: huntProposal },
  };
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
  logger.info(`Starting ${label} MCP bridge (Python runner: ${runtimeSettings.pythonPath})`);

  const server = createSdkServer();
  const transport = new StdioServerTransport();
  activeServer = server;

  await server.connect(transport);
  logger.info('ManulMcpServer MCP stdio transport connected.');
}

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down MCP bridge.`);
  await pythonRunner.shutdown().catch(() => {});
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