from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..schemas import (
    AIConfigRequest,
    AIConfigResponse,
    AIInterpretRequest,
    AIInterpretResponse,
    AITestConnectionResponse,
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
