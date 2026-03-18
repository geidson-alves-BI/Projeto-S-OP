import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import backend.app.analytics_v2.engine as engine_module
import backend.app.ai.ai_service as ai_service_module
import backend.app.main as main_module
from backend.app.ai.ai_service import ai_service
from backend.app.ai.config_store import AIConfigSnapshot, FALLBACK_MODEL_NAME
from backend.app.memory_store import AnalyticsMemoryStore


def _register_dataset(
    store: AnalyticsMemoryStore,
    *,
    dataset_id: str,
    rows: list[dict[str, object]],
    availability_status: str = "ready",
    validation_status: str = "valid",
) -> None:
    store.set_dataset_rows(dataset_id, rows)
    store.record_dataset_upload(
        dataset_id,
        filename=f"{dataset_id}.csv",
        file_format=".csv",
        validation_status=validation_status,
        availability_status=availability_status,
        row_count=len(rows),
        column_count=len(rows[0].keys()) if rows else 0,
        columns_detected=list(rows[0].keys()) if rows else [],
        notes="seed test",
    )


def _build_planning_payload(*, base_forecast: float, final_forecast: float, growth_impact_pct: float) -> dict[str, object]:
    return {
        "generated_at": "2026-03-17T00:00:00+00:00",
        "scenario_name": "Cenario principal",
        "method_selection_mode": "auto",
        "selected_method": "moving_average",
        "recommended_method": "moving_average",
        "method_metrics": {
            "moving_average": {
                "mape": 18.5,
                "mae": 12.0,
                "rmse": 22.0,
                "bias": 1.2,
                "support": 24,
            }
        },
        "forecast_confidence": {"score": 0.72, "percent": 72.0, "label": "moderada"},
        "totals": {
            "base_forecast": base_forecast,
            "final_forecast": final_forecast,
            "growth_impact_pct": growth_impact_pct,
            "estimated_revenue": 650000.0,
            "projected_purchase_value_usd": 8400.0,
        },
        "filters_applied": {
            "effective_period_start": "2025-01-01",
            "effective_period_end": "2025-12-31",
            "product_codes": [],
            "customer_codes": [],
            "product_groups": [],
            "abc_classes": [],
        },
        "growth_parameters": {
            "global_pct": 5.0,
            "by_product": {},
            "by_customer": {},
            "by_group": {},
            "by_class": {},
        },
        "forecast_visual": {
            "forecast_monthly": [
                {"period": "2026-01", "forecast_adjusted": 120.0},
                {"period": "2026-02", "forecast_adjusted": 130.0},
            ]
        },
        "summary_by_product": [
            {
                "product_code": "P1",
                "base_forecast": max(base_forecast, 1.0),
                "final_forecast": final_forecast,
                "growth_impact_pct": growth_impact_pct,
                "forecast_confidence": 0.72,
                "estimated_revenue": 650000.0,
                "product_group": "Bebidas",
                "abc_class": "A",
            }
        ],
        "summary_by_customer": [
            {
                "customer_code": "C1",
                "customer_name": "Cliente 1",
                "customer_label": "C1 - Cliente 1",
                "base_forecast": max(base_forecast, 1.0),
                "final_forecast": final_forecast,
                "growth_impact_pct": growth_impact_pct,
                "forecast_confidence": 0.72,
            }
        ],
        "summary_by_group": [
            {
                "product_group": "Bebidas",
                "base_forecast": max(base_forecast, 1.0),
                "final_forecast": final_forecast,
                "growth_impact_pct": growth_impact_pct,
                "forecast_confidence": 0.72,
            }
        ],
        "summary_by_class": [
            {
                "abc_class": "A",
                "base_forecast": max(base_forecast, 1.0),
                "final_forecast": final_forecast,
                "growth_impact_pct": growth_impact_pct,
                "forecast_confidence": 0.72,
            }
        ],
        "summary_by_group_customer": [],
        "mts_mtu_scenarios": [],
        "risk_scoring": {
            "top_risks": [
                {
                    "group": "Bebidas",
                    "abc_class": "A",
                    "score": 81.2,
                    "risk_level_label": "critico",
                    "primary_driver_label": "Crescimento projetado",
                    "forecast": final_forecast,
                    "growth_impact_pct": growth_impact_pct,
                },
                {
                    "group": "Sobremesas",
                    "abc_class": "B",
                    "score": 69.5,
                    "risk_level_label": "alto",
                    "primary_driver_label": "Cobertura de estoque",
                    "forecast": 90.0,
                    "growth_impact_pct": 4.5,
                },
                {
                    "group": "Sazonais",
                    "abc_class": "A",
                    "score": 62.1,
                    "risk_level_label": "alto",
                    "primary_driver_label": "Confianca de forecast",
                    "forecast": 70.0,
                    "growth_impact_pct": 3.2,
                },
            ],
            "data_limitations": [],
        },
        "risk_alerts": {
            "rupture_risk_count": 2,
            "excess_risk_count": 1,
            "missing_stock_count": 1,
            "total_products_evaluated": 3,
        },
        "data_warnings": [],
    }


class ExecutiveChatTemplateTests(unittest.TestCase):
    def setUp(self) -> None:
        self._previous_main_store = main_module.analytics_store
        self._previous_engine_store = engine_module.analytics_store
        self._previous_ai_service_store = ai_service_module.analytics_store
        self.store = AnalyticsMemoryStore()
        main_module.analytics_store = self.store
        engine_module.analytics_store = self.store
        ai_service_module.analytics_store = self.store
        self.client = TestClient(main_module.app)

        _register_dataset(
            self.store,
            dataset_id="production",
            rows=[
                {
                    "month": 1,
                    "reference_year": 2026,
                    "product_code": "P1",
                    "product_description": "Produto 1",
                    "produced_quantity": 120.0,
                }
            ],
        )
        _register_dataset(
            self.store,
            dataset_id="sales_orders",
            rows=[
                {
                    "product_code": "P1",
                    "order_date": "2026-01-15",
                    "order_quantity": 100.0,
                    "customer_code": "C1",
                    "customer_name": "Cliente 1",
                    "price": 11.0,
                    "product_group": "Bebidas",
                    "abc_class": "A",
                }
            ],
        )
        _register_dataset(
            self.store,
            dataset_id="customers",
            rows=[
                {
                    "product_code": "P1",
                    "customer_code": "C1",
                    "customer_name": "Cliente 1",
                    "product_group": "Bebidas",
                    "abc_class": "A",
                }
            ],
        )
        _register_dataset(
            self.store,
            dataset_id="raw_material_inventory",
            rows=[
                {
                    "product_code": "MP1",
                    "product_description": "Materia prima 1",
                    "available_stock": 200.0,
                    "safety_stock": 80.0,
                    "on_order_stock": 30.0,
                    "reorder_point": 90.0,
                    "consumption_30_days": 120.0,
                    "average_consumption_90_days": 300.0,
                    "unit_net_cost_usd": 1.8,
                    "last_entry_unit_net_cost_usd": 1.7,
                }
            ],
        )
        _register_dataset(
            self.store,
            dataset_id="bom",
            rows=[
                {
                    "product_code": "P1",
                    "raw_material_code": "MP1",
                    "qty_per_unit": 1.0,
                    "unit_cost": 2.3,
                }
            ],
        )
        _register_dataset(
            self.store,
            dataset_id="finance_documents",
            rows=[
                {
                    "period": "2026-01",
                    "revenue": 500000.0,
                    "cogs": 320000.0,
                    "carrying_cost_rate": 0.18,
                }
            ],
            availability_status="ready",
            validation_status="valid",
        )

    def tearDown(self) -> None:
        main_module.analytics_store = self._previous_main_store
        engine_module.analytics_store = self._previous_engine_store
        ai_service_module.analytics_store = self._previous_ai_service_store

    def _post_chat(self, message: str) -> dict[str, object]:
        response = self.client.post(
            "/ai/executive_chat",
            json={
                "message": message,
                "history": [],
                "include_planning_context": True,
                "mode": "short",
            },
        )
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_response_contains_mandatory_executive_blocks(self) -> None:
        self.store.set_planning_production_result(
            _build_planning_payload(base_forecast=120.0, final_forecast=132.0, growth_impact_pct=10.0)
        )
        payload = self._post_chat("Qual o resumo executivo do cenario?")

        blocks = payload["blocks"]
        self.assertIn("executive_summary", blocks)
        self.assertIn("analysis_context", blocks)
        self.assertIn("principal_risks", blocks)
        self.assertIn("financial_impact", blocks)
        self.assertIn("executive_recommendation", blocks)
        self.assertIn("confidence_explainer", blocks)
        self.assertIn("next_steps", blocks)

        answer = str(payload["answer"])
        self.assertIn("1. Resumo Executivo", answer)
        self.assertIn("2. Contexto da Analise", answer)
        self.assertIn("3. Principais Riscos", answer)
        self.assertIn("4. Impacto Financeiro", answer)
        self.assertIn("5. Recomendacao Executiva", answer)
        self.assertIn("6. Confianca da Resposta", answer)
        self.assertIn("7. Proximos Passos", answer)

    def test_growth_is_not_reported_as_zero_when_base_is_missing(self) -> None:
        self.store.set_planning_production_result(
            _build_planning_payload(base_forecast=0.0, final_forecast=132.0, growth_impact_pct=0.0)
        )
        payload = self._post_chat("Me de o cenario executivo atual")

        answer = str(payload["answer"])
        self.assertIn("crescimento N/A", answer)
        self.assertIn("Nao ha base historica suficiente para calcular crescimento.", answer)
        self.assertNotIn("crescimento 0.00%", answer)

    def test_fallback_is_transparent_and_confidence_is_explained(self) -> None:
        self.store.set_planning_production_result(
            _build_planning_payload(base_forecast=120.0, final_forecast=132.0, growth_impact_pct=10.0)
        )
        deterministic_snapshot = AIConfigSnapshot(
            provider="deterministic",
            provider_active="deterministic",
            model="gpt-4o-mini",
            model_active=FALLBACK_MODEL_NAME,
            api_key="",
            has_api_key=False,
            api_key_masked=None,
            using_environment_key=False,
            last_tested_at=None,
            last_test_status=None,
            last_test_message=None,
        )
        with patch.object(ai_service.config_store, "get_snapshot", return_value=deterministic_snapshot):
            payload = self._post_chat("Quais as recomendacoes executivas?")

        execution_meta = payload["execution_meta"]
        self.assertIn("fallback_reason", execution_meta)
        self.assertEqual(execution_meta["fallback_reason"], "fallback_only")
        self.assertIn("parsing_warnings", execution_meta)

        confidence_explainer = payload["blocks"]["confidence_explainer"]
        self.assertIn("score", confidence_explainer)
        self.assertIn("fatores_positivos", confidence_explainer)
        self.assertIn("fatores_negativos", confidence_explainer)
        self.assertIn("dados_faltantes", confidence_explainer)
        self.assertIn("fallback_reason", confidence_explainer)
        self.assertIn("impacto_na_decisao", confidence_explainer)
        self.assertTrue(str(confidence_explainer["fallback_reason"]).strip())

        recommendations = payload["blocks"]["executive_recommendation"]
        self.assertGreaterEqual(len(recommendations), 1)
        self.assertTrue(any("Acao:" in str(item) for item in recommendations))
        self.assertTrue(any("Prioridade:" in str(item) for item in recommendations))
        self.assertTrue(any("Impacto esperado:" in str(item) for item in recommendations))


if __name__ == "__main__":
    unittest.main()
