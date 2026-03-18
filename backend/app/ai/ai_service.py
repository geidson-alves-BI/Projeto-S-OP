from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import ValidationError

from ..analytics_v2.engine import analytics_engine_v2
from ..context_pack import build_context_pack
from ..memory_store import analytics_store
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
from .config_store import AIConfigStore, DEFAULT_OPENAI_MODEL, FALLBACK_MODEL_NAME
from .executive_chat import (
    apply_executive_response_template,
    build_executive_chat_openai_prompt,
    build_executive_chat_context_payload,
    build_executive_chat_response,
    merge_executive_chat_openai_output,
)
from .guardrails import enforce_no_hallucination, validate_context_pack
from .personas import get_persona_profile
from .providers.deterministic_provider import DeterministicProvider
from .providers.openai_provider import OpenAIProvider, OpenAIProviderError

logger = logging.getLogger(__name__)

_MISSING_SECTION_HINTS: dict[str, str] = {
    "top_products": "Preencher top_products no contexto atual.",
    "mts_products": "Preencher mts_products para leitura make-to-stock.",
    "mto_products": "Preencher mto_products para leitura make-to-order.",
    "forecast_summary": "Preencher forecast_summary com consolidado de previsao.",
    "raw_material_impact": "Preencher raw_material_impact com consolidado de insumos.",
    "financial_impact": "Preencher financial_impact com consolidado financeiro.",
}

_MISSING_SECTION_LIMITATIONS: dict[str, str] = {
    "top_products": "Sem top_products consolidados: concentracao de portfolio fica limitada.",
    "mts_products": "Sem mts_products: leitura make-to-stock fica parcial.",
    "mto_products": "Sem mto_products: leitura make-to-order fica parcial.",
    "forecast_summary": "Sem forecast_summary: leitura de tendencia fica limitada.",
    "raw_material_impact": "Sem raw_material_impact: cobertura de insumos fica parcial.",
    "financial_impact": "Sem financial_impact: impacto financeiro fica parcial.",
}

_AVAILABLE_INPUT_LABELS: dict[str, str] = {
    "top_products": "FG / producao e portfolio",
    "mts_products": "classificacao ABC/XYZ e estrategia MTS/MTO",
    "forecast_summary": "forecast consolidado",
    "raw_material_impact": "cobertura de materia-prima",
    "financial_impact": "impacto financeiro",
}

_PERSONA_IMPROVEMENT_TITLE: dict[str, str] = {
    "SUPPLY": "Como melhorar o Operion para Abastecimento e Operacoes",
    "CFO": "Como melhorar o Operion para analise financeira",
    "CEO": "Como melhorar o Operion para visao estrategica",
    "COO": "Como melhorar o Operion para visao operacional",
}

_GENERIC_IMPROVEMENT_SUGGESTIONS: dict[str, str] = {
    "top_products": "Consolidar a base FG / producao com historico mensal confiavel para ampliar leitura de concentracao e prioridade.",
    "mts_products": "Concluir a classificacao ABC/XYZ e a recomendacao MTS/MTO para elevar a precisao da segmentacao executiva.",
    "mto_products": "Separar claramente itens make-to-order para refinar leitura de capacidade, servico e excecao operacional.",
    "forecast_summary": "Adicionar forecast consolidado e pedidos futuros para fortalecer leitura de tendencia, variabilidade e antecipacao.",
    "raw_material_impact": "Carregar materia-prima e BOM para destravar cobertura de insumos, lead time e risco de ruptura.",
    "financial_impact": "Adicionar custos, margens, impostos e capital empatado para expandir a camada financeira do produto.",
}

_PERSONA_IMPROVEMENT_SUGGESTIONS: dict[str, dict[str, str]] = {
    "SUPPLY": {
        "forecast_summary": "Adicionar forecast consolidado e pedidos futuros para melhorar leitura de variabilidade, necessidade de compra e risco de ruptura.",
        "raw_material_impact": "Integrar materia-prima, estoque atual e BOM para expor cobertura de insumos, criticidade e lead time de abastecimento.",
        "financial_impact": "Trazer custo de compra e custo de producao para priorizar riscos de abastecimento tambem pelo impacto economico.",
        "__extra_1__": "Incluir lead times de fornecedor, estoque atual por SKU e pedidos em aberto para elevar a robustez da leitura de abastecimento.",
        "__extra_2__": "Adicionar capacidade produtiva e restricoes de recursos para separar gargalo de compra, producao e atendimento.",
    },
    "CFO": {
        "top_products": "Conectar receita por produto e cliente para ampliar a leitura de concentracao de carteira e exposicao financeira.",
        "forecast_summary": "Adicionar pedidos futuros e forecast financeiro para traduzir tendencia de demanda em risco de caixa e margem.",
        "financial_impact": "Integrar custos, margens, impostos, capital empatado e aging de estoque para transformar a leitura em uma camada financeira completa.",
        "__extra_1__": "Adicionar margem por SKU, curva de recebimento e dependencia de clientes para aprofundar capital de giro e risco fiscal.",
        "__extra_2__": "Conectar indicadores de caixa, tributos e provisoes para uma analise financeira mais aderente ao dia a dia do CFO.",
    },
    "CEO": {
        "top_products": "Expandir a leitura para carteira e clientes para evidenciar concentracao do negocio e dependencia comercial.",
        "forecast_summary": "Adicionar pedidos futuros, crescimento e tendencia de carteira para fortalecer a visao estrategica de continuidade.",
        "financial_impact": "Trazer margem, rentabilidade e capital empregado para alinhar crescimento, servico e retorno.",
        "__extra_1__": "Integrar risco de clientes, continuidade de fornecimento e concentracao de portfolio para uma leitura mais estrategica.",
        "__extra_2__": "Adicionar indicadores de servico, crescimento e margem para transformar o app em uma camada real de decisao executiva.",
    },
    "COO": {
        "forecast_summary": "Adicionar forecast consolidado e pedidos futuros para planejar ritmo operacional com maior antecedencia.",
        "raw_material_impact": "Integrar materia-prima, BOM e cobertura de insumos para antecipar gargalos e ruptura operacional.",
        "financial_impact": "Adicionar custos operacionais e perdas para cruzar eficiencia, produtividade e impacto economico.",
        "__extra_1__": "Incluir capacidade produtiva, filas, restricoes de recurso e apontamentos de execucao para medir estabilidade operacional.",
        "__extra_2__": "Conectar disponibilidade de insumos, ordens futuras e gargalos de producao para reforcar continuidade da execucao.",
    },
}

_FACTUAL_INTENT_METRIC_IDS: dict[str, list[str]] = {
    "production_total_by_product": ["production_volume"],
    "production_by_month_for_product": ["production_volume", "production_trend"],
    "abc_xyz_by_product": ["abc_operational", "xyz_operational"],
    "sales_total_by_product": ["sales_volume", "product_mix"],
    "sales_total_by_customer": ["sales_volume", "customer_mix"],
    "customer_products_last_year": ["product_mix", "customer_mix", "sales_volume"],
    "stock_lookup_by_material_or_product": ["raw_material_coverage", "rupture_risk", "excess_risk"],
}

_CONFIDENCE_RANK: dict[str, int] = {"low": 1, "medium": 2, "high": 3}
_FACTUAL_PROVIDER_NAME = "analytics_v2"
_FACTUAL_MODEL_NAME = "analytics_v2_metrics_compute"
_EXECUTIVE_V2_METRIC_IDS: list[str] = [
    "projected_revenue",
    "contribution_margin",
    "contribution_margin_pct",
    "total_working_capital",
    "inventory_carrying_cost",
    "demand_vs_operation_gap",
    "service_risk",
    "scenario_priority",
]


class AIService:
    def __init__(self) -> None:
        self.config_store = AIConfigStore()
        self.deterministic_provider = DeterministicProvider()

    def get_config(self) -> AIConfigResponse:
        snapshot = self.config_store.get_snapshot()
        return self._build_config_response(snapshot)

    def save_config(self, request: AIConfigRequest) -> AIConfigResponse:
        snapshot = self.config_store.save_config(
            provider=request.provider,
            model=request.model,
            api_key=request.apiKey,
            keep_existing_key=request.keepExistingKey,
        )
        logger.info(
            "ai.config saved provider=%s provider_active=%s model=%s has_api_key=%s",
            snapshot.provider,
            snapshot.provider_active,
            snapshot.model,
            snapshot.has_api_key,
        )
        return self._build_config_response(snapshot)

    def test_connection(self) -> AITestConnectionResponse:
        snapshot = self.config_store.get_snapshot()

        if snapshot.provider == "deterministic":
            result_snapshot = self.config_store.record_test_result(
                status="fallback_only",
                message="Provider configurado em modo fallback local.",
            )
            return AITestConnectionResponse(
                success=True,
                status="fallback_only",
                message="Provider configurado em modo fallback local.",
                providerActive=result_snapshot.provider_active,  # type: ignore[arg-type]
                modelActive=result_snapshot.model_active,
                lastTestedAt=result_snapshot.last_tested_at,
            )

        provider = self._build_openai_provider(snapshot)
        if provider is None:
            result_snapshot = self.config_store.record_test_result(
                status="provider_not_configured",
                message="OpenAI selecionado, mas nenhuma API key esta configurada.",
            )
            return AITestConnectionResponse(
                success=False,
                status="provider_not_configured",
                message="OpenAI selecionado, mas nenhuma API key esta configurada.",
                providerActive=result_snapshot.provider_active,  # type: ignore[arg-type]
                modelActive=result_snapshot.model_active,
                lastTestedAt=result_snapshot.last_tested_at,
            )

        try:
            provider.test_connection()
            result_snapshot = self.config_store.record_test_result(
                status="success",
                message=f"Conexao com OpenAI validada com o modelo {snapshot.model}.",
            )
            return AITestConnectionResponse(
                success=True,
                status="success",
                message=f"Conexao com OpenAI validada com o modelo {snapshot.model}.",
                providerActive=result_snapshot.provider_active,  # type: ignore[arg-type]
                modelActive=result_snapshot.model_active,
                lastTestedAt=result_snapshot.last_tested_at,
            )
        except OpenAIProviderError as exc:
            result_snapshot = self.config_store.record_test_result(
                status=exc.reason,
                message=str(exc),
            )
            return AITestConnectionResponse(
                success=False,
                status=exc.reason,  # type: ignore[arg-type]
                message=str(exc),
                providerActive=result_snapshot.provider_active,  # type: ignore[arg-type]
                modelActive=result_snapshot.model_active,
                lastTestedAt=result_snapshot.last_tested_at,
            )

    def interpret(self, request: AIInterpretRequest) -> AIInterpretResponse:
        persona_profile = get_persona_profile(request.persona)
        snapshot = self.config_store.get_snapshot()

        context_pack = request.context_pack if request.context_pack is not None else self._load_current_context_pack()
        validation = validate_context_pack(context_pack)
        normalized_pack = validation.normalized_context_pack
        context_pack_size_bytes = len(json.dumps(normalized_pack, ensure_ascii=False, default=str).encode("utf-8"))

        logger.info(
            "ai.interpret request persona=%s configured_provider=%s active_provider=%s model=%s context_pack_size_bytes=%s",
            persona_profile.code,
            snapshot.provider,
            snapshot.provider_active,
            snapshot.model,
            context_pack_size_bytes,
        )

        provider_used = self.deterministic_provider.name
        model_used = FALLBACK_MODEL_NAME
        used_fallback = True
        reason_fallback = "fallback_only" if snapshot.provider == "deterministic" else "provider_not_configured"

        provider_output: dict[str, Any]
        openai_provider = self._build_openai_provider(snapshot)

        if snapshot.provider == "openai" and openai_provider is not None and validation.is_valid:
            try:
                provider_output = openai_provider.generate(
                    persona=persona_profile,
                    context_pack=normalized_pack,
                    language=request.language,
                )
                provider_used = openai_provider.name
                model_used = snapshot.model
                used_fallback = False
                reason_fallback = None
            except OpenAIProviderError as exc:
                logger.exception("OpenAI provider falhou; fallback para deterministic provider.")
                provider_output = self.deterministic_provider.generate(
                    persona=persona_profile,
                    context_pack=normalized_pack,
                    language=request.language,
                )
                reason_fallback = exc.reason
        else:
            if snapshot.provider == "openai" and openai_provider is None:
                reason_fallback = "provider_not_configured"
            elif snapshot.provider == "openai" and not validation.is_valid:
                reason_fallback = "context_pack_insufficient"

            provider_output = self.deterministic_provider.generate(
                persona=persona_profile,
                context_pack=normalized_pack,
                language=request.language,
            )

        guarded_output = enforce_no_hallucination(provider_output, normalized_pack)
        guarded_output["persona"] = persona_profile.code
        guarded_output["providerUsed"] = provider_used
        guarded_output["modelUsed"] = model_used
        guarded_output["usedFallback"] = used_fallback
        guarded_output["reasonFallback"] = reason_fallback
        self._inject_missing_data_notes(guarded_output, validation.missing_sections, validation.message)
        self._inject_analysis_context(guarded_output, normalized_pack, validation.missing_sections, persona_profile.code)

        try:
            response_model = AIInterpretResponse.model_validate(guarded_output)
        except ValidationError:
            if provider_used == "openai":
                logger.exception("Saida OpenAI invalida para schema; fallback para deterministic provider.")
                fallback_output = self.deterministic_provider.generate(
                    persona=persona_profile,
                    context_pack=normalized_pack,
                    language=request.language,
                )
                guarded_fallback = enforce_no_hallucination(fallback_output, normalized_pack)
                guarded_fallback["persona"] = persona_profile.code
                guarded_fallback["providerUsed"] = self.deterministic_provider.name
                guarded_fallback["modelUsed"] = FALLBACK_MODEL_NAME
                guarded_fallback["usedFallback"] = True
                guarded_fallback["reasonFallback"] = "invalid_openai_output"
                self._inject_missing_data_notes(
                    guarded_fallback,
                    validation.missing_sections,
                    validation.message,
                )
                self._inject_analysis_context(
                    guarded_fallback,
                    normalized_pack,
                    validation.missing_sections,
                    persona_profile.code,
                )
                response_model = AIInterpretResponse.model_validate(guarded_fallback)
                provider_used = self.deterministic_provider.name
                model_used = FALLBACK_MODEL_NAME
                used_fallback = True
                reason_fallback = "invalid_openai_output"
            else:
                raise

        logger.info(
            "ai.interpret result persona=%s provider_used=%s model_used=%s used_fallback=%s reason_fallback=%s",
            persona_profile.code,
            provider_used,
            model_used,
            used_fallback,
            reason_fallback,
        )
        return response_model

    def _load_current_context_pack(self) -> dict[str, Any]:
        return build_context_pack(analytics_store.get_session_snapshot())

    def _resolve_factual_metric_ids(self, intent: str) -> list[str]:
        mapped = _FACTUAL_INTENT_METRIC_IDS.get(intent, [])
        result: list[str] = []
        for metric_id in mapped:
            metric_id_text = str(metric_id or "").strip()
            if metric_id_text and metric_id_text not in result:
                result.append(metric_id_text)
        return result

    def _resolve_factual_scope_and_filters(
        self,
        *,
        intent: str,
        entities: dict[str, Any],
    ) -> tuple[str, dict[str, Any]]:
        scope = "global"
        if intent in {"production_total_by_product", "sales_total_by_product", "abc_xyz_by_product"}:
            scope = "product"
        elif intent == "production_by_month_for_product":
            scope = "monthly"
        elif intent in {"sales_total_by_customer", "customer_products_last_year"}:
            scope = "customer"
        elif intent == "stock_lookup_by_material_or_product":
            scope = "material"

        product_code = str(entities.get("product_code") or "").strip()
        material_code = str(entities.get("material_code") or "").strip()
        customer_code = str(entities.get("customer_code") or "").strip()

        filtros: dict[str, Any] = {}
        product_codes: list[str] = []
        if product_code:
            product_codes.append(product_code)
        if material_code:
            product_codes.append(material_code)
        if product_codes:
            filtros["product_codes"] = list(dict.fromkeys(product_codes))
        if customer_code:
            filtros["customer_codes"] = [customer_code]
        return scope, filtros

    def _rank_to_confidence(self, rank: int) -> str:
        if rank >= 3:
            return "high"
        if rank == 2:
            return "medium"
        return "low"

    def _dedupe_text(self, values: list[Any]) -> list[str]:
        out: list[str] = []
        for value in values:
            text = str(value or "").strip()
            if text and text not in out:
                out.append(text)
        return out

    def _build_executive_v2_metric_snapshot(self) -> tuple[dict[str, Any], list[str]]:
        warnings: list[str] = []
        try:
            result = analytics_engine_v2.compute_metrics(
                metric_ids=_EXECUTIVE_V2_METRIC_IDS,
                escopo="global",
                filtros=None,
                cenario="base",
            )
        except Exception:
            logger.exception("Falha ao consolidar metricas executivas v2 para o chat executivo.")
            warnings.append("executive_metrics_v2_error")
            return (
                {
                    "status": "unavailable",
                    "metric_ids": list(_EXECUTIVE_V2_METRIC_IDS),
                    "metrics": {},
                    "counts": {"ready": 0, "partial": 0, "unavailable": len(_EXECUTIVE_V2_METRIC_IDS)},
                    "limitations": ["Camada executiva v2 indisponivel para esta resposta."],
                    "missing_data": ["executive_metrics_v2"],
                    "engine_version": None,
                    "metric_registry_version": None,
                },
                warnings,
            )

        metrics_nodes: dict[str, dict[str, Any]] = {}
        limitations: list[str] = []
        missing_data: list[str] = []
        ready = 0
        partial = 0
        unavailable = 0

        for metric in result.get("metrics", []):
            if not isinstance(metric, dict):
                continue
            metric_id = str(metric.get("metric_id") or "").strip()
            if not metric_id:
                continue
            status = str(metric.get("status") or "unavailable")
            if status == "ready":
                ready += 1
            elif status == "partial":
                partial += 1
            else:
                unavailable += 1
            metrics_nodes[metric_id] = {
                "display_name": metric.get("display_name"),
                "value": metric.get("value"),
                "formatted_value": metric.get("formatted_value"),
                "status": status,
                "confianca": metric.get("confianca"),
                "decision_grade": metric.get("decision_grade"),
                "estimate_type": metric.get("estimate_type"),
                "base_usada": metric.get("base_usada", []),
                "limitations": metric.get("limitations", []),
                "missing_data": metric.get("missing_data", []),
            }
            limitations.extend([str(item) for item in metric.get("limitations", []) if str(item).strip()])
            missing_data.extend([str(item) for item in metric.get("missing_data", []) if str(item).strip()])

        status = "ready"
        if unavailable > 0 and (ready + partial) > 0:
            status = "partial"
        elif unavailable > 0 and ready == 0 and partial == 0:
            status = "unavailable"
        elif partial > 0:
            status = "partial"

        snapshot = {
            "status": status,
            "metric_ids": list(_EXECUTIVE_V2_METRIC_IDS),
            "metrics": metrics_nodes,
            "counts": {"ready": ready, "partial": partial, "unavailable": unavailable},
            "limitations": self._dedupe_text(limitations)[:12],
            "missing_data": self._dedupe_text(missing_data)[:12],
            "engine_version": result.get("engine_version"),
            "metric_registry_version": result.get("metric_registry_version"),
        }
        return snapshot, warnings

    def _build_factual_v2_payload(
        self,
        *,
        message: str,
        fallback_payload: dict[str, Any],
        context_used_fallback: dict[str, Any],
    ) -> tuple[dict[str, Any], list[str]]:
        del message
        warnings: list[str] = []
        payload = dict(fallback_payload)

        intent = str(context_used_fallback.get("intent") or "")
        entities = (
            context_used_fallback.get("entities")
            if isinstance(context_used_fallback.get("entities"), dict)
            else {}
        )
        metric_ids = self._resolve_factual_metric_ids(intent)
        scope, filtros = self._resolve_factual_scope_and_filters(intent=intent, entities=entities)

        if not metric_ids:
            warnings.append(f"Intent factual sem mapeamento v2: {intent or 'unknown_intent'}.")
            limitations = list(dict.fromkeys([
                *[str(item) for item in payload.get("limitations", []) if str(item).strip()],
                "Intent factual sem metrica v2 mapeada; fallback contextual aplicado.",
            ]))
            payload["limitations"] = limitations[:10]
            payload["partial"] = True
            blocks = payload.get("blocks")
            if isinstance(blocks, dict):
                evidence = blocks.get("evidence")
                evidence_list = [str(item) for item in evidence if str(item).strip()] if isinstance(evidence, list) else []
                evidence_list.append("metric_ids_v2: nenhum")
                blocks["evidence"] = evidence_list[:8]
                payload["blocks"] = blocks
            return payload, warnings

        result = analytics_engine_v2.compute_metrics(
            metric_ids=metric_ids,
            escopo=scope,
            filtros=filtros or None,
            cenario="base",
        )
        metric_by_id = {
            str(metric.get("metric_id") or ""): metric
            for metric in result.get("metrics", [])
            if isinstance(metric, dict)
        }
        ordered_metrics = [metric_by_id[item] for item in metric_ids if item in metric_by_id]
        missing_metric_ids = [item for item in metric_ids if item not in metric_by_id]
        if missing_metric_ids:
            warnings.append("Metricas v2 nao retornadas: " + ", ".join(missing_metric_ids))

        primary_metric = next(
            (metric for metric in ordered_metrics if str(metric.get("status")) != "unavailable"),
            ordered_metrics[0] if ordered_metrics else None,
        )

        limitations: list[str] = []
        missing_data: list[str] = []
        data_points: list[dict[str, Any]] = []
        confidence_rank = 3
        has_partial = False
        for metric in ordered_metrics:
            status = str(metric.get("status") or "unavailable")
            if status != "ready":
                has_partial = True
            confidence = str(metric.get("confianca") or "low")
            confidence_rank = min(confidence_rank, _CONFIDENCE_RANK.get(confidence, 1))
            limitations.extend([str(item) for item in metric.get("limitations", []) if str(item).strip()])
            missing_data.extend([str(item) for item in metric.get("missing_data", []) if str(item).strip()])

            data_points.append({"label": f"{metric.get('metric_id')}_value", "value": metric.get("value")})
            data_points.append({"label": f"{metric.get('metric_id')}_formatted", "value": metric.get("formatted_value")})
            data_points.append({"label": f"{metric.get('metric_id')}_status", "value": status})

        limitations.extend([str(item) for item in payload.get("limitations", []) if str(item).strip()])
        missing_data.extend([str(item) for item in payload.get("missing_data", []) if str(item).strip()])
        if missing_metric_ids:
            limitations.append("Metricas v2 nao retornadas: " + ", ".join(missing_metric_ids))
        limitations = list(dict.fromkeys(limitations))
        missing_data = list(dict.fromkeys(missing_data))

        confidence = self._rank_to_confidence(confidence_rank)
        partial = bool(has_partial or missing_metric_ids or missing_data)
        if partial and confidence == "high":
            confidence = "medium"

        if primary_metric is None:
            direct_answer = "Nao foi possivel retornar metrica factual pela camada analytics v2 para esta pergunta."
            base_usada: list[str] = []
            decision_grade = "D"
            formatted_value = "N/A"
            primary_escopo = scope
            primary_value: Any = None
        else:
            display_name = str(primary_metric.get("display_name") or primary_metric.get("metric_id") or "metrica")
            formatted_value = str(primary_metric.get("formatted_value") or "N/A")
            direct_answer = f"Valor principal ({display_name}): {formatted_value}."
            base_usada = [
                str(item)
                for item in primary_metric.get("base_usada", [])
                if str(item).strip()
            ]
            decision_grade = str(primary_metric.get("decision_grade") or "D")
            primary_escopo = str(primary_metric.get("escopo") or scope)
            primary_value = primary_metric.get("value")

        summary_points = [
            {"label": "valor", "value": primary_value},
            {"label": "base_usada", "value": base_usada},
            {"label": "escopo", "value": primary_escopo},
            {"label": "confianca", "value": confidence},
            {"label": "decision_grade", "value": decision_grade},
            {"label": "limitations", "value": limitations[:3]},
        ]
        data_points = summary_points + data_points

        evidence = [
            f"valor: {formatted_value}",
            "base_usada: " + (", ".join(base_usada) if base_usada else "sem base declarada"),
            f"escopo: {primary_escopo}",
            f"confianca: {confidence}",
            f"decision_grade: {decision_grade}",
        ]
        for metric in ordered_metrics[:4]:
            evidence.append(
                f"{metric.get('metric_id')}: {metric.get('formatted_value')} "
                f"(status={metric.get('status')}, confianca={metric.get('confianca')}, "
                f"decision_grade={metric.get('decision_grade')})"
            )

        blocks = {
            "direct_answer": direct_answer,
            "evidence": evidence[:8],
            "risks_limitations": limitations[:8],
            "executive_recommendation": [
                "Se quiser, detalho o mesmo indicador em outro escopo ou cenario financeiro."
            ],
        }

        payload.update(
            {
                "answer": "\n\n".join(
                    [
                        f"Resposta direta:\n{direct_answer}",
                        "Evidencias / base utilizada:\n- " + "\n- ".join(blocks["evidence"]),
                        "Riscos ou limitacoes:\n- "
                        + ("\n- ".join(limitations[:3]) if limitations else "Sem limitacoes criticas nesta leitura."),
                    ]
                ),
                "blocks": blocks,
                "confidence": confidence,
                "partial": partial,
                "limitations": limitations[:10],
                "missing_data": missing_data[:10],
                "data_points": data_points[:12],
                "generated_at": fallback_payload.get("generated_at"),
            }
        )

        context_used = payload.get("context_used")
        if not isinstance(context_used, dict):
            context_used = {}
        context_used["factual_v2"] = {
            "intent": intent,
            "metric_ids_requested": metric_ids,
            "metric_ids_returned": [str(item.get("metric_id")) for item in ordered_metrics],
            "metric_ids_missing": missing_metric_ids,
            "escopo": scope,
            "filtros": filtros,
            "engine_version": result.get("engine_version"),
            "metric_registry_version": result.get("metric_registry_version"),
        }
        payload["context_used"] = context_used
        return payload, warnings

    def executive_chat(self, request: ExecutiveChatRequest) -> ExecutiveChatResponse:
        planning_result = (
            analytics_store.get_planning_production_result()
            if request.include_planning_context
            else None
        )
        sales_rows = analytics_store.get_dataset_rows("sales_orders")
        production_rows = analytics_store.get_dataset_rows("production")
        customers_rows = analytics_store.get_dataset_rows("customers")
        inventory_rows = analytics_store.get_dataset_rows("raw_material_inventory")
        manifest = analytics_store.get_dataset_manifest()
        history_payload = [item.model_dump() for item in request.history]
        fallback_payload = build_executive_chat_response(
            message=request.message,
            planning_result=planning_result,
            sales_rows=sales_rows,
            production_rows=production_rows,
            customers_rows=customers_rows,
            inventory_rows=inventory_rows,
            manifest=manifest,
            history=history_payload,
            mode=request.mode,
        )
        payload = dict(fallback_payload)
        parsing_warnings: list[str] = []

        snapshot = self.config_store.get_snapshot()
        provider_used = "rule_based"
        model_used = FALLBACK_MODEL_NAME
        fallback_triggered = True
        fallback_reason = "fallback_only" if snapshot.provider == "deterministic" else "provider_not_configured"
        context_used_fallback = fallback_payload.get("context_used")
        if not isinstance(context_used_fallback, dict):
            context_used_fallback = {}
        query_mode = str(context_used_fallback.get("query_mode") or "executive")
        allow_openai_for_query = query_mode != "factual"

        if not allow_openai_for_query:
            fallback_reason = "factual_analytics_v2"
            try:
                payload, parsing_warnings = self._build_factual_v2_payload(
                    message=request.message,
                    fallback_payload=fallback_payload,
                    context_used_fallback=context_used_fallback,
                )
                provider_used = _FACTUAL_PROVIDER_NAME
                model_used = _FACTUAL_MODEL_NAME
                fallback_triggered = False
                fallback_reason = None
            except Exception:
                logger.exception("Falha no factual v2; fallback para rule-based factual.")
                fallback_triggered = True
                fallback_reason = "factual_v2_error"
                provider_used = "rule_based"
                model_used = FALLBACK_MODEL_NAME

        openai_provider = self._build_openai_provider(snapshot)
        if allow_openai_for_query and snapshot.provider == "openai" and openai_provider is not None:
            try:
                prompt_payload = build_executive_chat_openai_prompt(
                    message=request.message,
                    mode=request.mode,
                    context_summary=fallback_payload.get("context_summary", {}),
                    history=history_payload,
                    fallback_payload=fallback_payload,
                )
                openai_output = openai_provider.generate_json(
                    system_prompt=prompt_payload["system_prompt"],
                    user_prompt=prompt_payload["user_prompt"],
                    temperature=0.15 if request.mode == "detailed" else 0.1,
                )
                payload, parsing_warnings = merge_executive_chat_openai_output(
                    openai_output=openai_output,
                    fallback_payload=fallback_payload,
                    mode=request.mode,
                )
                provider_used = openai_provider.name
                model_used = snapshot.model
                fallback_triggered = False
                fallback_reason = None
            except OpenAIProviderError as exc:
                fallback_reason = exc.reason
                logger.exception(
                    "OpenAI executive chat falhou; fallback para rule-based. reason=%s",
                    exc.reason,
                )
            except Exception:
                fallback_reason = "openai_error"
                logger.exception(
                    "Erro inesperado no executive chat com OpenAI; fallback para rule-based."
                )
        elif allow_openai_for_query and snapshot.provider == "openai" and openai_provider is None:
            fallback_reason = "provider_not_configured"

        context_used = payload.get("context_used")
        if not isinstance(context_used, dict):
            context_used = {}
        parsing_warnings = self._dedupe_text(parsing_warnings)
        context_used["execution"] = {
            "provider_used": provider_used,
            "model_used": model_used,
            "fallback_triggered": fallback_triggered,
            "fallback_reason": fallback_reason,
            "parsing_warnings": parsing_warnings,
        }
        payload["context_used"] = context_used
        payload["execution_meta"] = {
            "provider_used": provider_used,
            "model_used": model_used,
            "fallback_triggered": fallback_triggered,
            "fallback_reason": fallback_reason,
            "parsing_warnings": parsing_warnings,
        }

        if allow_openai_for_query:
            executive_snapshot, executive_snapshot_warnings = self._build_executive_v2_metric_snapshot()
            if executive_snapshot_warnings:
                parsing_warnings = self._dedupe_text(parsing_warnings + executive_snapshot_warnings)
                context_used["execution"]["parsing_warnings"] = parsing_warnings
                payload["execution_meta"]["parsing_warnings"] = parsing_warnings

            context_summary = payload.get("context_summary")
            if not isinstance(context_summary, dict):
                context_summary = {}
            context_summary["executive_metrics_v2"] = executive_snapshot
            payload["context_summary"] = context_summary

            limitations = self._dedupe_text(
                [*payload.get("limitations", []), *executive_snapshot.get("limitations", [])]
            )
            missing_data = self._dedupe_text(
                [*payload.get("missing_data", []), *executive_snapshot.get("missing_data", [])]
            )
            payload["limitations"] = limitations[:12]
            payload["missing_data"] = missing_data[:12]
            if executive_snapshot.get("status") in {"partial", "unavailable"}:
                payload["partial"] = True

            payload = apply_executive_response_template(
                payload=payload,
                mode=request.mode,
            )

            context_used_after_template = payload.get("context_used")
            if not isinstance(context_used_after_template, dict):
                context_used_after_template = context_used
            context_used_after_template["execution"] = context_used["execution"]
            payload["context_used"] = context_used_after_template
            payload["execution_meta"] = {
                "provider_used": provider_used,
                "model_used": model_used,
                "fallback_triggered": fallback_triggered,
                "fallback_reason": fallback_reason,
                "parsing_warnings": parsing_warnings,
            }
        return ExecutiveChatResponse.model_validate(payload)

    def executive_chat_context(
        self,
        *,
        include_planning_context: bool = True,
        history: list[dict[str, Any]] | None = None,
    ) -> ExecutiveChatContextResponse:
        planning_result = (
            analytics_store.get_planning_production_result()
            if include_planning_context
            else None
        )
        sales_rows = analytics_store.get_dataset_rows("sales_orders")
        production_rows = analytics_store.get_dataset_rows("production")
        customers_rows = analytics_store.get_dataset_rows("customers")
        inventory_rows = analytics_store.get_dataset_rows("raw_material_inventory")
        manifest = analytics_store.get_dataset_manifest()
        payload = build_executive_chat_context_payload(
            planning_result=planning_result,
            sales_rows=sales_rows,
            production_rows=production_rows,
            customers_rows=customers_rows,
            inventory_rows=inventory_rows,
            manifest=manifest,
            history=history or [],
        )
        return ExecutiveChatContextResponse.model_validate(payload)

    def _build_openai_provider(self, snapshot: Any) -> OpenAIProvider | None:
        if snapshot.provider != "openai" or not snapshot.api_key:
            return None
        return OpenAIProvider(api_key=snapshot.api_key, model=snapshot.model or DEFAULT_OPENAI_MODEL)

    def _build_config_response(self, snapshot: Any) -> AIConfigResponse:
        return AIConfigResponse(
            provider=snapshot.provider,  # type: ignore[arg-type]
            providerActive=snapshot.provider_active,  # type: ignore[arg-type]
            model=snapshot.model,
            modelActive=snapshot.model_active,
            hasApiKey=snapshot.has_api_key,
            apiKeyMasked=snapshot.api_key_masked,
            usingEnvironmentKey=snapshot.using_environment_key,
            connectionStatus=snapshot.last_test_status,  # type: ignore[arg-type]
            lastTestedAt=snapshot.last_tested_at,
            lastTestMessage=snapshot.last_test_message,
        )

    def _inject_missing_data_notes(
        self,
        output: dict[str, Any],
        missing_sections: list[str],
        validation_message: str | None,
    ) -> None:
        data_quality_flags = output.setdefault("data_quality_flags", [])
        questions = output.setdefault("questions_to_validate", [])
        limitations = output.setdefault("limitations", [])

        if validation_message:
            if validation_message not in data_quality_flags:
                data_quality_flags.append(validation_message)
            if validation_message not in limitations:
                limitations.append(validation_message)

        for section in missing_sections:
            hint = _MISSING_SECTION_HINTS.get(section)
            limitation = _MISSING_SECTION_LIMITATIONS.get(section)
            if hint and hint not in questions:
                questions.append(hint)
            if limitation and limitation not in limitations:
                limitations.append(limitation)

        output["data_quality_flags"] = list(dict.fromkeys(str(flag) for flag in data_quality_flags if str(flag)))
        output["questions_to_validate"] = list(dict.fromkeys(str(item) for item in questions if str(item)))
        output["limitations"] = list(dict.fromkeys(str(item) for item in limitations if str(item)))

    def _inject_analysis_context(
        self,
        output: dict[str, Any],
        context_pack: dict[str, Any],
        missing_sections: list[str],
        persona_code: str,
    ) -> None:
        available_inputs = self._build_available_inputs(context_pack)
        missing_inputs = self._build_missing_inputs(missing_sections, available_inputs)

        output["inputsAvailable"] = available_inputs
        output["inputsMissing"] = missing_inputs
        output["analysisScope"] = self._build_analysis_scope(available_inputs, missing_inputs)
        output["appImprovementTitle"] = _PERSONA_IMPROVEMENT_TITLE.get(
            persona_code,
            "Como melhorar o Operion",
        )
        output["appImprovementSuggestions"] = self._build_improvement_suggestions(
            persona_code=persona_code,
            missing_sections=missing_sections,
        )

    def _build_available_inputs(self, context_pack: dict[str, Any]) -> list[str]:
        available_inputs: list[str] = []

        if self._has_content(context_pack.get("top_products")):
            available_inputs.append(_AVAILABLE_INPUT_LABELS["top_products"])

        if self._has_content(context_pack.get("mts_products")) or self._has_content(context_pack.get("mto_products")):
            available_inputs.append(_AVAILABLE_INPUT_LABELS["mts_products"])

        if self._has_content(context_pack.get("forecast_summary")):
            available_inputs.append(_AVAILABLE_INPUT_LABELS["forecast_summary"])

        if self._has_content(context_pack.get("raw_material_impact")):
            available_inputs.append(_AVAILABLE_INPUT_LABELS["raw_material_impact"])

        if self._has_content(context_pack.get("financial_impact")):
            available_inputs.append(_AVAILABLE_INPUT_LABELS["financial_impact"])

        return available_inputs

    def _build_missing_inputs(
        self,
        missing_sections: list[str],
        available_inputs: list[str],
    ) -> list[str]:
        labels: list[str] = []
        for section in missing_sections:
            label = _AVAILABLE_INPUT_LABELS.get(section)
            if label and label not in labels and label not in available_inputs:
                labels.append(label)
        return labels

    def _build_analysis_scope(
        self,
        available_inputs: list[str],
        missing_inputs: list[str],
    ) -> str:
        if available_inputs and missing_inputs:
            return (
                f"Analise realizada com {self._join_labels(available_inputs)}. "
                f"Nao foi possivel aprofundar {self._join_labels(missing_inputs)}."
            )

        if available_inputs:
            return f"Analise realizada com {self._join_labels(available_inputs)}."

        if missing_inputs:
            return (
                "Analise executiva muito limitada. "
                f"As principais bases ausentes sao {self._join_labels(missing_inputs)}."
            )

        return "Analise executiva realizada com o contexto disponivel no momento."

    def _build_improvement_suggestions(
        self,
        *,
        persona_code: str,
        missing_sections: list[str],
    ) -> list[str]:
        suggestions: list[str] = []
        persona_suggestions = _PERSONA_IMPROVEMENT_SUGGESTIONS.get(persona_code, {})

        for section in missing_sections:
            text = persona_suggestions.get(section) or _GENERIC_IMPROVEMENT_SUGGESTIONS.get(section)
            if text and text not in suggestions:
                suggestions.append(text)

        for extra_key in ("__extra_1__", "__extra_2__"):
            extra_text = persona_suggestions.get(extra_key)
            if extra_text and extra_text not in suggestions:
                suggestions.append(extra_text)

        if not suggestions:
            suggestions.append(
                "Manter a cobertura atual do contexto e ampliar integracoes operacionais para aprofundar a leitura executiva."
            )

        return suggestions[:5]

    def _join_labels(self, labels: list[str]) -> str:
        cleaned = [label.strip() for label in labels if label.strip()]
        if not cleaned:
            return "dados disponiveis"
        if len(cleaned) == 1:
            return cleaned[0]
        if len(cleaned) == 2:
            return f"{cleaned[0]} e {cleaned[1]}"
        return f"{', '.join(cleaned[:-1])} e {cleaned[-1]}"

    def _has_content(self, value: Any) -> bool:
        if value is None:
            return False
        if isinstance(value, str):
            return value.strip() != ""
        if isinstance(value, dict):
            return bool(value) and any(self._has_content(item) for item in value.values())
        if isinstance(value, (list, tuple, set)):
            return bool(value) and any(self._has_content(item) for item in value)
        return True


ai_service = AIService()
