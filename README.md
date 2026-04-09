# ManulMcpServer

[![PyPI](https://img.shields.io/pypi/v/manul-engine?label=PyPI&logo=pypi)](https://pypi.org/project/manul-engine/)
[![PyPI Downloads](https://static.pepy.tech/personalized-badge/manul-engine?period=total&units=INTERNATIONAL_SYSTEM&left_color=BLACK&right_color=GREEN&left_text=downloads)](https://pepy.tech/projects/manul-engine)
[![Manul Engine Extension](https://img.shields.io/visual-studio-marketplace/v/manul-engine.manul-engine?label=Manul%20Engine%20Extension&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=manul-engine.manul-engine)
[![MCP Server](https://img.shields.io/visual-studio-marketplace/v/manul-engine.manul-mcp-server?label=MCP%20Server&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=manul-engine.manul-mcp-server)
[![Status: Alpha](https://img.shields.io/badge/status-alpha-d97706)](#status)

VS Code extension that turns [ManulEngine](https://github.com/alexbeatnik/ManulEngine) into a native MCP server available directly in GitHub Copilot chat. Write `.hunt` automation scripts, run them from the editor, or invoke them through Copilot using natural language.

## Status

> **Alpha.** Developed alongside ManulEngine — both projects are in active development. API and file formats are subject to change.

---

## Installation

1. Install the `.vsix` file:

```bash
code --install-extension manul-mcp-server-0.0.6.vsix
```

2. Install the runtime dependencies:

```bash
pip install manul-engine==0.0.9.27
playwright install
```

3. If you want the MCP runner to use a workspace-local `.venv`, open that folder in VS Code and leave `manul.pythonPath` at `python3`, or point `manul.pythonPath` at the exact interpreter you want.

4. **Reload Window** (Ctrl+Shift+P → `Developer: Reload Window`).

After reload, `ManulMcpServer` appears in the **MCP Servers** panel and Copilot chat gains the Manul tools automatically.
The extension also syncs its user-scope `ManulMcpServer` entry in `User/mcp.json` during install and activation, and removes that entry on uninstall. That managed entry uses `node -e` bootstrap logic to resolve the newest installed extension directory automatically, so upgrades do not leave stale versioned paths behind.

---

## Requirements

- VS Code 1.107 or newer
- `node` available on `PATH` (the managed user-scope MCP entry launches the bridge with `node -e`)
- Python 3.10+ with [ManulEngine](https://pypi.org/project/manul-engine/) installed

---

## First Run Checklist

For a new machine, the extension is not fully self-contained. The `mcp.json` wiring is automatic now, but the runtime dependencies are still external:

1. Install the extension.
2. Install Python 3.10+.
3. Install `manul-engine==0.0.9.27` into the Python environment you want the server to use.
4. Run `playwright install`.
5. Open the target workspace if you expect workspace-local `.venv` auto-detection.
6. Reload VS Code.

---

## What It Does

- **MCP server** — registers `ManulMcpServer` in VS Code's MCP Servers view so Copilot can drive a real browser via chat
- **Hunt language support** — syntax highlighting, IntelliSense, hover docs, and inline diagnostics for `.hunt` files
- **Run from editor** — run button in the editor title bar, command palette, and status bar for `.hunt` files
- **Natural language input** — type `click login` or `fill email with test@example.com` and the extension normalizes it to proper DSL before sending to the engine

---

## Quick Start

Create a file with the `.hunt` extension and write your automation:

```
@context: Login flow smoke test
@title: SauceDemo Login

STEP 1: Login
    NAVIGATE to 'https://www.saucedemo.com/'
    VERIFY that 'Username' is present
    Fill 'Username' field with 'standard_user'
    Fill 'Password' field with 'secret_sauce'
    Click the 'login-button' button
    VERIFY that 'Sauce Labs Backpack' is present

DONE.
```

Click the **▷** button in the editor title bar to run it.

---

## Configuration

Open **Settings** (Ctrl+,) and search for `manul`:

| Setting | Default | Description |
|---------|---------|-------------|
| `manul.pythonPath` | `python3` | Python executable. Leave as `python3` to auto-detect a local `.venv`. |
| `manul.executablePath` | `''` | Absolute path to a custom browser or Electron executable. Use with `OPEN APP` for desktop automation. |
| `manul.headless` | `false` | Run browser in headless mode. |
| `manul.requestTimeoutMs` | `60000` | Timeout in ms for engine calls. |
| `manul.logNormalizedDsl` | `true` | Log auto-corrected DSL in the output panel. |
| `manul.mcpServerLabel` | `ManulMcpServer` | Label shown in the MCP Servers view. |
| `manul.apiBaseUrl` | `http://127.0.0.1:8000` | Base URL for the ManulEngine HTTP API used by the editor **Run Step** and **Run Hunt File** commands. |

> **Note:** The editor title bar **Run** commands (`Run Step`, `Run Hunt File`) connect to the ManulEngine HTTP API at `manul.apiBaseUrl`. You need a running ManulEngine server for those commands to work:
> ```bash
> manul serve
> ```
> MCP tools (`manul_run_step`, `manul_run_goal`, etc.) use the bundled Python runner directly and do **not** require a separate HTTP server.

---

## MCP Tools Available in Copilot Chat

| Tool | What it does |
|------|-------------|
| `manul_run_step` | Run a single DSL step or natural-language action in the browser |
| `manul_run_goal` | Convert a natural-language goal into steps and execute them |
| `manul_run_hunt` | Run a full `.hunt` document passed as text |
| `manul_run_hunt_file` | Run a `.hunt` file from disk |
| `manul_validate_hunt` | Validate a `.hunt` document without running it |
| `manul_normalize_step` | Preview how a step will be normalized to DSL |
| `manul_get_state` | Get current browser and session state |
| `manul_preview_goal` | Preview goal-to-DSL conversion without execution |
| `manul_scan_page` | List all interactive elements on the current page |
| `manul_read_page_text` | Read all visible text content from the current page |
| `manul_save_hunt` | Save a `.hunt` file to disk |

---

## Troubleshooting

- `manul-engine not installed: No module named 'manul_engine'`
    Install `manul-engine==0.0.9.27` into the Python interpreter selected by `manul.pythonPath`, or open the workspace so the extension can discover the local `.venv`.
- `node: command not found`
    The managed user-scope MCP entry launches the bridge with `node`, so Node.js must be available on `PATH`.
- The MCP server starts but does not pick up the workspace `.venv`
    Open the project folder in VS Code or set `manul.pythonPath` explicitly to the desired interpreter.
- The editor **Run Step** / **Run Hunt File** commands fail while MCP chat tools work
    That is expected when `manul serve` is not running. Editor commands use the HTTP API; MCP tools use the bundled Python runner.

---

## ManulEngine

This extension requires **ManulEngine** — the deterministic web and desktop automation runtime that powers the `.hunt` DSL.

| | |
|---|---|
| PyPI | [![PyPI](https://img.shields.io/pypi/v/manul-engine?label=PyPI&logo=pypi)](https://pypi.org/project/manul-engine/) |
| Manul Engine Extension | [![Manul Engine Extension](https://img.shields.io/visual-studio-marketplace/v/manul-engine.manul-engine?label=Manul%20Engine%20Extension&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=manul-engine.manul-engine) |
| GitHub | [alexbeatnik/ManulEngine](https://github.com/alexbeatnik/ManulEngine) |
| Status | Alpha — battle-tested on real-world DOMs, APIs may evolve |

---

## Hunt File Format

```
@context: <context for the AI planner>
@title: <suite name>

STEP 1: <description>
    NAVIGATE to 'https://...'
    VERIFY that 'element' is present
    Fill 'Field' field with 'value'
    Click the 'Button' button
    VERIFY that 'result' is present

DONE.
```

**Rules:**
- `@context:`, `@title:`, `STEP N:`, and `DONE.` are flush-left
- Action lines inside a STEP are indented with 4 spaces
- Lines starting with `#` are comments

---

## Keyboard Shortcuts

| Shortcut | Mac | Command |
|----------|-----|---------|
| `Ctrl+Shift+R` | `Cmd+Shift+R` | Run Hunt File |
| `Ctrl+Shift+Enter` | `Cmd+Shift+Enter` | Run Step |

Shortcuts are active when a `.hunt` file is focused in the editor.

---

## What's New

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