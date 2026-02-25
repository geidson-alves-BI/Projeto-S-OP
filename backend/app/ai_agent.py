import logging
from typing import Dict, List, Any

from .schemas import (
    AISnapshotMetric,
    AIAuditIssue,
    AIAuditResponse,
    AIInsightItem,
    AIInsightsResponse,
    AIProductImprovementsResponse,
)

logger = logging.getLogger(__name__)


def call_openai_ai_agent(prompt: str, context: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """Stub isolado para futura integracao com a OpenAI API."""
    payload = {"event": "openai_agent_stub_called", "prompt_size": len(prompt), "has_context": bool(context)}
    logger.info(payload)
    return {
        "status": "not_configured",
        "message": "OpenAI integration not configured yet.",
    }


def audit_metrics(snapshots: List[AISnapshotMetric]) -> AIAuditResponse:
    bugs_provaveis: List[AIAuditIssue] = []
    inconsistencias: List[AIAuditIssue] = []
    validacoes_ausentes: List[AIAuditIssue] = []

    required_fields = ("tc", "pp", "es", "sla", "cobertura", "tr")

    for item in snapshots:
        sku = item.sku

        for field in required_fields:
            if getattr(item, field) is None:
                validacoes_ausentes.append(
                    AIAuditIssue(
                        code="MISSING_FIELD_VALIDATION",
                        severity="p2",
                        message=f"Campo '{field}' sem validacao explicita no snapshot.",
                        sku=sku,
                        field=field,
                    )
                )

        if item.tc is not None and item.tc < 0:
            bugs_provaveis.append(
                AIAuditIssue(
                    code="NEGATIVE_TC",
                    severity="p0",
                    message="TC negativo detectado; provavel erro de calculo ou sinal invertido.",
                    sku=sku,
                    field="tc",
                )
            )

        if item.pp is not None and item.es is not None and item.pp < item.es:
            inconsistencias.append(
                AIAuditIssue(
                    code="PP_LT_ES",
                    severity="p0",
                    message="PP menor que ES; politica de reposicao inconsistente.",
                    sku=sku,
                    field="pp",
                )
            )

        if item.sla is not None and item.es is not None and item.sla <= 0.5 and item.es > 0:
            inconsistencias.append(
                AIAuditIssue(
                    code="LOW_SLA_WITH_ES",
                    severity="p1",
                    message="SLA <= 50% com ES > 0; possivel desalinhamento entre meta e estoque de seguranca.",
                    sku=sku,
                    field="sla",
                )
            )

        if item.cobertura is not None and item.tr is not None and item.cobertura < item.tr:
            inconsistencias.append(
                AIAuditIssue(
                    code="COVERAGE_LT_TR",
                    severity="p0",
                    message="Cobertura menor que TR; risco de ruptura no lead time.",
                    sku=sku,
                    field="cobertura",
                )
            )

    logger.info(
        {
            "event": "ai_audit_finished",
            "snapshots_count": len(snapshots),
            "bugs": len(bugs_provaveis),
            "inconsistencias": len(inconsistencias),
            "validacoes_ausentes": len(validacoes_ausentes),
        }
    )
    return AIAuditResponse(
        bugs_provaveis=bugs_provaveis,
        inconsistencias=inconsistencias,
        validacoes_ausentes=validacoes_ausentes,
    )


def generate_operational_insights(metrics: Dict[str, float]) -> AIInsightsResponse:
    insights: List[AIInsightItem] = []

    sla_medio = metrics.get("sla_medio")
    cobertura_media = metrics.get("cobertura_media")
    acuracia_forecast = metrics.get("acuracia_forecast")
    ruptura_pct = metrics.get("ruptura_pct")

    if sla_medio is not None and sla_medio < 0.9:
        insights.append(
            AIInsightItem(
                insight="SLA medio abaixo da meta operacional.",
                recomendacao_executiva="Revisar parametros de reposicao e priorizar SKUs criticos.",
                justificativa=f"SLA medio atual de {sla_medio:.2%} indica atendimento abaixo do esperado.",
                impacto="alto",
            )
        )

    if cobertura_media is not None and cobertura_media < 1.0:
        insights.append(
            AIInsightItem(
                insight="Cobertura media em nivel de risco.",
                recomendacao_executiva="Aumentar cobertura minima para itens A/X e revisar lotes de compra.",
                justificativa=f"Cobertura media de {cobertura_media:.2f} sugere risco de ruptura.",
                impacto="alto",
            )
        )

    if acuracia_forecast is not None and acuracia_forecast < 0.75:
        insights.append(
            AIInsightItem(
                insight="Acuracia de forecast baixa afeta planejamento.",
                recomendacao_executiva="Segmentar modelos por classe ABC/XYZ e monitorar vies mensal.",
                justificativa=f"Acuracia de {acuracia_forecast:.2%} reduz previsibilidade operacional.",
                impacto="medio",
            )
        )

    if ruptura_pct is not None and ruptura_pct > 0.05:
        insights.append(
            AIInsightItem(
                insight="Taxa de ruptura acima do limiar recomendado.",
                recomendacao_executiva="Criar alertas proativos e ajustar ponto de pedido por risco.",
                justificativa=f"Ruptura em {ruptura_pct:.2%} impacta receita e nivel de servico.",
                impacto="alto",
            )
        )

    if not insights:
        insights.append(
            AIInsightItem(
                insight="Indicadores sem desvios criticos aparentes.",
                recomendacao_executiva="Manter rotina de acompanhamento semanal e testes de sensibilidade.",
                justificativa="Metricas recebidas nao apontam anomalias relevantes no momento.",
                impacto="baixo",
            )
        )

    logger.info({"event": "ai_insights_finished", "insights_count": len(insights)})
    return AIInsightsResponse(top_insights_operacionais=insights[:5])


def suggest_product_improvements(
    modulos: List[str],
    indicadores_atuais: List[str],
    validacoes_atuais: List[str],
    objetivo: str | None = None,
) -> AIProductImprovementsResponse:
    low_value_candidates = {"total_registros", "ultima_atualizacao", "qtd_linhas_importadas"}
    metricas_sem_valor = [m for m in indicadores_atuais if m.lower() in low_value_candidates]

    validacoes_base = [
        "Bloquear TC negativo.",
        "Bloquear PP < ES.",
        "Bloquear SLA <= 50% com ES > 0 sem justificativa.",
        "Bloquear cobertura < TR para itens criticos.",
        "Validar limites por faixa (SLA entre 0 e 1; quantidades >= 0).",
    ]
    novas_validacoes_necessarias = [v for v in validacoes_base if v not in validacoes_atuais]

    melhorias_produto_comercial = [
        "Adicionar trilha de auditoria por calculo e usuario.",
        "Criar score de maturidade S&OP por unidade de negocio.",
        "Disponibilizar exportacao executiva (PDF/PowerPoint) com insights automaticos.",
        "Incluir configuracao de politicas por cliente (multi-tenant).",
    ]
    if modulos and "forecast" in {m.lower() for m in modulos}:
        melhorias_produto_comercial.append("Incluir monitor de drift para previsao por familia de SKU.")
    if objetivo:
        melhorias_produto_comercial.append(f"Mapear KPIs comerciais diretamente ao objetivo: {objetivo}.")

    melhorias_ux_confiabilidade = [
        "Exibir explicabilidade do calculo em linguagem de negocio.",
        "Adicionar alertas visuais para inconsistencias criticas em tempo real.",
        "Implementar versionamento de parametros para rollback seguro.",
        "Adicionar testes automatizados de contrato para endpoints criticos.",
    ]

    logger.info(
        {
            "event": "ai_product_improvements_finished",
            "modulos_count": len(modulos),
            "indicators_count": len(indicadores_atuais),
            "low_value_count": len(metricas_sem_valor),
            "new_validations_count": len(novas_validacoes_necessarias),
            "has_objetivo": bool(objetivo),
        }
    )
    return AIProductImprovementsResponse(
        metricas_sem_valor=metricas_sem_valor,
        novas_validacoes_necessarias=novas_validacoes_necessarias,
        melhorias_produto_comercial=melhorias_produto_comercial,
        melhorias_ux_confiabilidade=melhorias_ux_confiabilidade,
    )
