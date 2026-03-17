import unittest

from fastapi.testclient import TestClient

import backend.app.analytics_v2.engine as engine_module
import backend.app.main as main_module
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


class AnalyticsV2EndpointsTests(unittest.TestCase):
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
                    "produced_quantity": 100.0,
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
                    "order_quantity": 130.0,
                    "customer_code": "C1",
                    "customer_name": "Cliente 1",
                    "price": 12.0,
                }
            ],
        )

    def tearDown(self) -> None:
        main_module.analytics_store = self._previous_main_store
        engine_module.analytics_store = self._previous_engine_store

    def test_snapshot_endpoint_contract(self) -> None:
        response = self.client.get("/analytics/v2/snapshot")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("datasets_disponiveis", payload)
        self.assertIn("qualidade_por_dataset", payload)
        self.assertIn("metricas_calculaveis", payload)
        self.assertIn("metricas_bloqueadas", payload)
        self.assertIn("readiness_v2", payload)
        self.assertIn("resumo_executivo", payload)
        self.assertIn("engine_version", payload)

    def test_metrics_catalog_endpoint_returns_items(self) -> None:
        response = self.client.get("/analytics/v2/metrics")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("metrics", payload)
        self.assertGreater(len(payload["metrics"]), 0)
        self.assertIn("metric_id", payload["metrics"][0])
        self.assertIn("status", payload["metrics"][0])

    def test_metrics_compute_endpoint_returns_standard_contract(self) -> None:
        response = self.client.post(
            "/analytics/v2/metrics/compute",
            json={
                "metric_ids": ["production_volume", "sales_volume", "demand_vs_operation_gap"],
                "escopo": "global",
                "cenario": "base",
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("metrics", payload)
        self.assertGreater(len(payload["metrics"]), 0)

        metric = payload["metrics"][0]
        required_fields = {
            "value",
            "base_usada",
            "escopo",
            "confianca",
            "decision_grade",
            "missing_data",
            "status",
            "limitations",
            "calculation_method",
        }
        self.assertTrue(required_fields.issubset(metric.keys()))


if __name__ == "__main__":
    unittest.main()
