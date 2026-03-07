from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..schemas import AIInterpretRequest, AIInterpretResponse
from .ai_service import ai_service

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/interpret", response_model=AIInterpretResponse)
def interpret_ai(request: AIInterpretRequest):
    try:
        return ai_service.interpret(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
