from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..schemas import (
    AIConfigRequest,
    AIConfigResponse,
    AIInterpretRequest,
    AIInterpretResponse,
    AITestConnectionResponse,
    ExecutiveChatContextResponse,
    ExecutiveChatRequest,
    ExecutiveChatResponse,
)
from .ai_service import ai_service

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/config", response_model=AIConfigResponse)
def get_ai_config():
    return ai_service.get_config()


@router.post("/config", response_model=AIConfigResponse)
def save_ai_config(request: AIConfigRequest):
    return ai_service.save_config(request)


@router.post("/test_connection", response_model=AITestConnectionResponse)
def test_ai_connection():
    return ai_service.test_connection()


@router.post("/interpret", response_model=AIInterpretResponse)
def interpret_ai(request: AIInterpretRequest):
    try:
        return ai_service.interpret(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/executive_chat", response_model=ExecutiveChatResponse)
def executive_chat(request: ExecutiveChatRequest):
    try:
        return ai_service.executive_chat(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/executive_chat_context", response_model=ExecutiveChatContextResponse)
def executive_chat_context(
    include_planning_context: bool = Query(default=True),
):
    return ai_service.executive_chat_context(
        include_planning_context=include_planning_context,
    )
