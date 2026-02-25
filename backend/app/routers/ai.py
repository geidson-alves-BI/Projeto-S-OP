import logging

from fastapi import APIRouter

from ..ai_agent import audit_metrics, generate_operational_insights, suggest_product_improvements
from ..schemas import (
    AIAuditRequest,
    AIAuditResponse,
    AIInsightsRequest,
    AIInsightsResponse,
    AIProductImprovementsRequest,
    AIProductImprovementsResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["AI"])


@router.post("/audit", response_model=AIAuditResponse)
def ai_audit(req: AIAuditRequest):
    logger.info({"event": "ai_audit_requested", "snapshots_count": len(req.snapshots)})
    return audit_metrics(req.snapshots)


@router.post("/insights", response_model=AIInsightsResponse)
def ai_insights(req: AIInsightsRequest):
    logger.info({"event": "ai_insights_requested", "metrics_count": len(req.metrics)})
    return generate_operational_insights(req.metrics)


@router.post("/product-improvements", response_model=AIProductImprovementsResponse)
def ai_product_improvements(req: AIProductImprovementsRequest):
    logger.info(
        {
            "event": "ai_product_improvements_requested",
            "modulos_count": len(req.modulos),
            "indicadores_count": len(req.indicadores_atuais),
            "validacoes_count": len(req.validacoes_atuais),
            "has_objetivo": bool(req.objetivo),
        }
    )
    return suggest_product_improvements(
        req.modulos,
        req.indicadores_atuais,
        req.validacoes_atuais,
        req.objetivo,
    )
