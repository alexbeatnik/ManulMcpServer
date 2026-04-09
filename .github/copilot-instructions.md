# Manul MCP Server — Copilot Instructions

## Browser Automation Workflow

When using ManulMcpServer tools (`manul_run_step`, `manul_run_hunt_file`, etc.) to perform browser automation tasks:

1. **Execute all requested actions** using ManulMcpServer tools.
2. **Add VERIFY steps** after every action that changes state (fill, click, navigate) to confirm it succeeded.
3. **After completing the task**, always propose saving a `.hunt` file:
   - Generate clean, properly-formatted DSL (flush-left `@context:`, `@title:`, `STEP N:`, `DONE.`)
   - Ask the user: *"Should I save this as a hunt file so it can be replayed later?"*
   - If yes, save with `manul_save_hunt` to `tests/<descriptive_name>.hunt`

## Environment Rules

- Treat `manul-engine not installed`, missing Python, missing Playwright browsers, or missing `node` as environment/setup failures first, not as DSL failures.
- If a Manul tool fails before the browser opens, check the active Python environment and whether `manul-engine` is installed there before retrying browser steps.
- Do not assume workspace-local `.venv` detection will work if no folder is open. When setup matters, mention that opening the workspace or setting `manul.pythonPath` explicitly is more reliable.
- Do not recommend `${workspaceFolder}` in a user-scope `mcp.json` entry. It breaks when VS Code starts the MCP server outside a folder context.

## Tool Selection Rules

- `manul_run_step` is for one step at a time. Do not send multi-line step batches through it.
- For flows with multiple actions and `VERIFY` checks, prefer `manul_run_hunt` or `manul_run_goal`.
- After `NAVIGATE` and after state-changing clicks, prefer `manul_scan_page` when you need the exact current identifiers before choosing the next step.
- If a `VERIFY that 'text' is present` step fails but `manul_scan_page` shows a nearby stable identifier, adapt the verify target to the actual page text instead of reporting the whole flow as broken.
- Use `manul_read_page_text` when you need to read prices, labels, headings, or any static text that does not appear in the scan results.

## Hunt File Format Rules

- `@context:` and `@title:` must be flush-left (no leading spaces)
- `STEP N: description` headers must be flush-left
- `DONE.` must be flush-left
- Action lines inside a STEP are indented with 4 spaces

## DSL Command Reference (v0.0.9.27)

### Navigation
- `NAVIGATE to 'https://example.com'` — open URL, wait for DOM
- `OPEN APP` — attach to an Electron/desktop app window (requires executable_path)
- `SCROLL DOWN` — scroll one viewport; `SCROLL DOWN inside the 'container'` — scroll a specific container

### Clicking
- `Click the 'Label' button` — for buttons
- `Click the 'Label' link` — for links
- `Click the 'Label' element` — for generic elements
- `DOUBLE CLICK the 'Label'`
- `RIGHT CLICK 'Label'`
- `Check the checkbox for 'Label'` / `Uncheck the checkbox for 'Label'`

### Input
- `Fill 'Target' field with 'Value'` — target first, value last
- `Type 'Value' into the 'Target' field` — value first, target last (use `into` keyword)
- `Select 'Option' from the 'Target' dropdown`
- `PRESS ENTER` — submit focused element
- `PRESS Escape` / `PRESS Control+A` — any key or combo
- `PRESS Key on 'Target'` — press key on a specific element
- `UPLOAD 'file_path' to 'Target'` — file upload to a file-input element

### Assertions (VERIFY)
- `VERIFY that 'text' is present` — text or element visible on page ✅ most common
- `VERIFY that 'text' is NOT present`
- `VERIFY that 'Element' is ENABLED` / `is DISABLED`
- `VERIFY that 'Checkbox' is checked` / `is NOT checked`
- `VERIFY SOFTLY that 'text' is present` — non-fatal, continues on failure
- `Verify 'Element' field has value 'Expected'` — strict input value check
- `Verify 'Element' field has text 'Expected'` — strict inner text check
- `Verify 'Element' field has placeholder 'Expected'` — strict placeholder check
- `VERIFY VISUAL 'Element'` — take screenshot and compare against baseline

### Waiting
- `WAIT 2` — sleep N seconds
- `Wait for 'Element' to be visible` / `to be hidden` / `to disappear`
- `WAIT FOR RESPONSE "url_pattern"` — wait for network response

### Data & Variables
- `EXTRACT the 'Element' into {variable}` — store element text
- `SET {variable} = value` — set variable inline
- `@var: {key} = value` — file-level variable declaration

### Network
- `MOCK GET "url_pattern" with 'mock_file'` — intercept network requests (GET/POST/PUT/PATCH/DELETE)

### Python Integration
- `CALL PYTHON module.function` — execute a synchronous Python function
- `CALL PYTHON module.function "arg1" "arg2" into {result}` — with arguments and capture
- `@script: {alias} = scripts.helpers` — declare Python helper alias

### Utility
- `SCAN PAGE` — scan current page for elements; `SCAN PAGE into {filename}` — write to file
- `DEBUG` / `PAUSE` — pause execution
- `DEBUG VARS` — print all runtime variables

### Structure
- `STEP N: Description` — group actions into a named block
- `USE BlockName` — expand an imported STEP block
- `DONE.` — explicitly end the mission

### Contextual Qualifiers (disambiguation)
- `Click the 'Edit' button NEAR 'John Doe'` — disambiguate repeated elements
- `Click the 'Logo' link ON HEADER` — restrict to header/nav area
- `Click the 'Terms' link ON FOOTER` — restrict to footer area
- `Click the 'Delete' button INSIDE 'Actions' row with 'John'` — restrict to a table row

### Metadata Headers
- `@context:` — strategic context for engine and LLM planner
- `@title:` — short display name for the suite
- `@tags: smoke, regression` — run tags for CLI filtering
- `@data: data/file.json` — data-driven testing (JSON/CSV)
- `@schedule: daily at 09:00` — daemon mode schedule
- `@import: Login from lib/auth.hunt` — import STEP blocks
- `@export: Login, Logout` — declare importable blocks

### Hook Blocks
- `[SETUP]` / `[END SETUP]` — runs before browser launch; CALL PYTHON and PRINT only
- `[TEARDOWN]` / `[END TEARDOWN]` — cleanup after mission; runs only if SETUP succeeded

## VERIFY After Every Action

| Action type | What to VERIFY |
|-------------|---------------|
| NAVIGATE | that a key element/heading is present |
| Fill / Type | that the typed value is present |
| Click button that navigates | that a landmark on the new page is present |
| Click button that changes state | that the new state/text is present |
| Select dropdown | that the selected value is present |

## Hunt File Template

```
@context: <strategic context description>
@title: <short suite name>

STEP 1: <description>
    NAVIGATE to 'https://...'
    VERIFY that 'landmark' is present
    Fill 'Field' field with 'value'
    VERIFY that 'value' is present
    Click the 'Submit' button
    VERIFY that 'success indicator' is present

STEP 2: <description>
    ...

DONE.
```
