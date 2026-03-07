from __future__ import annotations

from typing import Any

from ..guardrails import build_evidence, validate_context_pack
from ..personas import PersonaProfile
from .base import BaseAIProvider

_MISSING_SECTION_QUESTIONS: dict[str, str] = {
    "top_products": "Envie top_products para identificar concentracao de prioridade por SKU.",
    "mts_products": "Envie mts_products para validar impacto dos itens make-to-stock.",
    "mto_products": "Envie mto_products para avaliar capacidade e lead time sob demanda.",
    "forecast_summary": "Envie forecast_summary para analisar tendencia, variacao e sazonalidade.",
    "raw_material_impact": "Envie raw_material_impact para mapear materias-primas criticas e risco de ruptura.",
    "financial_impact": "Envie financial_impact para avaliar custo total e impacto no capital.",
}

def _append_unique(target: list[str], value: str) -> None:
    if value and value not in target:
        target.append(value)


class DeterministicProvider(BaseAIProvider):
    name = "deterministic"

    def generate(
        self,
        persona: PersonaProfile,
        context_pack: dict[str, Any],
        language: str,
    ) -> dict[str, Any]:
        del language

        validation = validate_context_pack(context_pack)
        normalized = validation.normalized_context_pack

        response: dict[str, Any] = {
            "persona": persona.code,
            "executive_summary": [],
            "risks": [],
            "opportunities": [],
            "actions": [],
            "limitations": [],
            "questions_to_validate": list(persona.guiding_questions),
            "data_quality_flags": [],
            "disclaimer": (
                "Insights gerados em modo fallback local com base exclusiva no context_pack. "
                "Nao ha inferencia fora dos dados enviados."
            ),
        }

        if validation.message:
            _append_unique(response["data_quality_flags"], validation.message)
            _append_unique(response["limitations"], validation.message)

        if validation.missing_sections:
            for section in validation.missing_sections:
                question = _MISSING_SECTION_QUESTIONS.get(section)
                if question:
                    _append_unique(response["questions_to_validate"], question)

        if not validation.is_valid:
            response["executive_summary"].append(
                "Dados insuficientes para gerar insights executivos confiaveis com o contexto atual."
            )
            response["disclaimer"] = (
                "Dados insuficientes: complete o contexto e regenere os insights antes de tomar decisoes."
            )
            response["opportunities"].append(
                {
                    "title": "Priorizar consolidacao das bases para destravar leitura executiva mais robusta.",
                    "impact": "medium",
                    "evidence": self._collect_evidence(normalized, ["top_products"]),
                }
            )
            response["actions"].append(
                {
                    "title": "Completar o Contexto Executivo Consolidado antes da proxima rodada de decisao.",
                    "horizon": "0-7d",
                    "impact": "high",
                    "evidence": self._collect_evidence(normalized, ["top_products"]),
                }
            )
            return response

        top_products = normalized.get("top_products", [])
        forecast_summary = normalized.get("forecast_summary", {})
        raw_material_impact = normalized.get("raw_material_impact", {})
        financial_impact = normalized.get("financial_impact", {})

        if top_products:
            response["executive_summary"].append(
                {
                    "SUPPLY": "Produtos lideres concentram a prioridade operacional e exigem sincronismo de reposicao.",
                    "CFO": "Produtos lideres concentram impacto economico e demandam foco de capital de giro.",
                    "CEO": "A carteira lider concentra foco estrategico e precisa de alinhamento executivo.",
                    "COO": "Os SKUs lideres concentram carga operacional e precisam de execucao coordenada.",
                }[persona.code]
            )
            response["opportunities"].append(
                {
                    "title": {
                        "SUPPLY": "Repriorizar os SKUs lideres para reduzir risco de ruptura no curto prazo.",
                        "CFO": "Concentrar analise economica nos SKUs lideres para melhorar alocacao de caixa.",
                        "CEO": "Usar os SKUs lideres como foco de alinhamento executivo imediato.",
                        "COO": "Ajustar agenda operacional em torno dos SKUs que concentram fluxo.",
                    }[persona.code],
                    "impact": "medium",
                    "evidence": self._collect_evidence(normalized, ["top_products[0]", "top_products"]),
                }
            )

        if forecast_summary:
            response["executive_summary"].append(
                {
                    "SUPPLY": "A previsao sinaliza variacao entre SKUs, com necessidade de ajuste de PP/ES.",
                    "CFO": "A previsao indica variacao de demanda com potencial efeito em custo e caixa.",
                    "CEO": "O sinal de demanda pede balanceamento entre servico, custo e nivel de risco.",
                    "COO": "O sinal de demanda exige ajuste de ritmo operacional e cadencia de curto prazo.",
                }[persona.code]
            )

            response["risks"].append(
                {
                    "title": {
                        "SUPPLY": "Variacao de forecast pode gerar ruptura e excesso em paralelo.",
                        "CFO": "Oscilacao de forecast pode pressionar margem por ineficiencia de estoque.",
                        "CEO": "Oscilacao de forecast aumenta risco de execucao do plano trimestral.",
                        "COO": "Oscilacao de forecast aumenta risco de instabilidade operacional no curto prazo.",
                    }[persona.code],
                    "severity": "medium",
                    "evidence": self._collect_evidence(
                        normalized,
                        [
                            "forecast_summary.max_final_forecast",
                            "forecast_summary.min_final_forecast",
                            "forecast_summary.total_final_forecast",
                        ],
                    ),
                }
            )

            response["opportunities"].append(
                {
                    "title": {
                        "SUPPLY": "Antecipar revisao semanal do forecast para estabilizar reposicao.",
                        "CFO": "Reduzir custo de erro de previsao com monitoramento mais frequente.",
                        "CEO": "Usar a tendencia para alinhar demanda, operacao e capital com maior antecedencia.",
                        "COO": "Ajustar janela operacional antes que a demanda pressione capacidade e servico.",
                    }[persona.code],
                    "impact": "medium",
                    "evidence": self._collect_evidence(normalized, ["forecast_summary.total_final_forecast"]),
                }
            )

            response["actions"].append(
                {
                    "title": {
                        "SUPPLY": "Revisar forecast semanal e recalibrar parametros de reposicao.",
                        "CFO": "Priorizar revisao de cenarios para reduzir custo de erro de previsao.",
                        "CEO": "Definir rito executivo de revisao de demanda e resposta operacional.",
                        "COO": "Realinhar cadencia de producao e abastecimento frente ao sinal de demanda.",
                    }[persona.code],
                    "horizon": "0-7d",
                    "impact": "medium",
                    "evidence": self._collect_evidence(normalized, ["forecast_summary.total_final_forecast"]),
                }
            )

        if raw_material_impact:
            response["executive_summary"].append(
                {
                    "SUPPLY": "Consumo de materia-prima critica pede monitoramento diario de abastecimento.",
                    "CFO": "A dependencia de materia-prima critica concentra exposicao de custo e caixa.",
                    "CEO": "A frente de suprimentos apresenta risco estrategico em materias-primas criticas.",
                    "COO": "A cobertura de insumos influencia diretamente a estabilidade da execucao operacional.",
                }[persona.code]
            )

            response["risks"].append(
                {
                    "title": {
                        "SUPPLY": "Risco de ruptura em materias-primas criticas do plano.",
                        "CFO": "Risco de pressao de custo por concentracao em materias-primas criticas.",
                        "CEO": "Risco de continuidade operacional por dependencia de insumos criticos.",
                        "COO": "Risco de interrupcao operacional por dependencia de insumos criticos.",
                    }[persona.code],
                    "severity": "high",
                    "evidence": self._collect_evidence(
                        normalized,
                        [
                            "raw_material_impact.top_materials[0].raw_material_code",
                            "raw_material_impact.total_required",
                        ],
                    ),
                }
            )

            response["opportunities"].append(
                {
                    "title": {
                        "SUPPLY": "Redesenhar cobertura de insumos criticos antes do pico de reposicao.",
                        "CFO": "Negociar insumos criticos com foco em custo e previsibilidade de caixa.",
                        "CEO": "Mitigar dependencias de insumo para proteger servico e crescimento.",
                        "COO": "Usar a cobertura de insumos para reordenar prioridades de execucao.",
                    }[persona.code],
                    "impact": "high",
                    "evidence": self._collect_evidence(
                        normalized,
                        ["raw_material_impact.top_materials", "raw_material_impact.total_required"],
                    ),
                }
            )

            response["actions"].append(
                {
                    "title": {
                        "SUPPLY": "Acionar plano de contingencia para fornecedores das MPs criticas.",
                        "CFO": "Negociar condicoes de compra para reduzir exposicao financeira das MPs criticas.",
                        "CEO": "Priorizar decisao executiva para mitigacao de risco de suprimento.",
                        "COO": "Sincronizar producao e suprimentos em torno das MPs criticas do plano.",
                    }[persona.code],
                    "horizon": "0-7d" if persona.code != "CFO" else "7-30d",
                    "impact": "high",
                    "evidence": self._collect_evidence(
                        normalized,
                        ["raw_material_impact.top_materials", "raw_material_impact.total_required"],
                    ),
                }
            )

        if financial_impact:
            response["executive_summary"].append(
                {
                    "SUPPLY": "O custo agregado de producao reforca a necessidade de sequenciamento disciplinado.",
                    "CFO": "O impacto financeiro consolidado indica foco imediato em eficiencia de custo.",
                    "CEO": "A frente financeira do plano exige prioridade executiva para captura de eficiencia.",
                    "COO": "O custo agregado reforca a necessidade de execucao disciplinada e mix coerente.",
                }[persona.code]
            )

            response["risks"].append(
                {
                    "title": {
                        "SUPPLY": "Plano de producao pode elevar custo sem ganho de servico equivalente.",
                        "CFO": "Custo total de producao pode pressionar margem e capital de giro.",
                        "CEO": "Trade-off custo x servico pode comprometer meta corporativa.",
                        "COO": "Trade-off entre produtividade e custo pode degradar a execucao do plano.",
                    }[persona.code],
                    "severity": "high" if persona.code in {"CFO", "CEO"} else "medium",
                    "evidence": self._collect_evidence(
                        normalized,
                        [
                            "financial_impact.total_production_cost",
                            "financial_impact.total_raw_material_cost",
                        ],
                    ),
                }
            )

            response["opportunities"].append(
                {
                    "title": {
                        "SUPPLY": "Reequilibrar o mix operacional para capturar eficiencia com menor risco.",
                        "CFO": "Reduzir capital empatado e custo por SKU com foco nos maiores impactos.",
                        "CEO": "Converter ganho de eficiencia em decisao executiva priorizada.",
                        "COO": "Ajustar o fluxo operacional para capturar eficiencia sem perder servico.",
                    }[persona.code],
                    "impact": "high",
                    "evidence": self._collect_evidence(
                        normalized,
                        [
                            "financial_impact.products_simulated",
                            "financial_impact.total_production_cost",
                        ],
                    ),
                }
            )

            response["actions"].append(
                {
                    "title": {
                        "SUPPLY": "Replanejar mix MTS/MTO dos itens de maior impacto operacional.",
                        "CFO": "Executar revisao de custo por SKU e priorizar reducao de capital empatado.",
                        "CEO": "Definir prioridades de decisao para alinhar custo, servico e crescimento.",
                        "COO": "Sequenciar capacidade e atendimento com base no impacto operacional do mix atual.",
                    }[persona.code],
                    "horizon": "7-30d",
                    "impact": "high",
                    "evidence": self._collect_evidence(
                        normalized,
                        [
                            "financial_impact.products_simulated",
                            "financial_impact.total_production_cost",
                        ],
                    ),
                }
            )

        if not response["executive_summary"]:
            response["executive_summary"].append(
                "Dados insuficientes para gerar leitura completa; confirme o preenchimento dos blocos do contexto."
            )

        if not response["risks"]:
            response["risks"].append(
                {
                    "title": "Risco ainda nao qualificado por ausencia de evidencias suficientes no contexto.",
                    "severity": "low",
                    "evidence": self._collect_evidence(normalized, ["top_products"]),
                }
            )

        if not response["opportunities"]:
            response["opportunities"].append(
                {
                    "title": "Completar o contexto para ampliar a qualidade das recomendacoes executivas.",
                    "impact": "low",
                    "evidence": self._collect_evidence(normalized, ["top_products"]),
                }
            )

        if not response["actions"]:
            response["actions"].append(
                {
                    "title": "Completar dados faltantes e reprocessar insights para priorizacao confiavel.",
                    "horizon": "0-7d",
                    "impact": "low",
                    "evidence": self._collect_evidence(normalized, ["top_products"]),
                }
            )

        response["questions_to_validate"] = list(dict.fromkeys(response["questions_to_validate"]))
        response["data_quality_flags"] = list(dict.fromkeys(response["data_quality_flags"]))
        response["limitations"] = list(dict.fromkeys(response["limitations"]))
        return response

    def _collect_evidence(self, context_pack: dict[str, Any], paths: list[str]) -> list[dict[str, Any]]:
        evidence: list[dict[str, Any]] = []
        for path in paths:
            try:
                evidence.append(build_evidence(path, context_pack))
            except KeyError:
                continue
        return evidence
