# ManulEngine MCP Server — AI Agent Contract

> **Machine-readable contract for AI agents consuming ManulEngine via the MCP tool interface.**
> This document defines every available MCP tool, its parameters, return shapes, error handling,
> recommended usage patterns, and the complete DSL command reference needed to construct valid inputs.
> Consumed by AI agents (GitHub Copilot, Claude, GPT, custom agents) that interact with ManulEngine
> through the Model Context Protocol.

```json
{
  "version": "0.0.9.29",
  "serverVersion": "0.0.8",
  "serverName": "manul-mcp-server",
  "protocol": "Model Context Protocol (MCP) over stdio",
  "generatedFrom": "src/mcp/stdioServer.ts, src/mcp/server.ts, src/config/contract.ts",

  "overview": {
    "description": "ManulEngine is a deterministic, DSL-first Web & Desktop Automation Runtime backed by Playwright. This MCP server exposes ManulEngine capabilities as tools that AI agents can call to automate browsers, run E2E tests, execute RPA workflows, and build .hunt automation scripts. The browser session is persistent — it opens on first use and stays alive across tool calls until shutdown.",
    "sessionModel": "Persistent. The Python runner manages a single browser session. First call to any execution tool (manul_run_step, manul_run_goal, manul_run_hunt, manul_run_hunt_file) launches the browser. Subsequent calls reuse the same session. The session keeps the browser alive even on step failure for inspect/retry.",
    "engineArchitecture": "Hunt DSL → Parser → Execution Engine → DOMScorer heuristics → Playwright actions. Element resolution is deterministic (TreeWalker + 0.0–1.0 float scoring). Optional LLM fallback only when explicitly enabled.",
    "taskSupportPolicy": "forbidden — all tools are synchronous request/response. Task mode is not supported."
  },

  "tools": [
    {
      "name": "manul_run_step",
      "description": "Run a single Manul DSL step against the live browser session. Opens the browser the first time it is called. Accepts raw DSL or natural-language input.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "step": { "type": "string", "description": "A single Manul DSL step or a natural-language action." }
        },
        "required": ["step"],
        "additionalProperties": false
      },
      "returns": {
        "normalization": "Array of {input, normalized, appliedFixes} — shows how the input was transformed into canonical DSL.",
        "issues": "Array of validation diagnostics (severity: error|warning).",
        "response": "API result from the Python runner with ok, status, data fields.",
        "hunt_proposal": "Optional accumulated .hunt file content from the session."
      },
      "usage": [
        "Use for ONE step at a time. Do not send multi-line batches.",
        "Accepts natural language: 'click the login button' → normalized to \"Click the 'login' button\".",
        "Accepts raw DSL: \"NAVIGATE to https://example.com\".",
        "After NAVIGATE, consider calling manul_scan_page to discover page elements before the next step."
      ],
      "errorBehavior": "Engine/step failures are returned in the normal tool result with response.ok=false and status/data describing the failure; only tool-level problems such as validation or handler exceptions return isError=true. Step failures do NOT close the browser."
    },
    {
      "name": "manul_run_goal",
      "description": "Convert a natural-language goal into Manul DSL steps, execute them all in the live browser session, and return a ready-to-save .hunt file proposal.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "goal": { "type": "string", "description": "A natural-language automation goal." },
          "title": { "type": "string", "description": "Optional short title for the generated .hunt file." },
          "context": { "type": "string", "description": "Optional strategic context to embed as @context: in the .hunt file." }
        },
        "required": ["goal"],
        "additionalProperties": false
      },
      "returns": {
        "goal": "Original goal text.",
        "normalization": "Per-step normalization results.",
        "issues": "Validation diagnostics for all generated steps.",
        "response": "Execution results with per-step pass/fail status.",
        "hunt_proposal": "Complete .hunt file content ready to save."
      },
      "usage": [
        "Best for multi-action flows described in natural language.",
        "Automatically resets the hunt proposal accumulator before execution.",
        "After completion, call manul_save_hunt to persist the generated .hunt file.",
        "Goal text is split on newlines, periods, and 'then'; avoid relying on 'and then' phrasing in goals."
      ]
    },
    {
      "name": "manul_run_hunt",
      "description": "Validate and run a full .hunt document (DSL text) in the live browser session.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "dsl": { "type": "string", "description": "Full .hunt file content." }
        },
        "required": ["dsl"],
        "additionalProperties": false
      },
      "returns": {
        "stepCount": "Number of executable steps extracted.",
        "normalization": "Per-step normalization results.",
        "issues": "Validation diagnostics.",
        "response": "Execution results.",
        "hunt_proposal": "Optional updated hunt proposal."
      },
      "usage": [
        "Use when you have a complete .hunt file as a string.",
        "The document is validated before execution — errors are reported in issues.",
        "Metadata lines (@context:, @title:, etc.), hook blocks, and comments are stripped; only action lines execute."
      ]
    },
    {
      "name": "manul_run_hunt_file",
      "description": "Read a .hunt file from disk, validate it, and run it in the live browser session.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "filePath": { "type": "string", "description": "Absolute path to a .hunt file." }
        },
        "required": ["filePath"],
        "additionalProperties": false
      },
      "returns": {
        "filePath": "Resolved file path.",
        "stepCount": "Number of executable steps.",
        "normalization": "Per-step normalization results.",
        "issues": "Validation diagnostics.",
        "response": "Execution results.",
        "hunt_proposal": "Optional updated hunt proposal."
      },
      "usage": [
        "Use to replay an existing .hunt file from the workspace.",
        "File must have .hunt extension.",
        "Path is validated to be inside the workspace root (security jail)."
      ],
      "security": "Path traversal outside workspace root is rejected."
    },
    {
      "name": "manul_validate_hunt",
      "description": "Validate a full .hunt document and return all diagnostics without running it.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "dsl": { "type": "string", "description": "Full .hunt file content to validate." }
        },
        "required": ["dsl"],
        "additionalProperties": false
      },
      "returns": {
        "issues": "Array of {line, column, endColumn, message, severity, code} diagnostics.",
        "ok": "Boolean — true if no errors (warnings are acceptable)."
      },
      "usage": [
        "Use to check .hunt syntax without executing.",
        "Every recognized DSL command, metadata directive, hook block, and comment format is checked.",
        "Unrecognized lines produce severity='error'."
      ]
    },
    {
      "name": "manul_normalize_step",
      "description": "Normalize one step or natural-language action into canonical DSL and return validation feedback without running it.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "step": { "type": "string", "description": "A single step to normalize." }
        },
        "required": ["step"],
        "additionalProperties": false
      },
      "returns": {
        "normalization": "{input, normalized, appliedFixes}",
        "issues": "Validation diagnostics for the normalized step."
      },
      "usage": [
        "Dry-run normalization: verify how natural language maps to DSL before execution.",
        "Useful for debugging why a step might fail validation."
      ]
    },
    {
      "name": "manul_get_state",
      "description": "Return the current runner state: engine version, whether the browser is open, how many steps have been executed, and the accumulated hunt proposal.",
      "inputSchema": {
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "returns": {
        "response": "API result containing sessionId, status, running flag, lastError, lastRunAt, and other engine state fields."
      },
      "usage": [
        "Check if the browser is currently running.",
        "Retrieve the accumulated hunt proposal from the current session.",
        "Diagnose errors from previous steps."
      ]
    },
    {
      "name": "manul_save_hunt",
      "description": "Save a .hunt file to disk. Typically called after manul_run_goal returns a hunt_proposal.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "path": { "type": "string", "description": "File path to write (e.g. 'tests/amazon_search.hunt'). Relative paths resolve from the workspace root." },
          "content": { "type": "string", "description": "Full .hunt file content to write." }
        },
        "required": ["path", "content"],
        "additionalProperties": false
      },
      "returns": {
        "response": "Confirmation of file creation."
      },
      "usage": [
        "Always save to tests/ directory by convention.",
        "File must have .hunt extension.",
        "Path is validated to be inside the workspace root (security jail).",
        "Create or overwrite the file at the given path."
      ],
      "security": "Path traversal outside workspace root is rejected."
    },
    {
      "name": "manul_scan_page",
      "description": "Scan the currently open browser page and return all interactive elements (inputs, buttons, selects, checkboxes, radios, links).",
      "inputSchema": {
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "returns": {
        "response": "List of discovered interactive elements with their identifiers, types, and attributes."
      },
      "usage": [
        "Call after NAVIGATE to discover exact element identifiers before deciding the next step.",
        "Call after state-changing clicks (e.g. opening a modal, switching tabs) to refresh element knowledge.",
        "Use the returned element names/labels in subsequent DSL steps for reliable targeting.",
        "Does NOT return static text content — use manul_read_page_text for that."
      ]
    },
    {
      "name": "manul_read_page_text",
      "description": "Return all visible text content from the currently open browser page (document.body.innerText).",
      "inputSchema": {
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "returns": {
        "response": "Full visible text content of the page."
      },
      "usage": [
        "Use to read prices, labels, headings, or any static text not in manul_scan_page results.",
        "Use to verify page content before constructing VERIFY steps.",
        "Complements manul_scan_page — scan returns interactive elements, read_page_text returns text."
      ]
    },
    {
      "name": "manul_preview_goal",
      "description": "Preview how a natural-language goal would be split and normalized into Manul DSL without running it.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "goal": { "type": "string", "description": "A natural-language goal to preview." }
        },
        "required": ["goal"],
        "additionalProperties": false
      },
      "returns": {
        "goal": "Original goal text.",
        "steps": "Array of normalized DSL steps.",
        "appliedFixes": "Array of normalization fixes applied."
      },
      "usage": [
        "Dry-run goal normalization: see the generated DSL before executing.",
        "Useful for verifying goal parsing and step generation."
      ]
    }
  ],

  "dslCommandReference": {
    "version": "0.0.9.29",
    "description": "DSL command set recognized by the ManulEngine parser. Use these commands as input to manul_run_step, manul_run_hunt, and in .hunt file content.",

    "navigation": [
      { "command": "NAVIGATE to 'https://example.com'", "description": "Open URL, wait for DOM settlement." },
      { "command": "OPEN APP", "description": "Attach to an Electron/desktop app window (requires executable_path config)." },
      { "command": "SCROLL DOWN", "description": "Scroll one viewport down." },
      { "command": "SCROLL DOWN inside the 'container'", "description": "Scroll a specific container." }
    ],

    "clicking": [
      { "command": "Click the 'Label' button", "description": "Click a button by label. Element type hint (button, link, element) is optional but recommended." },
      { "command": "Click the 'Label' link", "description": "Click a link by label." },
      { "command": "Click the 'Label' element", "description": "Click any generic element." },
      { "command": "DOUBLE CLICK the 'Label'", "description": "Double-click an element." },
      { "command": "RIGHT CLICK 'Label'", "description": "Right-click to open context menu." },
      { "command": "Check the checkbox for 'Label'", "description": "Check a checkbox." },
      { "command": "Uncheck the checkbox for 'Label'", "description": "Uncheck a checkbox." },
      { "command": "HOVER over the 'Label'", "description": "Hover over an element." },
      { "command": "Drag 'Source' and drop it into 'Destination'", "description": "Drag-and-drop between two elements." }
    ],

    "input": [
      { "command": "Fill 'Target' field with 'Value'", "description": "Type into an input field (clears first). Target first, value last." },
      { "command": "Type 'Value' into the 'Target' field", "description": "Type into an input field. Value first, target last." },
      { "command": "Select 'Option' from the 'Target' dropdown", "description": "Select from a native or custom dropdown." },
      { "command": "PRESS ENTER", "description": "Press Enter on the focused element." },
      { "command": "PRESS Escape", "description": "Press any key globally." },
      { "command": "PRESS Control+A", "description": "Press a key combination." },
      { "command": "PRESS Key on 'Target'", "description": "Press a key on a specific element." },
      { "command": "UPLOAD 'file_path' to 'Target'", "description": "Upload a file to a file-input element." }
    ],

    "assertions": [
      { "command": "VERIFY that 'text' is present", "description": "Assert text or element is visible on page. Most common verification." },
      { "command": "VERIFY that 'text' is NOT present", "description": "Assert text or element is absent." },
      { "command": "VERIFY that 'Element' is ENABLED", "description": "Assert element is enabled." },
      { "command": "VERIFY that 'Element' is DISABLED", "description": "Assert element is disabled." },
      { "command": "VERIFY that 'Checkbox' is checked", "description": "Assert checkbox is checked." },
      { "command": "VERIFY that 'Checkbox' is NOT checked", "description": "Assert checkbox is unchecked." },
      { "command": "VERIFY SOFTLY that 'text' is present", "description": "Non-fatal assertion. Continues on failure, collects as soft error." },
      { "command": "Verify 'Element' field has value 'Expected'", "description": "Strict input value check via input_value()." },
      { "command": "Verify 'Element' field has text 'Expected'", "description": "Strict inner text check via inner_text()." },
      { "command": "Verify 'Element' field has placeholder 'Expected'", "description": "Strict placeholder attribute check." },
      { "command": "VERIFY VISUAL 'Element'", "description": "Screenshot comparison against a stored baseline." }
    ],

    "waiting": [
      { "command": "WAIT 2", "description": "Hard sleep for N seconds." },
      { "command": "Wait for 'Element' to be visible", "description": "Wait for element to appear." },
      { "command": "Wait for 'Element' to be hidden", "description": "Wait for element to hide." },
      { "command": "Wait for 'Element' to disappear", "description": "Wait for element to be removed." },
      { "command": "WAIT FOR RESPONSE \"url_pattern\"", "description": "Wait for a matching network response." }
    ],

    "dataAndVariables": [
      { "command": "EXTRACT the 'Element' into {variable}", "description": "Store element text in a runtime variable." },
      { "command": "SET {variable} = value", "description": "Set a variable mid-flight." }
    ],

    "network": [
      { "command": "MOCK GET \"url_pattern\" with 'mock_file'", "description": "Intercept network requests (GET/POST/PUT/PATCH/DELETE)." }
    ],

    "pythonIntegration": [
      { "command": "CALL PYTHON module.function", "description": "Execute a synchronous Python function." },
      { "command": "CALL PYTHON module.function with args: \"arg1\" into {result}", "description": "Call with arguments and capture return value." }
    ],

    "utility": [
      { "command": "SCAN PAGE", "description": "Scan page for interactive elements." },
      { "command": "DEBUG", "description": "Pause execution (alias: PAUSE)." },
      { "command": "DEBUG VARS", "description": "Print all runtime variables." }
    ],

    "structure": [
      { "command": "STEP N: Description", "description": "Declare a hierarchical step block." },
      { "command": "USE BlockName", "description": "Expand an imported STEP block inline." },
      { "command": "DONE.", "description": "Explicitly end the mission." }
    ],

    "conditionalBranching": [
      { "command": "IF button 'Save' exists:", "description": "Block-style conditional. Body indented 4 extra spaces. Conditions: element exists, text present, variable comparison/contains/truthy." },
      { "command": "ELIF text 'Error' is present:", "description": "Alternative branch. Multiple ELIF allowed. Must follow IF or another ELIF." },
      { "command": "ELSE:", "description": "Default branch. Only one ELSE, must be last." }
    ],

    "loops": [
      { "command": "REPEAT 3 TIMES:", "description": "Fixed-count loop. Body indented 4 extra spaces. {i} counter auto-set (1-based). Nesting supported." },
      { "command": "FOR EACH {item} IN {items}:", "description": "Iterate over comma-separated values from a variable. Loop variable and {i} counter set on each iteration. Nesting supported." },
      { "command": "WHILE button 'Next' exists:", "description": "Repeat while condition is true. Same conditions as IF blocks. Safety limit: 100 iterations. {i} counter auto-set. Nesting supported." }
    ],

    "contextualQualifiers": [
      { "command": "NEAR 'Anchor Text'", "description": "Bias by Euclidean distance to anchor element. Append to any action." },
      { "command": "ON HEADER", "description": "Restrict to header/nav area or top 15% viewport. Append to any action." },
      { "command": "ON FOOTER", "description": "Restrict to footer area or bottom 15% viewport. Append to any action." },
      { "command": "INSIDE 'Container' row with 'Text'", "description": "Restrict to a specific table row/container subtree. Append to any action." }
    ],

    "metadataHeaders": [
      { "directive": "@context:", "description": "Strategic context for engine and LLM planner." },
      { "directive": "@title:", "description": "Short display name for the suite." },
      { "directive": "@tags: smoke, regression", "description": "Run tags for CLI filtering." },
      { "directive": "@var: {key} = value", "description": "Static variable declaration." },
      { "directive": "@script: {alias} = scripts.helpers", "description": "Python helper alias." },
      { "directive": "@data: data/file.json", "description": "Data-driven testing (JSON/CSV)." },
      { "directive": "@schedule: daily at 09:00", "description": "Daemon mode schedule." },
      { "directive": "@import: Login from lib/auth.hunt", "description": "Import STEP blocks from another file." },
      { "directive": "@export: Login, Logout", "description": "Declare exportable blocks." }
    ],

    "hookBlocks": [
      { "block": "[SETUP] ... [END SETUP]", "description": "Runs before browser launch. CALL PYTHON and PRINT only. Failure marks mission as broken." },
      { "block": "[TEARDOWN] ... [END TEARDOWN]", "description": "Cleanup after mission. Runs only if SETUP succeeded." },
      { "command": "PRINT \"message with {vars}\"", "description": "Variable-interpolated console output. Valid only inside [SETUP]/[TEARDOWN] blocks." }
    ],

    "comments": {
      "syntax": "# comment",
      "rule": "Lines starting with '#' are ignored."
    },

    "indentation": {
      "rule": "4-space indent for action lines under STEP headers and inside hook blocks. STEP headers, metadata, DONE., and hook markers are flush-left."
    }
  },

  "agentWorkflowGuidelines": {
    "description": "Best practices for AI agents automating browsers through this MCP server.",

    "executionPatterns": {
      "singleStepExploration": {
        "description": "Use manul_run_step iteratively when exploring or adapting to dynamic pages.",
        "pattern": [
          "1. manul_run_step: NAVIGATE to 'url'",
          "2. manul_scan_page: discover page elements",
          "3. manul_run_step: action based on scan results",
          "4. manul_run_step: VERIFY that 'expected' is present",
          "5. Repeat 2-4 as needed"
        ]
      },
      "goalExecution": {
        "description": "Use manul_run_goal for straightforward multi-step flows described in natural language.",
        "pattern": [
          "1. manul_run_goal: describe the full flow",
          "2. Review the hunt_proposal in the response",
          "3. manul_save_hunt: persist the .hunt file"
        ]
      },
      "huntReplay": {
        "description": "Use manul_run_hunt or manul_run_hunt_file to replay existing automation scripts.",
        "pattern": [
          "1. manul_validate_hunt: validate syntax first",
          "2. manul_run_hunt or manul_run_hunt_file: execute",
          "3. Check response for pass/fail status"
        ]
      }
    },

    "verificationRules": {
      "description": "Add VERIFY steps after every action that changes state.",
      "table": [
        { "action": "NAVIGATE", "verify": "that a key element/heading is present" },
        { "action": "Fill / Type", "verify": "that the typed value is present" },
        { "action": "Click (navigates)", "verify": "that a landmark on the new page is present" },
        { "action": "Click (state change)", "verify": "that the new state/text is present" },
        { "action": "Select dropdown", "verify": "that the selected value is present" }
      ]
    },

    "toolSelectionRules": [
      "manul_run_step: one step at a time. Never send multi-line batches.",
      "manul_run_goal: multi-action flows from natural language.",
      "manul_run_hunt: execute a complete .hunt document string.",
      "manul_run_hunt_file: execute a .hunt file from disk.",
      "manul_scan_page: after NAVIGATE and after state-changing clicks to discover element identifiers.",
      "manul_read_page_text: to read prices, labels, headings, or static text not in scan results.",
      "manul_validate_hunt: check .hunt syntax before execution.",
      "manul_normalize_step: dry-run step normalization.",
      "manul_preview_goal: dry-run goal → DSL conversion.",
      "manul_get_state: check browser status and accumulated hunt proposal.",
      "manul_save_hunt: persist .hunt files to tests/ directory."
    ],

    "errorHandling": [
      "If manul-engine is not installed, missing Python, missing Playwright browsers, or missing node — treat as environment/setup failure, not DSL failure.",
      "If a tool fails before the browser opens, check the Python environment first.",
      "On VERIFY failure, call manul_scan_page to find the actual page identifiers and adapt the verify target.",
      "Step failures do NOT close the browser. The session stays alive for retry.",
      "If manul_run_step returns an error for a valid-looking step, try manul_normalize_step first to check the DSL transformation."
    ],

    "huntFileConventions": {
      "fileExtension": ".hunt",
      "defaultDirectory": "tests/",
      "format": [
        "@context: and @title: must be flush-left (no leading spaces)",
        "STEP N: description must be flush-left",
        "DONE. must be flush-left",
        "Action lines inside a STEP are indented with 4 spaces"
      ],
      "template": "@context: <strategic context>\n@title: <short name>\n\nSTEP 1: <description>\n    NAVIGATE to 'https://...'\n    VERIFY that 'landmark' is present\n    Fill 'Field' field with 'value'\n    VERIFY that 'value' is present\n    Click the 'Submit' button\n    VERIFY that 'success' is present\n\nSTEP 2: <description>\n    ...\n\nDONE."
    }
  },

  "responseShapes": {
    "apiSuccess": {
      "ok": true,
      "status": "number (HTTP-like status code)",
      "data": "object — tool-specific payload"
    },
    "apiFailure": {
      "ok": false,
      "status": "number",
      "error": "string — human-readable error message",
      "details": "string | undefined — stack trace or additional info"
    },
    "validationIssue": {
      "line": "number — 1-based line number",
      "column": "number",
      "endColumn": "number",
      "message": "string",
      "severity": "error | warning",
      "code": "string — diagnostic code (e.g. 'invalid-command')"
    },
    "normalizationResult": {
      "input": "string — original input",
      "normalized": "string — canonical DSL after normalization",
      "appliedFixes": "string[] — descriptions of transformations applied"
    },
    "missionStatuses": {
      "pass": "All steps succeeded on first attempt.",
      "fail": "One or more steps failed.",
      "broken": "SETUP hook failed before any browser step.",
      "flaky": "Failed initially but passed on retry.",
      "warning": "All steps passed but VERIFY SOFTLY assertions failed."
    }
  },

  "naturalLanguageNormalization": {
    "description": "The MCP server automatically normalizes natural-language input into canonical DSL before execution.",
    "typoCorrections": {
      "clik": "click",
      "clic": "click",
      "clk": "click",
      "naviagte": "navigate",
      "nagivate": "navigate",
      "verfiy": "verify",
      "verfy": "verify",
      "fll": "fill",
      "selct": "select"
    },
    "naturalLanguagePatterns": [
      { "input": "click the login button", "output": "Click the 'login' button" },
      { "input": "fill username with admin", "output": "Fill 'username' field with 'admin'" },
      { "input": "type secret into password", "output": "Type 'secret' into the 'password' field" },
      { "input": "go to https://example.com", "output": "NAVIGATE to https://example.com" },
      { "input": "verify Welcome is visible", "output": "VERIFY that 'Welcome' is present" },
      { "input": "select Large from size", "output": "Select 'Large' from the 'size' dropdown" },
      { "input": "hover over menu", "output": "HOVER over the 'menu'" },
      { "input": "check Remember me", "output": "Check the checkbox for 'Remember me'" }
    ]
  },

  "securityConstraints": [
    "File operations (manul_save_hunt, manul_run_hunt_file) are jailed to the workspace root directory.",
    "Path traversal (../) outside workspace root is rejected.",
    "Only .hunt file extension is allowed for file operations.",
    "No arbitrary code execution — only ManulEngine DSL commands and registered Python hooks."
  ]
}
```
