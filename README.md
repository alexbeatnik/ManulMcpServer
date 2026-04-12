# ManulMcpServer

[![PyPI](https://img.shields.io/pypi/v/manul-engine?label=PyPI&logo=pypi)](https://pypi.org/project/manul-engine/)
[![PyPI Downloads](https://static.pepy.tech/personalized-badge/manul-engine?period=total&units=INTERNATIONAL_SYSTEM&left_color=BLACK&right_color=GREEN&left_text=downloads)](https://pepy.tech/projects/manul-engine)
[![Manul Engine Extension](https://img.shields.io/visual-studio-marketplace/v/manul-engine.manul-engine?label=Manul%20Engine%20Extension&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=manul-engine.manul-engine)
[![MCP Server](https://img.shields.io/visual-studio-marketplace/v/manul-engine.manul-mcp-server?label=MCP%20Server&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=manul-engine.manul-mcp-server)
[![Status: Alpha](https://img.shields.io/badge/status-alpha-d97706)](#status)

**Bridge between GitHub Copilot and deterministic browser automation.** ManulMcpServer is a VS Code extension that exposes [ManulEngine](https://github.com/alexbeatnik/ManulEngine) as a native [MCP](https://modelcontextprotocol.io/) server — giving Copilot Chat (and any MCP-compatible agent) the ability to drive real browsers, run `.hunt` test scripts, and generate automation from natural language, all inside your existing development workflow.

> **Status: Alpha.** Actively developed alongside ManulEngine. APIs and file formats may evolve.

---

## Why ManulMcpServer

- **Deterministic automation inside Copilot Chat.** Copilot gains browser control backed by ManulEngine's heuristic element resolver — no LLM required for element targeting.
- **Natural language to executable DSL.** Say *"log in to SauceDemo and verify the inventory page"* — the server normalizes it into `.hunt` steps, runs them, and returns a replayable script.
- **Editor-first authoring.** Syntax highlighting, IntelliSense, hover docs, inline diagnostics, and one-click run for `.hunt` files.
- **CI/CD ready.** The same `.hunt` scripts that run in Copilot Chat can run headless in your pipeline with `manul <path>`.
- **Explainable and auditable.** Every action is a readable DSL line, every element resolution scores 0.0–1.0 with an explain mode — no black-box clicks.

---

## Quick Demo

### 1. Write a `.hunt` file

```hunt
@context: Login flow smoke test
@title: SauceDemo Login

STEP 1: Login
    NAVIGATE to 'https://www.saucedemo.com/'
    VERIFY that 'Username' is present
    Fill 'Username' field with 'standard_user'
    Fill 'Password' field with 'secret_sauce'
    Click the 'Login' button
    VERIFY that 'Sauce Labs Backpack' is present

DONE.
```

### 2. Run from the editor

Click the **▷** button in the editor title bar, or press `Ctrl+Shift+R` (`Cmd+Shift+R` on Mac).

### 3. Run from Copilot Chat

Open Copilot Chat and use the MCP tools directly:

```
# Run a single step
@manul Run step: NAVIGATE to 'https://www.saucedemo.com/'

# Run a full goal — Copilot calls manul_run_goal under the hood
@manul Log in to SauceDemo with standard_user / secret_sauce
       and verify the inventory page loads

# Scan the page after navigation
@manul Scan the current page for interactive elements
```

Copilot uses `manul_run_step` for individual actions, `manul_run_goal` for multi-step flows, and `manul_scan_page` to discover page elements. After a goal run, ask Copilot to save the generated `.hunt` file — it calls `manul_save_hunt` to write it to `tests/`.

---

## Integration Patterns

### Copilot Chat (primary workflow)

ManulMcpServer registers itself as an MCP server automatically. Copilot Chat discovers the Manul tools and can:

- Run individual DSL steps or natural-language actions (`manul_run_step`)
- Execute multi-step goals and produce replayable `.hunt` files (`manul_run_goal`)
- Read page content and discover interactive elements (`manul_scan_page`, `manul_read_page_text`)
- Validate and normalize DSL without execution (`manul_validate_hunt`, `manul_normalize_step`)

### CI/CD pipelines

`.hunt` scripts generated via Copilot are plain text — commit them to your repo and run headless in CI:

```bash
pip install manul-engine==0.0.9.28
playwright install chromium
manul tests/ --headless --html-report
```

The CLI produces exit code 0 on pass, 1 on failure, and optionally generates a self-contained HTML report.

### Other MCP clients

Any MCP-compatible agent or client can connect to ManulMcpServer's stdio bridge. The server advertises 11 tools with full JSON Schema input definitions, making integration straightforward for custom agent harnesses, product dashboards, or internal tooling.

---

## Installation

### 1. Install the extension

```bash
code --install-extension manul-mcp-server-0.0.7.vsix
```

Or install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=manul-engine.manul-mcp-server).

### 2. Install runtime dependencies

```bash
pip install manul-engine==0.0.9.28
playwright install
```

### 3. Reload VS Code

`Ctrl+Shift+P` → **Developer: Reload Window**

After reload, `ManulMcpServer` appears in the MCP Servers panel and Copilot Chat gains the Manul tools automatically.

### Prerequisites

- **VS Code** 1.107+
- **Node.js** on `PATH` (the managed MCP entry launches the bridge with `node -e`)
- **Python** 3.10+ with `manul-engine` installed
- **Playwright browsers** (`playwright install`)

> **Workspace `.venv` detection:** Open the target workspace folder first, or set `manul.pythonPath` to the exact interpreter path.

---

## Configuration

Open Settings (`Ctrl+,`) and search for `manul`:

| Setting | Default | Description |
|---------|---------|-------------|
| `manul.pythonPath` | `python3` | Python interpreter. Auto-discovers workspace `.venv` when left as default. |
| `manul.executablePath` | `''` | Path to a custom browser or Electron app. Use with `OPEN APP` for desktop automation. |
| `manul.headless` | `false` | Run the browser without a visible window. |
| `manul.apiBaseUrl` | `http://127.0.0.1:8000` | ManulEngine HTTP API URL for editor Run commands. |
| `manul.requestTimeoutMs` | `60000` | Timeout for engine calls (ms). |
| `manul.logNormalizedDsl` | `true` | Log auto-corrected DSL in the output panel. |
| `manul.mcpServerLabel` | `ManulMcpServer` | Label in the MCP Servers view. |

Example `settings.json`:

```jsonc
{
  "manul.pythonPath": "/home/user/project/.venv/bin/python",
  "manul.headless": true,
  "manul.executablePath": "/opt/my-electron-app/app"
}
```

> **Two execution paths:** MCP tools (`manul_run_step`, `manul_run_goal`, etc.) use the **bundled Python runner** directly — no server needed. Editor title bar **Run** commands use the ManulEngine **HTTP API** at `manul.apiBaseUrl` (start it with `manul serve`).

---

## MCP Tools Reference

| Tool | Description |
|------|-------------|
| `manul_run_step` | Run a single DSL step or natural-language action in the live browser |
| `manul_run_goal` | Convert a goal into DSL steps, execute them, return a `.hunt` proposal |
| `manul_run_hunt` | Validate and execute a `.hunt` document passed as text |
| `manul_run_hunt_file` | Run a `.hunt` file from disk |
| `manul_validate_hunt` | Validate `.hunt` syntax and return diagnostics — no execution |
| `manul_normalize_step` | Preview how natural language maps to canonical DSL |
| `manul_preview_goal` | Preview goal-to-DSL conversion without execution |
| `manul_scan_page` | List all interactive elements on the current page |
| `manul_read_page_text` | Read all visible text content from the current page |
| `manul_get_state` | Query browser status, engine version, and session state |
| `manul_save_hunt` | Save a `.hunt` file to disk (workspace-jailed) |

All tools use synchronous request/response. The browser session is persistent — it opens on first use and stays alive across tool calls for inspect/retry.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `No module named 'manul_engine'` | Install `manul-engine` into the interpreter selected by `manul.pythonPath`, or open the workspace so `.venv` is discovered. |
| `node: command not found` | The MCP bridge requires Node.js on `PATH`. Install Node.js and reload VS Code. |
| MCP server ignores workspace `.venv` | Open the project folder in VS Code, or set `manul.pythonPath` explicitly. |
| Editor **Run** commands fail, but MCP tools work | Editor commands need `manul serve` running. MCP tools use the bundled runner directly. |
| Browser does not open | Check `manul.headless` is `false`. Ensure `playwright install` has been run. |

---

## Ecosystem

ManulMcpServer is one layer of the Manul automation stack:

| Component | Role | Link |
|-----------|------|------|
| **ManulEngine** | Deterministic automation runtime (Python). Heuristic element resolver, `.hunt` DSL, CLI runner. | [PyPI](https://pypi.org/project/manul-engine/) · [GitHub](https://github.com/alexbeatnik/ManulEngine) |
| **Manul Engine Extension** | VS Code extension for ManulEngine with debug panel, explain mode, and Test Explorer integration. | [Marketplace](https://marketplace.visualstudio.com/items?itemName=manul-engine.manul-engine) |
| **ManulMcpServer** *(this)* | MCP bridge that gives Copilot Chat and other agents access to ManulEngine. | [Marketplace](https://marketplace.visualstudio.com/items?itemName=manul-engine.manul-mcp-server) · [GitHub](https://github.com/alexbeatnik/ManulMcpServer) |
| **ManulAI Local Agent** | Autonomous AI agent for browser automation, powered by ManulEngine. | [GitHub](https://github.com/alexbeatnik/ManulAI-local-agent) |

---

## Keyboard Shortcuts

| Shortcut | Mac | Command |
|----------|-----|---------|
| `Ctrl+Shift+R` | `Cmd+Shift+R` | Run Hunt File |
| `Ctrl+Shift+Enter` | `Cmd+Shift+Enter` | Run Step |

Active when a `.hunt` file is focused in the editor.

---

## What's New

### 0.0.7

- **Compatibility:** Synced embedded DSL contract metadata to ManulEngine `0.0.9.28`.
- **DSL:** Added `IF` / `ELIF` / `ELSE` conditional branching — validation, syntax highlighting, completion, snippets, and agent contract.
- **DSL:** Updated canonical command labels to ALL UPPERCASE per engine `casePolicy` (`CLICK`, `FILL`, `TYPE`, `SELECT`, `CHECK`, `UNCHECK`, `DRAG`).
- **Docs:** Updated `contracts/MANUL_MCP_AGENT_CONTRACT.md` and `.github/copilot-instructions.md` with conditional branching reference.
- **Release:** Updated extension/package versioning to `0.0.7`.

### 0.0.6

- **Compatibility:** Synced embedded DSL contract metadata to ManulEngine `0.0.9.27`.
- **Docs:** Added `contracts/MANUL_MCP_AGENT_CONTRACT.md` — machine-readable contract for AI agents consuming ManulEngine via MCP (tool schemas, DSL reference, workflow guidelines, response shapes, security constraints).
- **Docs:** Updated `.github/copilot-instructions.md` with complete v0.0.9.27 DSL reference including `OPEN APP`, `UPLOAD`, `MOCK`, `VERIFY VISUAL`, strict placeholder/value assertions, `CALL PYTHON`, `SCAN PAGE`, `DEBUG VARS`, metadata headers (`@import:`, `@export:`, `@data:`, `@schedule:`), and hook blocks (`[SETUP]`/`[TEARDOWN]`).
- **Release:** Updated extension/package versioning to `0.0.6`.

### 0.0.5

- **Compatibility:** Synced embedded DSL contract metadata to ManulEngine `0.0.9.26`.
- **DSL:** Added support for `@import:`, `@export:`, and `USE` in validation, completion, hover docs, snippets, and syntax highlighting.
- **Desktop automation:** Added `manul.executablePath` and propagated `MANUL_EXECUTABLE_PATH` through the MCP bridge into the bundled Python runner for `OPEN APP` flows.
- **Release:** Updated extension/package versioning to `0.0.5`.

### 0.0.4

- **Stability:** Fixed PythonRunner `ensureProcess()` race condition — concurrent callers no longer spawn duplicate processes.
- **Stability:** Browser now stays alive on step failure for inspect/retry instead of closing the session.
- **Security:** Workspace-jail path validation added to Python `save_hunt` handler and extracted into shared `pathValidator.ts`.
- **Performance:** Page scan now runs only on the last step or on failure, not after every step.
- **Performance:** Shadow-root traversal uses targeted selector instead of `querySelectorAll('*')`.
- **Maintainability:** Centralized config defaults into `src/config/defaults.ts` — no more duplicated normalizers.
- **Maintainability:** Shared DSL line iterator (`src/dsl/parser.ts`) eliminates duplicated hook-block state machines.
- **DX:** Hover provider rewritten as data-driven loop from contract — no more hardcoded if-branches.
- **DX:** Qualifier suggestion regex derived from contract `interactionMode` instead of hardcoded list.
- **DX:** Keyboard shortcuts for Run Hunt File (`Ctrl+Shift+R`) and Run Step (`Ctrl+Shift+Enter`).
- **DX:** Added `manul_read_page_text` MCP tool for reading visible page text.
- **Testing:** Added vitest with 67 unit tests covering validator, builder, parser, and config defaults.
- Updated DSL contract to v0.0.9.21.

### 0.0.3

- Managed user-scope `mcp.json` sync on install, activation, settings change, and uninstall.
- User-scope MCP bootstrap now resolves the latest installed extension directory via `node -e` instead of a stale versioned script path.
- Documentation updated to reflect external runtime requirements and workspace `.venv` behavior.

## License

Apache-2.0