"""LangGraph workflow definitions for drafting and review."""

from __future__ import annotations

import json

from langgraph.graph import END, START, StateGraph

from core.logging import get_logger
from models.models import WorkflowStage
from pipeline.context import SubmissionPromptContextService
from pipeline.tracing import append_node, create_workflow_trace, set_context_block
from pipeline.types import (
    DraftGenerationInput,
    DraftGenerationResult,
    DraftGenerationState,
    DraftRefinementResult,
    DraftRefinementState,
    DraftReviewInput,
    DraftReviewResult,
    DraftReviewState,
    RejectionNoteState,
)
from schemas.submission import RefineDraftRequest

logger = get_logger(__name__)


class SubmissionWorkflowService:
    """Run the PDF-inspired drafting and review flow via LangGraph."""

    def __init__(self, context_service: SubmissionPromptContextService) -> None:
        self._context_service = context_service
        self._draft_graph = self._build_draft_graph()
        self._review_graph = self._build_review_graph()
        self._refinement_graph = self._build_refinement_graph()
        self._rejection_note_graph = self._build_rejection_note_graph()

    async def generate_draft(self, request: DraftGenerationInput) -> DraftGenerationResult:
        trace = create_workflow_trace(
            "draft_generation",
            inputs={
                "doc_type": request.doc_type,
                "stakeholder": request.stakeholder.value,
                "context_form_data": request.context_form_data,
            },
        )
        state = await self._draft_graph.ainvoke(
            {
                "doc_type": request.doc_type,
                "stakeholder": request.stakeholder,
                "context_form_data": request.context_form_data,
                "workflow_trace": trace,
            }
        )
        self._log_trace(state["workflow_memory"])
        return DraftGenerationResult(
            draft=state["draft"],
            prompt_context=state["prompt_context"],
            workflow_stage=state["workflow_stage"],
            workflow_memory=state["workflow_memory"],
        )

    async def review_draft(self, request: DraftReviewInput) -> DraftReviewResult:
        trace = create_workflow_trace(
            "draft_review",
            inputs={
                "doc_type": request.doc_type,
                "stakeholder": request.stakeholder.value,
                "content_preview": request.content[:500],
            },
        )
        state = await self._review_graph.ainvoke(
            {
                "doc_type": request.doc_type,
                "stakeholder": request.stakeholder,
                "content": request.content,
                "workflow_trace": trace,
            }
        )
        self._log_trace(state["workflow_memory"])
        return DraftReviewResult(
            scorecard=state["scorecard"],
            prompt_context=state["prompt_context"],
            workflow_stage=state["workflow_stage"],
            workflow_memory=state["workflow_memory"],
        )

    async def refine_draft(self, request: RefineDraftRequest) -> DraftRefinementResult:
        trace = create_workflow_trace(
            "draft_refinement",
            inputs={
                "doc_type": request.doc_type,
                "stakeholder": request.stakeholder.value,
                "action": request.action,
                "content_preview": request.content[:500],
                "human_input": request.human_input,
            },
        )
        state = await self._refinement_graph.ainvoke({"request": request, "workflow_trace": trace})
        self._log_trace(state["workflow_memory"])
        return DraftRefinementResult(
            draft=state["refined_draft"],
            prompt_context=state["prompt_context"],
            workflow_stage=state["workflow_stage"],
            workflow_memory=state["workflow_memory"],
        )

    async def generate_rejection_note(
        self,
        scorecard: dict,
        doc_type: str,
        member_name: str,
        founder_name: str,
    ) -> str:
        trace = create_workflow_trace(
            "rejection_note",
            inputs={
                "doc_type": doc_type,
                "scorecard": scorecard,
                "member_name": member_name,
                "founder_name": founder_name,
            },
        )
        state = await self._rejection_note_graph.ainvoke(
            {
                "scorecard": scorecard,
                "doc_type": doc_type,
                "member_name": member_name,
                "founder_name": founder_name,
                "workflow_trace": trace,
            }
        )
        return state["rejection_note"]

    def _build_draft_graph(self):
        graph = StateGraph(DraftGenerationState)
        graph.add_node("load_deterministic_context", self._load_generation_context)
        graph.add_node("context_enriching", self._mark_generation_context_enriched)
        graph.add_node("generate_draft", self._generate_draft_node)
        graph.add_edge(START, "load_deterministic_context")
        graph.add_edge("load_deterministic_context", "context_enriching")
        graph.add_edge("context_enriching", "generate_draft")
        graph.add_edge("generate_draft", END)
        return graph.compile()

    def _build_review_graph(self):
        graph = StateGraph(DraftReviewState)
        graph.add_node("load_deterministic_context", self._load_review_context)
        graph.add_node("context_enriching", self._mark_review_context_enriched)
        graph.add_node("score_submission", self._score_submission)
        graph.add_node("prepare_human_review_packet", self._prepare_human_review_packet)
        graph.add_edge(START, "load_deterministic_context")
        graph.add_edge("load_deterministic_context", "context_enriching")
        graph.add_edge("context_enriching", "score_submission")
        graph.add_edge("score_submission", "prepare_human_review_packet")
        graph.add_edge("prepare_human_review_packet", END)
        return graph.compile()

    def _build_refinement_graph(self):
        graph = StateGraph(DraftRefinementState)
        graph.add_node("load_deterministic_context", self._load_refinement_context)
        graph.add_node("context_enriching", self._mark_refinement_context_enriched)
        graph.add_node("prepare_regeneration", self._prepare_regeneration_prompt)
        graph.add_node("regenerate_draft", self._regenerate_draft)
        graph.add_edge(START, "load_deterministic_context")
        graph.add_edge("load_deterministic_context", "context_enriching")
        graph.add_edge("context_enriching", "prepare_regeneration")
        graph.add_edge("prepare_regeneration", "regenerate_draft")
        graph.add_edge("regenerate_draft", END)
        return graph.compile()

    def _build_rejection_note_graph(self):
        graph = StateGraph(RejectionNoteState)
        graph.add_node("load_ai_service", self._load_rejection_note_ai_service)
        graph.add_node("generate_note", self._generate_rejection_note_node)
        graph.add_edge(START, "load_ai_service")
        graph.add_edge("load_ai_service", "generate_note")
        graph.add_edge("generate_note", END)
        return graph.compile()

    async def _load_generation_context(
        self, state: DraftGenerationState
    ) -> DraftGenerationState:
        trace = state["workflow_trace"]
        append_node(trace, "load_deterministic_context", graph="draft_generation")
        context = await self._context_service.build_generation_context(
            state["doc_type"],
            state["stakeholder"],
            trace=trace,
        )
        ai_service = await self._context_service.build_ai_service(state["stakeholder"], trace=trace)
        set_context_block(trace, "graph_prompt_context", context.prompt_context)
        return {
            "ai_service": ai_service,
            "deterministic_context": context.deterministic_context,
            "enrichment_context": context.enrichment_context,
            "prompt_context": context.prompt_context,
            "workflow_trace": trace,
            "workflow_stage": WorkflowStage.DETERMINISTIC_CONTEXT_READY,
            "workflow_memory": {
                "deterministic_context": context.deterministic_context,
                "trace": trace,
                "events": [
                    {
                        "stage": WorkflowStage.DETERMINISTIC_CONTEXT_READY.value,
                        "label": "Deterministic context assembled",
                    }
                ],
            },
        }

    async def _mark_generation_context_enriched(
        self, state: DraftGenerationState
    ) -> DraftGenerationState:
        append_node(state["workflow_trace"], "context_enriching", graph="draft_generation")
        memory = dict(state["workflow_memory"])
        events = list(memory.get("events") or [])
        events.append(
            {
                "stage": WorkflowStage.CONTEXT_ENRICHED.value,
                "label": "Context enrichment assembled",
                "has_examples": bool(state.get("enrichment_context")),
            }
        )
        memory["events"] = events
        memory["enrichment_context"] = state.get("enrichment_context") or ""
        return {
            "workflow_stage": WorkflowStage.CONTEXT_ENRICHED,
            "workflow_memory": memory,
        }

    async def _generate_draft_node(
        self, state: DraftGenerationState
    ) -> DraftGenerationState:
        append_node(state["workflow_trace"], "generate_draft", graph="draft_generation")
        draft = await state["ai_service"].generate_draft(
            doc_type=state["doc_type"],
            stakeholder=state["stakeholder"],
            context=state["context_form_data"],
            guidance=state["prompt_context"],
        )
        memory = dict(state["workflow_memory"])
        events = list(memory.get("events") or [])
        events.append(
            {
                "stage": WorkflowStage.HUMAN_DRAFT_READY.value,
                "label": "Draft generated for human editor",
            }
        )
        memory["events"] = events
        return {
            "draft": draft,
            "workflow_stage": WorkflowStage.HUMAN_DRAFT_READY,
            "workflow_memory": memory,
        }

    async def _load_review_context(self, state: DraftReviewState) -> DraftReviewState:
        trace = state["workflow_trace"]
        append_node(trace, "load_deterministic_context", graph="draft_review")
        context = await self._context_service.build_review_context(
            state["doc_type"],
            state["stakeholder"],
            trace=trace,
        )
        ai_service = await self._context_service.build_ai_service(state["stakeholder"], trace=trace)
        set_context_block(trace, "graph_prompt_context", context.prompt_context)
        return {
            "ai_service": ai_service,
            "deterministic_context": context.deterministic_context,
            "enrichment_context": context.enrichment_context,
            "review_context": context.review_context,
            "prompt_context": context.prompt_context,
            "workflow_trace": trace,
            "workflow_stage": WorkflowStage.DETERMINISTIC_CONTEXT_READY,
            "workflow_memory": {
                "deterministic_context": context.deterministic_context,
                "trace": trace,
                "events": [
                    {
                        "stage": WorkflowStage.DETERMINISTIC_CONTEXT_READY.value,
                        "label": "Deterministic review context assembled",
                    }
                ],
            },
        }

    async def _mark_review_context_enriched(
        self, state: DraftReviewState
    ) -> DraftReviewState:
        append_node(state["workflow_trace"], "context_enriching", graph="draft_review")
        memory = dict(state["workflow_memory"])
        events = list(memory.get("events") or [])
        events.append(
            {
                "stage": WorkflowStage.CONTEXT_ENRICHED.value,
                "label": "Review context enriched",
                "has_examples": bool(state.get("enrichment_context")),
                "has_review_guidance": bool(state.get("review_context")),
            }
        )
        memory["events"] = events
        memory["enrichment_context"] = state.get("enrichment_context") or ""
        memory["review_context"] = state.get("review_context") or ""
        return {
            "workflow_stage": WorkflowStage.CONTEXT_ENRICHED,
            "workflow_memory": memory,
        }

    async def _score_submission(self, state: DraftReviewState) -> DraftReviewState:
        append_node(state["workflow_trace"], "score_submission", graph="draft_review")
        scorecard = await state["ai_service"].review_document(
            content=state["content"],
            doc_type=state["doc_type"],
            stakeholder=state["stakeholder"],
            guidance=state["prompt_context"],
        )
        memory = dict(state["workflow_memory"])
        events = list(memory.get("events") or [])
        events.append(
            {
                "stage": WorkflowStage.AI_REVIEW_READY.value,
                "label": "AI scoring and suggestions created",
                "score": scorecard.score,
            }
        )
        memory["events"] = events
        return {
            "scorecard": scorecard,
            "workflow_stage": WorkflowStage.AI_REVIEW_READY,
            "workflow_memory": memory,
        }

    async def _prepare_human_review_packet(
        self, state: DraftReviewState
    ) -> DraftReviewState:
        append_node(state["workflow_trace"], "prepare_human_review_packet", graph="draft_review")
        memory = dict(state["workflow_memory"])
        memory["score"] = state["scorecard"].score
        memory["suggestions"] = [item.model_dump() for item in state["scorecard"].suggestions]
        memory["rewrite"] = state["scorecard"].rewrite
        events = list(memory.get("events") or [])
        events.append(
            {
                "stage": WorkflowStage.AWAITING_HUMAN_INPUT.value,
                "label": "Awaiting human modification or founder submission",
            }
        )
        memory["events"] = events
        return {
            "workflow_stage": WorkflowStage.AWAITING_HUMAN_INPUT,
            "workflow_memory": memory,
        }

    async def _load_refinement_context(
        self, state: DraftRefinementState
    ) -> DraftRefinementState:
        request = state["request"]
        trace = state["workflow_trace"]
        append_node(trace, "load_deterministic_context", graph="draft_refinement")
        context = await self._context_service.build_generation_context(
            request.doc_type,
            request.stakeholder,
            trace=trace,
        )
        ai_service = await self._context_service.build_ai_service(request.stakeholder, trace=trace)
        set_context_block(trace, "graph_prompt_context", context.prompt_context)
        return {
            "ai_service": ai_service,
            "deterministic_context": context.deterministic_context,
            "enrichment_context": context.enrichment_context,
            "prompt_context": context.prompt_context,
            "workflow_trace": trace,
            "workflow_stage": WorkflowStage.DETERMINISTIC_CONTEXT_READY,
            "workflow_memory": {
                "deterministic_context": context.deterministic_context,
                "trace": trace,
                "events": [
                    {
                        "stage": WorkflowStage.DETERMINISTIC_CONTEXT_READY.value,
                        "label": "Improvement context assembled",
                    }
                ],
            },
        }

    async def _mark_refinement_context_enriched(
        self, state: DraftRefinementState
    ) -> DraftRefinementState:
        append_node(state["workflow_trace"], "context_enriching", graph="draft_refinement")
        memory = dict(state["workflow_memory"])
        events = list(memory.get("events") or [])
        events.append(
            {
                "stage": WorkflowStage.CONTEXT_ENRICHED.value,
                "label": "Improvement context enriched",
                "has_examples": bool(state.get("enrichment_context")),
            }
        )
        memory["events"] = events
        memory["enrichment_context"] = state.get("enrichment_context") or ""
        return {
            "workflow_stage": WorkflowStage.CONTEXT_ENRICHED,
            "workflow_memory": memory,
        }

    async def _prepare_regeneration_prompt(
        self, state: DraftRefinementState
    ) -> DraftRefinementState:
        request = state["request"]
        append_node(state["workflow_trace"], "prepare_regeneration", graph="draft_refinement")
        regenerated_prompt = (
            "HUMAN IMPROVEMENT INSTRUCTION\n"
            f"- Action: {request.action}\n"
            f"- Existing content length: {len(request.content.strip())} characters\n"
            "Apply the requested improvement while preserving factual accuracy."
        )
        if request.human_input:
            regenerated_prompt = f"{regenerated_prompt}\n- Human note: {request.human_input}"
        if request.suggestions:
            suggestion_lines = "\n".join(
                f"- Replace '{item.original}' with '{item.replacement}' because {item.reason}"
                for item in request.suggestions
            )
            regenerated_prompt = f"{regenerated_prompt}\n- Suggestions to use:\n{suggestion_lines}"
        memory = dict(state["workflow_memory"])
        set_context_block(state["workflow_trace"], "regenerated_prompt", regenerated_prompt)
        events = list(memory.get("events") or [])
        events.append(
            {
                "stage": WorkflowStage.AWAITING_HUMAN_INPUT.value,
                "label": "Human improvement input captured",
                "action": request.action,
            }
        )
        memory["events"] = events
        memory["human_input"] = request.human_input
        return {
            "regenerated_prompt": regenerated_prompt,
            "workflow_stage": WorkflowStage.AWAITING_HUMAN_INPUT,
            "workflow_memory": memory,
        }

    async def _regenerate_draft(self, state: DraftRefinementState) -> DraftRefinementState:
        append_node(state["workflow_trace"], "regenerate_draft", graph="draft_refinement")
        request = RefineDraftRequest(
            content=state["request"].content,
            action=state["request"].action,
            doc_type=state["request"].doc_type,
            stakeholder=state["request"].stakeholder,
        )
        guidance = "\n\n".join(
            block for block in (state["prompt_context"], state["regenerated_prompt"]) if block
        )
        refined_draft = await state["ai_service"].refine_draft(request, guidance)
        memory = dict(state["workflow_memory"])
        events = list(memory.get("events") or [])
        events.append(
            {
                "stage": WorkflowStage.IMPROVEMENT_READY.value,
                "label": "Improved draft regenerated",
                "action": request.action,
            }
        )
        memory["events"] = events
        return {
            "refined_draft": refined_draft,
            "workflow_stage": WorkflowStage.IMPROVEMENT_READY,
            "workflow_memory": memory,
        }

    async def _load_rejection_note_ai_service(
        self, state: RejectionNoteState
    ) -> RejectionNoteState:
        trace = state["workflow_trace"]
        append_node(trace, "load_ai_service", graph="rejection_note")
        return {
            "ai_service": await self._context_service.build_ai_service(trace=trace),
            "workflow_trace": trace,
        }

    async def _generate_rejection_note_node(
        self, state: RejectionNoteState
    ) -> RejectionNoteState:
        append_node(state["workflow_trace"], "generate_note", graph="rejection_note")
        rejection_note = await state["ai_service"].generate_rejection_note(
            state["scorecard"],
            state["doc_type"],
            state["member_name"],
            state["founder_name"],
        )
        return {"rejection_note": rejection_note}

    def _log_trace(self, workflow_memory: dict[str, object]) -> None:
        trace = workflow_memory.get("trace")
        if not isinstance(trace, dict):
            return
        summary = {
            "trace_id": trace.get("trace_id"),
            "graph_name": trace.get("graph_name"),
            "nodes": [item.get("node") for item in trace.get("nodes_executed", [])],
            "db_queries": len(trace.get("db_queries", [])),
            "few_shot_examples": [item.get("title") for item in trace.get("few_shot_examples", [])],
            "ai_calls": [item.get("operation") for item in trace.get("ai_calls", [])],
        }
        logger.info("Workflow trace | %s", json.dumps(summary, ensure_ascii=True))
