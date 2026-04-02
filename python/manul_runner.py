#!/usr/bin/env python3
"""
Manul MCP Python Runner
========================
Persistent subprocess that holds an open ManulSession (browser stays alive
across tool calls).  Speaks a JSON-line protocol over stdin/stdout so the
Node.js MCP bridge can send commands and receive results without any HTTP server.

Protocol
--------
Each message is a single UTF-8 JSON line.

Incoming (Node → Python):
  {"id": "1", "method": "run_steps",    "params": {"steps": [...], "context": "...", "title": "...", "headless": false}}
  {"id": "2", "method": "get_state",    "params": {}}
  {"id": "3", "method": "propose_hunt", "params": {"context": "...", "title": "..."}}
  {"id": "4", "method": "save_hunt",    "params": {"path": "...", "content": "..."}}
  {"id": "5", "method": "reset",        "params": {"context": "...", "title": "..."}}
  {"id": "6", "method": "shutdown",     "params": {}}

Outgoing (Python → Node), first message:
  {"type": "ready", "version": "1.0"}

Outgoing for every command:
  {"id": "1", "ok": true,  "data": {...}}
  {"id": "1", "ok": false, "error": "..."}
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import textwrap
from typing import Any


# ── import guard ──────────────────────────────────────────────────────────────

def _emit_raw(obj: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


try:
    from manul_engine import ManulSession  # type: ignore[import]
except ImportError as _e:
    _emit_raw({
        "type": "error",
        "error": (
            f"manul-engine not installed: {_e}. "
            "Run: pip install manul-engine"
        ),
    })
    sys.exit(1)


# ── helpers ────────────────────────────────────────────────────────────────────

def _log(msg: str) -> None:
    sys.stderr.write(f"[RUNNER] {msg}\n")
    sys.stderr.flush()


def _emit(obj: dict[str, Any]) -> None:
    _emit_raw(obj)


def _build_hunt(context: str, title: str, steps: list[str]) -> str:
    """Assemble a clean .hunt file from successfully executed steps."""
    if not steps:
        return ""

    def _indent(s: str) -> str:
        # steps may already carry indentation; strip and re-indent uniformly
        return "    " + s.strip()

    body = "\n".join(_indent(s) for s in steps)
    return textwrap.dedent(f"""\
        @context: {context}
        @title: {title}

        STEP 1: Recorded actions
        {body}

        DONE.
    """).rstrip()


# ── runner class ──────────────────────────────────────────────────────────────

class ManulRunner:
    def __init__(self) -> None:
        self._session: ManulSession | None = None
        self._headless: bool = False
        self._context: str = "Manul automation"
        self._title: str = "Recorded Session"
        self._executed_steps: list[str] = []

    # ── session lifecycle ──────────────────────────────────────────────────────

    async def _ensure_session(self, headless: bool) -> None:
        if self._session is not None:
            return
        self._headless = headless
        _log(f"Opening browser (headless={headless}) …")
        self._session = ManulSession(headless=headless, disable_cache=True)
        await self._session.__aenter__()
        _log("Browser ready.")

    async def _close_session(self) -> None:
        if self._session is not None:
            try:
                await self._session.__aexit__(None, None, None)
            except Exception as exc:  # noqa: BLE001
                _log(f"Session close error (ignored): {exc}")
            finally:
                self._session = None

    # ── method handlers ────────────────────────────────────────────────────────

    async def _handle_run_steps(self, params: dict[str, Any]) -> dict[str, Any]:
        steps: list[str] = params.get("steps") or []
        context: str = params.get("context") or self._context
        title: str = params.get("title") or self._title
        headless: bool = bool(params.get("headless", self._headless))

        if not steps:
            return {"ok": False, "error": "No steps provided."}

        await self._ensure_session(headless)
        self._context = context
        self._title = title

        results: list[dict[str, Any]] = []
        newly_succeeded: list[str] = []

        for step in steps:
            _log(f"Step: {step}")
            try:
                result = await self._session.run_steps(step)  # type: ignore[union-attr]
                status = getattr(result, "status", "pass")
                if status == "pass":
                    newly_succeeded.append(step)
                    results.append({"step": step, "status": "pass"})
                else:
                    # collect error info if available
                    err = getattr(result, "last_error", None) or str(result)
                    results.append({"step": step, "status": status, "error": err})
                    _log(f"Step failed ({status}): {step}")
                    break  # stop on first failure — like the real engine does
            except Exception as exc:  # noqa: BLE001
                results.append({"step": step, "status": "error", "error": str(exc)})
                _log(f"Step exception: {exc}")
                break

        self._executed_steps.extend(newly_succeeded)
        hunt_proposal = _build_hunt(self._context, self._title, self._executed_steps)

        pass_count = sum(1 for r in results if r["status"] == "pass")
        return {
            "ok": True,
            "data": {
                "results": results,
                "pass_count": pass_count,
                "total": len(steps),
                "executed_total": len(self._executed_steps),
                "hunt_proposal": hunt_proposal,
            },
        }

    async def _handle_get_state(self, _params: dict[str, Any]) -> dict[str, Any]:
        try:
            import importlib.metadata as _meta
            version = _meta.version("manul-engine")
        except Exception:  # noqa: BLE001
            version = "unknown"

        return {
            "ok": True,
            "data": {
                "runner": "python",
                "engine_version": version,
                "browser_open": self._session is not None,
                "headless": self._headless,
                "context": self._context,
                "title": self._title,
                "executed_steps": len(self._executed_steps),
                "status": "ready" if self._session is not None else "idle",
            },
        }

    async def _handle_propose_hunt(self, params: dict[str, Any]) -> dict[str, Any]:
        context = params.get("context") or self._context
        title = params.get("title") or self._title
        hunt = _build_hunt(context, title, self._executed_steps)
        return {"ok": True, "data": {"hunt": hunt}}

    async def _handle_save_hunt(self, params: dict[str, Any]) -> dict[str, Any]:
        path: str = params.get("path", "").strip()
        content: str = params.get("content", "")
        if not path:
            return {"ok": False, "error": "path is required."}
        if not content:
            return {"ok": False, "error": "content is required."}

        abs_path = os.path.abspath(path)
        os.makedirs(os.path.dirname(abs_path) or ".", exist_ok=True)
        with open(abs_path, "w", encoding="utf-8") as fh:
            fh.write(content)
        _log(f"Hunt saved → {abs_path}")
        return {"ok": True, "data": {"saved_path": abs_path}}

    async def _handle_reset(self, params: dict[str, Any]) -> dict[str, Any]:
        self._executed_steps.clear()
        self._context = params.get("context") or "Manul automation"
        self._title = params.get("title") or "Recorded Session"
        return {"ok": True, "data": {"status": "reset"}}

    async def _handle_shutdown(self, _params: dict[str, Any]) -> dict[str, Any]:
        await self._close_session()
        return {"ok": True, "data": {"status": "shutdown"}}

    # ── dispatch ───────────────────────────────────────────────────────────────

    _HANDLERS = {
        "run_steps":    "_handle_run_steps",
        "get_state":    "_handle_get_state",
        "propose_hunt": "_handle_propose_hunt",
        "save_hunt":    "_handle_save_hunt",
        "reset":        "_handle_reset",
        "shutdown":     "_handle_shutdown",
    }

    async def _process(self, msg: dict[str, Any]) -> None:
        method: str = msg.get("method", "")
        msg_id = msg.get("id")
        params: dict[str, Any] = msg.get("params") or {}

        handler_name = self._HANDLERS.get(method)
        if handler_name is None:
            _emit({"id": msg_id, "ok": False, "error": f"Unknown method: {method}"})
            return

        try:
            result = await getattr(self, handler_name)(params)
        except Exception as exc:  # noqa: BLE001
            _log(f"Handler error ({method}): {exc}")
            result = {"ok": False, "error": str(exc)}

        _emit({"id": msg_id, **result})

    # ── main loop ──────────────────────────────────────────────────────────────

    async def run(self) -> None:
        _log("Manul Python runner started.")
        _emit({"type": "ready", "version": "1.0"})

        loop = asyncio.get_running_loop()

        while True:
            try:
                line: str = await loop.run_in_executor(None, sys.stdin.readline)
            except Exception as exc:  # noqa: BLE001
                _log(f"stdin read error: {exc}")
                break

            if not line:
                _log("stdin closed, exiting.")
                break

            line = line.strip()
            if not line:
                continue

            try:
                msg = json.loads(line)
            except json.JSONDecodeError as exc:
                _emit({"type": "error", "error": f"JSON parse error: {exc}"})
                continue

            await self._process(msg)

            if msg.get("method") == "shutdown":
                break

        await self._close_session()
        _log("Runner stopped.")


# ── entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    asyncio.run(ManulRunner().run())
