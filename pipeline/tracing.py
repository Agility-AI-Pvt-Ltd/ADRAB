"""Workflow trace helpers for LangGraph runs."""

from __future__ import annotations

from typing import Any
from uuid import uuid4


def create_workflow_trace(graph_name: str, *, inputs: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "trace_id": str(uuid4()),
        "graph_name": graph_name,
        "inputs": inputs or {},
        "nodes_executed": [],
        "db_queries": [],
        "context_blocks": {},
        "few_shot_examples": [],
        "ai_calls": [],
    }


def append_node(trace: dict[str, Any], node_name: str, **details: Any) -> None:
    trace.setdefault("nodes_executed", []).append(
        {
            "node": node_name,
            "details": details,
        }
    )


def append_db_query(trace: dict[str, Any], *, service: str, query: str, filters: dict[str, Any] | None = None, result: dict[str, Any] | None = None) -> None:
    trace.setdefault("db_queries", []).append(
        {
            "service": service,
            "query": query,
            "filters": filters or {},
            "result": result or {},
        }
    )


def set_context_block(trace: dict[str, Any], name: str, content: str, *, metadata: dict[str, Any] | None = None) -> None:
    trace.setdefault("context_blocks", {})[name] = {
        "content": content,
        "metadata": metadata or {},
    }


def set_few_shot_examples(trace: dict[str, Any], examples: list[dict[str, Any]]) -> None:
    trace["few_shot_examples"] = examples


def append_ai_call(
    trace: dict[str, Any],
    *,
    operation: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
) -> None:
    trace.setdefault("ai_calls", []).append(
        {
            "operation": operation,
            "model": model,
            "system_prompt": system_prompt,
            "user_prompt": user_prompt,
        }
    )
    
    import os
    from datetime import datetime, timezone
    import logging
    try:
        os.makedirs("logs/ai_prompts", exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        trace_id = trace.get("trace_id", "unknown")[:8]
        
        filename = f"logs/ai_prompts/prompt_{timestamp}_{operation}_{trace_id}.txt"
        with open(filename, "w", encoding="utf-8") as f:
            f.write(f"TIME: {datetime.now(timezone.utc).isoformat()}\n")
            f.write(f"OPERATION: {operation} | MODEL: {model}\n")
            f.write(f"{'-'*80}\nSYSTEM PROMPT:\n{system_prompt}\n")
            f.write(f"{'-'*80}\nUSER PROMPT:\n{user_prompt}\n")
            f.write(f"{'='*80}\n")
    except Exception as e:
        logging.getLogger(__name__).warning("Failed to write AI trace to log file", exc_info=True)
