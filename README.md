# ManulMcpServer

VS Code extension for authoring and running ManulEngine `.hunt` files, with native `MCP Servers` integration through `ManulMcpServer`.

## Features

- Hunt language registration for .hunt files
- Syntax highlighting for commands, metadata, hooks, variables, and qualifiers
- IntelliSense for DSL commands, metadata directives, hook blocks, and contextual qualifiers
- Hover documentation sourced from the Manul DSL contract
- Validation diagnostics for malformed commands, indentation problems, and hook misuse
- Publishes `ManulMcpServer` into VS Code `MCP Servers`
- Starts a real stdio MCP bridge that forwards MCP tool calls to the Manul runtime API
- Command palette support for Run Step and Run Hunt File
- Editor title run button for active .hunt files
- Dedicated ManulMcpServer output panel for execution logs, normalized DSL, API responses, and errors
- Status bar integration showing ManulMcpServer readiness and run state
- Internal Manul execution layer that normalizes user input, validates DSL, and forwards requests to the Python API

## Project Layout

```text
src/
	commands/
	config/
	dsl/
	language/
	mcp/
	services/
	types/
snippets/
syntaxes/
```

## Commands

- ManulMcpServer: Run Step
	Prompts for a single step or natural-language instruction, normalizes it to DSL, validates it, and sends it to POST /run-step.
- ManulMcpServer: Run Hunt File
	Reads the active .hunt editor, validates the full document, extracts runnable steps, and sends the DSL plus step list to POST /run-steps.

## MCP Servers Integration

This extension contributes a real MCP server definition provider, so after installation VS Code can discover `ManulMcpServer` directly in the `MCP Servers` section.

How it works:

- The extension registers `manul.mcp-servers` as an MCP server definition provider.
- VS Code requests a server definition from the extension.
- The extension publishes a `ManulMcpServer` stdio server entry.
- VS Code launches the bundled Node bridge.
- The bridge exposes Manul MCP tools and forwards them to the configured local Manul runtime API.

The published MCP tools are:

- `manul_run_step`
- `manul_run_goal`
- `manul_run_hunt`
- `manul_run_hunt_file`
- `manul_validate_hunt`
- `manul_normalize_step`
- `manul_get_state`
- `manul_preview_goal`

## Manul Runtime API Contract

The extension expects a local API with the following endpoints:

- POST /run-step
- POST /run-steps
- GET /state

Every request includes a sessionId header. The extension generates a persistent session ID unless one is configured explicitly.

## Configuration

Available settings:

- manul.apiBaseUrl
	Base URL for the local Manul runtime service. Default: http://127.0.0.1:8000
- manul.sessionId
	Optional fixed session ID. If empty, the extension creates one and stores it in global state.
- manul.requestTimeoutMs
	Request timeout in milliseconds. Default: 60000
- manul.logNormalizedDsl
	When enabled, the output channel logs the normalized DSL for auto-corrected input.
- manul.mcpServerLabel
	Label shown in the VS Code `MCP Servers` view for the ManulMcpServer bridge.

## Natural Language Normalization

The internal Manul execution layer keeps the DSL as the source of truth while still accepting lightweight natural-language input for one-off steps. Examples:

- clik login -> Click the 'login' button
- fill email with test@example.com -> Fill 'email' field with 'test@example.com'
- verify dashboard -> VERIFY that 'dashboard' is present

The normalizer is intentionally thin. It does not implement browser behavior, DOM parsing, or agent-side execution logic.

## Development

Install dependencies:

```bash
npm install
```

Compile:

```bash
npm run build
```

Package the extension:

```bash
npm run package
```

Run in VS Code:

1. Open this folder in VS Code.
2. Run the Extension Development Host from the debugger or use the Run and Debug view.
3. Open the `MCP Servers` view and confirm that `ManulMcpServer` is listed.
4. Open or create a .hunt file.
5. Use the editor title run button, the command palette, the status bar action, or ManulMcpServer MCP tools from chat.

## Notes

- The extension does not implement browser automation itself.
- The Python Manul runtime remains responsible for execution and DSL handling.
- Validation is deterministic and contract-driven; malformed commands are surfaced in the Problems panel before execution.
- The MCP bridge is a stdio child process started by VS Code, not an external daemon.
- Minimum supported VS Code version is 1.110 because MCP server definition APIs are required.

## What's New

- Initial production-ready extension scaffold with command execution, DSL tooling, output logging, VSIX packaging support, and native `MCP Servers` integration via a bundled Manul MCP bridge.

## License

Apache-2.0