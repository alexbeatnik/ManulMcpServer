# ManulMcpServer — Developer Guide

## Architecture Overview

```
VS Code Extension Host
└── extension.ts              — activation, command registration, status bar, language features
    ├── commands/
    │   ├── runStep.ts         — "ManulMcpServer: Run Step" command
    │   └── runFile.ts         — "ManulMcpServer: Run Hunt File" command
    ├── config/
    │   ├── settings.ts        — typed wrapper around VS Code workspace settings
    │   ├── runtimeSettings.ts — env-var-based config for the MCP bridge process
    │   ├── defaults.ts        — shared constants and normalize functions
    │   └── contract.ts        — DSL contract loader (pages.json / MANUL_DSL_CONTRACT)
    ├── dsl/
    │   ├── builder.ts         — natural language → DSL normalization
    │   ├── parser.ts          — shared DSL line iterator (iterateDslLines)
    │   └── validator.ts       — deterministic DSL validation (regex-based, no engine needed)
    ├── language/
    │   ├── completion.ts      — IntelliSense completions for .hunt files
    │   ├── diagnostics.ts     — inline error/warning diagnostics
    │   ├── hover.ts           — hover documentation
    │   └── languageConfig.ts  — language feature registration
    ├── mcp/
    │   ├── launcher.ts        — launch specs for direct provider mode vs managed user mcp.json bootstrap
    │   ├── server.ts          — ManulMcpServer facade (wraps PythonRunner)
    │   ├── stdioServer.ts     — MCP stdio bridge (tool definitions + handlers)
    │   ├── provider.ts        — VS Code MCP server definition provider
    │   └── userConfig.ts      — reads, writes, and removes the managed user-scope mcp.json entry
    ├── services/
    │   ├── pythonRunner.ts    — spawns manul_runner.py, JSON-line protocol
    │   ├── apiClient.ts       — (legacy) HTTP client for standalone API mode
    │   ├── logger.ts          — ManulLogger interface
    │   ├── output.ts          — VS Code output channel wrapper
    │   ├── statusBar.ts       — status bar item
    │   └── userMcpSync.ts     — activation-time sync for the managed user-scope mcp.json entry
    └── types/
        ├── api.ts             — ApiResult, ManulEngineState
        └── contract.ts        — DSL contract types

src/lifecycle/
├── install.ts                — `vscode:install` hook that creates or updates the managed user mcp.json entry
└── uninstall.ts              — `vscode:uninstall` hook that removes the managed user mcp.json entry

python/
└── manul_runner.py            — async Python process bridging JSON-line ↔ ManulEngine API
```

## How the MCP Bridge Works

There are now two launch paths that both end up in the same bridge process:

1. VS Code activates the extension on startup (`onStartupFinished`)
2. `provider.ts` registers a `McpServerDefinitionProvider` that VS Code queries for MCP server definitions inside the extension host
3. In parallel, the extension syncs a managed user-scope `User/mcp.json` entry on install, activation, and `manul.*` setting changes
4. The provider path launches `out/mcp/stdioServer.js` directly; the managed `mcp.json` path launches `node -e ...` bootstrap that finds the newest installed extension directory and then requires the same `stdioServer.js`
5. `stdioServer.ts` creates a `PythonRunner` which spawns `python/manul_runner.py`
6. MCP tool calls flow: **Copilot → stdioServer.ts → PythonRunner (JSON-line) → manul_runner.py → ManulEngine**
7. `manul_runner.py` maintains a persistent `ManulSession` (Playwright browser) across calls

```
Copilot Chat
    │  MCP JSON-RPC (stdio)
    ▼
stdioServer.ts  (Node.js)
    │  JSON-line protocol  { id, method, params } / { id, ok, data }
    ▼
manul_runner.py  (Python async)
    │  ManulEngine Python API
    ▼
Playwright Browser
```

## JSON-Line Protocol

`PythonRunner` communicates with `manul_runner.py` over stdin/stdout using newline-delimited JSON:

**Request** (Node → Python):
```json
{ "id": "1", "method": "run_steps", "params": { "steps": ["NAVIGATE to https://..."] } }
```

**Response** (Python → Node):
```json
{ "id": "1", "ok": true, "data": { "results": [...], "pass_count": 1, "total": 1 } }
```

Special message from Python on startup:
```json
{ "type": "ready" }
```

Available methods: `run_steps`, `get_state`, `propose_hunt`, `save_hunt`, `scan_page`, `read_page_text`, `reset`, `shutdown`

## Setup

```bash
# Install Node dependencies
npm install

# Install ManulEngine (editable for local dev)
cd ../ManulEngine
pip install -e .
cd ../ManulMcpServer

# Optional: create workspace venv (auto-detected by PythonRunner)
python3 -m venv .venv
source .venv/bin/activate
pip install manul-engine==0.0.9.27
playwright install
```

Notes:

- The managed user-scope MCP entry runs `node -e ...`, so `node` must be on `PATH`.
- Workspace `.venv` discovery is most reliable when the workspace folder is open in VS Code or `manul.pythonPath` is set explicitly.

## Development Workflow

```bash
# Type-check without emitting
npm run check

# Build
npm run build

# Watch mode
npm run watch

# Package VSIX
npm run package

# Install into VS Code
code --install-extension manul-mcp-server-0.0.6.vsix --force

# Lifecycle hooks used by installed builds
npm run vscode:install
npm run vscode:uninstall
```

After installing, run **Developer: Reload Window** in VS Code.

### Extension Development Host

1. Open this folder in VS Code
2. Press **F5** (or Run → Start Debugging)
3. A new VS Code window opens with the extension loaded
4. Open any `.hunt` file to test language features
5. Open Copilot chat to test MCP tools

## Python Runner: `manul_runner.py`

The runner is a long-lived async process. Key design decisions:

- **Session persistence**: a single `ManulSession` (Playwright) is reused across all steps; the browser stays alive even on failure so the user can inspect/retry. Only explicit reset or shutdown closes the session.
- **`cwd`**: spawned with `cwd = workspacePath` so relative paths like `tests/foo.hunt` resolve to the user's current workspace, not the extension install dir
- **`page_scan`**: runs `_SCAN_PAGE_JS` only on the last step or on failure to reduce overhead; captures interactive element state
- **Custom `_SCAN_PAGE_JS`**: maintained inline in `manul_runner.py` (not imported from engine) to allow independent evolution; includes `label[for]` resolution for radio/checkbox, `value` field for inputs, `manul_id` field; shadow-root traversal uses targeted selectors

### Adding a New Method

1. Add `_handle_<method>` to `ManulRunner` in `manul_runner.py`
2. Register it in `_HANDLERS`
3. Add `public async <method>(): Promise<ApiResult>` to `PythonRunner` in `pythonRunner.ts`
4. Add a tool definition + handler in `stdioServer.ts`
5. Rebuild and reinstall

## DSL Validation

`src/dsl/validator.ts` contains regex patterns for every DSL command. Validation is intentionally **stateless and offline** — it runs without the engine, used for:
- Inline diagnostics in the editor
- Pre-flight checks before sending steps to the runner
- `manul_validate_hunt` MCP tool

The contract source of truth is `MANUL_DSL_CONTRACT.md` in the ManulEngine repo. When the engine adds new commands, update the patterns in `validator.ts` accordingly.

## Configuration Env Vars (MCP Bridge Process)

When VS Code launches the MCP bridge (`stdioServer.js`), it passes:

| Env var | Source | Used for |
|---------|--------|----------|
| `MANUL_PYTHON_PATH` | `manul.pythonPath` setting | Python executable resolution |
| `MANUL_WORKSPACE_PATH` | VS Code workspace folder when available | `cwd` for Python runner, venv detection |
| `MANUL_HEADLESS` | `manul.headless` setting | Playwright headless flag |
| `MANUL_REQUEST_TIMEOUT_MS` | `manul.requestTimeoutMs` setting | JSON-line call timeout |
| `MANUL_MCP_LABEL` | `manul.mcpServerLabel` setting | Display label |

## Managed User mcp.json Entry

The extension now manages its own user-scope `mcp.json` entry:

- Created or updated by `vscode:install`
- Refreshed on extension activation and when `manul.*` settings change
- Removed by `vscode:uninstall`
- Written under `User/mcp.json` for VS Code, VS Code Insiders, VSCodium, Cursor, and OSS builds based on the install path

Important implementation details:

- The managed entry uses `node -e` bootstrap instead of a direct versioned script path, so it always resolves the newest installed `manul-engine.manul-mcp-server-*` folder.
- The managed entry intentionally does **not** write `cwd: "${workspaceFolder}"` or `MANUL_WORKSPACE_PATH` because user-scope MCP config can be started outside any folder context, and `${workspaceFolder}` breaks there.
- Because of that, workspace-local `.venv` discovery depends on real workspace context from VS Code or on an explicit `manul.pythonPath` setting.
- The managed writer strips stale fields like old `cwd`, `command`, `args`, and `type` from an existing `ManulMcpServer` entry before rewriting it.

If you create a manual user-scope `mcp.json` entry yourself, prefer matching the managed bootstrap pattern rather than hardcoding a versioned path to `out/mcp/stdioServer.js`.

## Key Files to Know

| File | Why it matters |
|------|---------------|
| `python/manul_runner.py` | The engine bridge — most runtime behaviour lives here |
| `src/mcp/stdioServer.ts` | All MCP tool definitions — add/modify tools here |
| `src/services/pythonRunner.ts` | Process lifecycle and JSON-line protocol |
| `src/mcp/launcher.ts` | Defines the direct launch path vs the managed `node -e` bootstrap path |
| `src/mcp/userConfig.ts` | Owns managed `User/mcp.json` reads, writes, cleanup, and stale-field removal |
| `src/services/userMcpSync.ts` | Syncs the managed user `mcp.json` entry at activation and settings changes |
| `src/dsl/validator.ts` | All DSL validation patterns |
| `src/dsl/builder.ts` | Natural language → DSL normalization rules |
| `src/mcp/provider.ts` | How the extension registers with VS Code MCP |

## Known Limitations

- ManulEngine sessions are not shared between VS Code windows
- Playwright browser is visible by default (`headless: false`) — set `manul.headless: true` in settings to suppress
- After any step failure the browser is closed; the next call re-opens it automatically
- `manul_runner.py` uses the ManulEngine Python API directly (not the HTTP endpoint), so no running API server is required
- The extension manages MCP wiring automatically, but it does not install Python, `manul-engine`, Playwright browsers, or Node.js for the user
- If the user starts the server without opening the target folder and without setting `manul.pythonPath`, workspace-local `.venv` auto-detection may not resolve the intended interpreter
