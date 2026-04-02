# Manul MCP Server — Copilot Instructions

## Browser Automation Workflow

When using ManulMcpServer tools (`manul_run_step`, `manul_run_hunt_file`, etc.) to perform browser automation tasks:

1. **Execute all requested actions** using ManulMcpServer tools.
2. **Add VERIFY steps** after every action that changes state (fill, click, navigate) to confirm it succeeded.
3. **After completing the task**, always propose saving a `.hunt` file:
   - Generate clean, properly-formatted DSL (flush-left `@context:`, `@title:`, `STEP N:`, `DONE.`)
   - Ask the user: *"Should I save this as a hunt file so it can be replayed later?"*
   - If yes, save with `manul_save_hunt` to `/home/alexbeatnik/Documents/ManulEngine/tests/<descriptive_name>.hunt`

## Hunt File Format Rules

- `@context:` and `@title:` must be flush-left (no leading spaces)
- `STEP N: description` headers must be flush-left
- `DONE.` must be flush-left
- Action lines inside a STEP are indented with 4 spaces

## DSL Command Reference

### Navigation
- `NAVIGATE to 'https://example.com'` — open URL, wait for DOM
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

### Assertions (VERIFY)
- `VERIFY that 'text' is present` — text or element visible on page ✅ most common
- `VERIFY that 'text' is NOT present`
- `VERIFY that 'Element' is ENABLED` / `is DISABLED`
- `VERIFY that 'Checkbox' is checked` / `is NOT checked`
- `VERIFY SOFTLY that 'text' is present` — non-fatal, continues on failure
- `Verify 'Element' field has value 'Expected'` — strict input value check
- `Verify 'Element' field has text 'Expected'` — strict inner text check

### Waiting
- `WAIT 2` — sleep N seconds
- `Wait for 'Element' to be visible` / `to be hidden` / `to disappear`
- `WAIT FOR RESPONSE "url_pattern"` — wait for network response

### Data & Variables
- `EXTRACT the 'Element' into {variable}` — store element text
- `SET {variable} = value` — set variable inline
- `@var: {key} = value` — file-level variable declaration

### Contextual Qualifiers (disambiguation)
- `Click the 'Edit' button NEAR 'John Doe'` — disambiguate repeated elements
- `Click the 'Logo' link ON HEADER` — restrict to header/nav area
- `Click the 'Terms' link ON FOOTER` — restrict to footer area
- `Click the 'Delete' button INSIDE 'Actions' row with 'John'` — restrict to a table row

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
