import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import backend.app.analytics_v2.engine as engine_module
import backend.app.main as main_module
from backend.app.ai.ai_service import ai_service
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


class ExecutiveChatFactualV2Tests(unittest.TestCase):
    def setUp(self) -> None:
        self._previous_main_store = main_module.analytics_store
        self._previous_engine_store = engine_module.analytics_store
        self.store = AnalyticsMemoryStore()
        main_module.analytics_store = self.store
        engine_module.analytics_store = self.store
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
                }
            ],
        )

    def tearDown(self) -> None:
        main_module.analytics_store = self._previous_main_store
        engine_module.analytics_store = self._previous_engine_store

    def test_factual_chat_uses_analytics_v2_metric_compute(self) -> None:
        response = self.client.post(
            "/ai/executive_chat",
            json={
                "message": "Qual o total produzido do SKU P1?",
                "history": [],
                "include_planning_context": True,
                "mode": "short",
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        context_used = payload["context_used"]
        self.assertEqual(context_used["query_mode"], "factual")
        self.assertEqual(context_used["execution"]["provider_used"], "analytics_v2")
        self.assertEqual(context_used["execution"]["model_used"], "analytics_v2_metrics_compute")

        factual_v2 = context_used["factual_v2"]
        self.assertIn("production_volume", factual_v2["metric_ids_requested"])
        self.assertEqual(factual_v2["escopo"], "product")

        evidence = payload["blocks"]["evidence"]
        joined_evidence = " | ".join(evidence)
        self.assertIn("valor:", joined_evidence)
        self.assertIn("base_usada:", joined_evidence)
        self.assertIn("escopo:", joined_evidence)
        self.assertIn("confianca:", joined_evidence)
        self.assertIn("decision_grade:", joined_evidence)

    def test_factual_chat_fallback_when_metric_is_not_returned(self) -> None:
        with patch.object(
            ai_service,
            "_resolve_factual_metric_ids",
            return_value=["metric_inexistente_v2"],
        ):
            response = self.client.post(
                "/ai/executive_chat",
                json={
                    "message": "Qual o total produzido do SKU P1?",
                    "history": [],
                    "include_planning_context": True,
                    "mode": "short",
                },
            )
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertTrue(payload["partial"])
        self.assertTrue(
            any("Metricas v2 nao retornadas" in item for item in payload["limitations"])
        )
        factual_v2 = payload["context_used"]["factual_v2"]
        self.assertIn("metric_inexistente_v2", factual_v2["metric_ids_missing"])


if __name__ == "__main__":
    unittest.main()
