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

## ManulEngine

This extension requires **ManulEngine** — the deterministic web and desktop automation runtime that powers the `.hunt` DSL.

| | |
|---|---|
| PyPI | [![PyPI](https://img.shields.io/pypi/v/manul-engine?label=PyPI&logo=pypi)](https://pypi.org/project/manul-engine/) |
| Manul Engine Extension | [![Manul Engine Extension](https://img.shields.io/visual-studio-marketplace/v/manul-engine.manul-engine?label=Manul%20Engine%20Extension&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=manul-engine.manul-engine) |
| GitHub | [alexbeatnik/ManulEngine](https://github.com/alexbeatnik/ManulEngine) |
| Status | Alpha — battle-tested on real-world DOMs, APIs may evolve |

---

## What It Does

- **MCP server** — registers `ManulMcpServer` in VS Code's MCP Servers view so Copilot can drive a real browser via chat
- **Hunt language support** — syntax highlighting, IntelliSense, hover docs, and inline diagnostics for `.hunt` files
- **Run from editor** — run button in the editor title bar, command palette, and status bar for `.hunt` files
- **Natural language input** — type `click login` or `fill email with test@example.com` and the extension normalizes it to proper DSL before sending to the engine

---

## Requirements

- VS Code 1.110 or newer
- Python 3.10+ with [ManulEngine](https://pypi.org/project/manul-engine/) installed:

```bash
pip install manul-engine
playwright install
```

A workspace-local `.venv` is automatically detected and used if present.

---

## Installation

Install the `.vsix` file:

```bash
code --install-extension manul-mcp-server-0.0.2.vsix
```

Then **Reload Window** (Ctrl+Shift+P → `Developer: Reload Window`).

After reload, `ManulMcpServer` appears in the **MCP Servers** panel and Copilot chat gains the Manul tools automatically.

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
| `manul_save_hunt` | Save a `.hunt` file to disk |

---

## Hunt File Quick Start

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

## What's New

- Initial release: MCP server integration, `.hunt` language support, Python runner bridge, `manul_scan_page` and `manul_save_hunt` tools.

## License

Apache-2.0