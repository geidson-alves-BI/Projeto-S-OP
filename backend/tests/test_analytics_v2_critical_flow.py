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


class AnalyticsV2CriticalFlowTests(unittest.TestCase):
    def setUp(self) -> None:
        self._previous_main_store = main_module.analytics_store
        self._previous_engine_store = engine_module.analytics_store
        self.store = AnalyticsMemoryStore()
        main_module.analytics_store = self.store
        engine_module.analytics_store = self.store
        self.client = TestClient(main_module.app)

        # Upload (simulado) -> snapshot -> metrics -> scenarios
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
                    "price": 1150.0,
                }
            ],
        )
        _register_dataset(
            self.store,
            dataset_id="bom",
            rows=[
                {
                    "product_code": "P1",
                    "raw_material_code": "RM-01",
                    "raw_material_name": "Materia-prima A",
                    "qty_per_unit": 2.0,
                    "unit_cost": 180.0,
                }
            ],
        )
        _register_dataset(
            self.store,
            dataset_id="raw_material_inventory",
            rows=[
                {
                    "product_code": "RM-01",
                    "product_description": "Materia-prima A",
                    "available_stock": 900.0,
                    "safety_stock": 200.0,
                    "on_order_stock": 120.0,
                    "reorder_point": 180.0,
                    "consumption_30_days": 300.0,
                    "average_consumption_90_days": 900.0,
                    "unit_net_cost_usd": 2.8,
                    "last_entry_unit_net_cost_usd": 2.7,
                }
            ],
        )
        _register_dataset(
            self.store,
            dataset_id="finance_documents",
            rows=[
                {
                    "period": "2026-01",
                    "revenue": 120000.0,
                    "cogs": 72000.0,
                    "material_cost": 43000.0,
                    "conversion_cost": 29000.0,
                    "carrying_cost_rate": 0.16,
                    "usd_brl": 5.2,
                }
            ],
        )

    def tearDown(self) -> None:
        main_module.analytics_store = self._previous_main_store
        engine_module.analytics_store = self._previous_engine_store

    def test_upload_snapshot_metrics_scenarios_flow_contract(self) -> None:
        snapshot_response = self.client.get("/analytics/v2/snapshot")
        self.assertEqual(snapshot_response.status_code, 200)
        snapshot_payload = snapshot_response.json()
        self.assertIn("readiness_v2", snapshot_payload)
        self.assertGreater(len(snapshot_payload["datasets_disponiveis"]), 0)

        metrics_response = self.client.post(
            "/analytics/v2/metrics/compute",
            json={
                "metric_ids": [
                    "projected_revenue",
                    "contribution_margin",
                    "total_working_capital",
                    "demand_vs_operation_gap",
                ],
                "escopo": "global",
                "cenario": "base",
            },
        )
        self.assertEqual(metrics_response.status_code, 200)
        metrics_payload = metrics_response.json()
        self.assertGreaterEqual(len(metrics_payload["metrics"]), 4)
        for metric in metrics_payload["metrics"]:
            self.assertIn("value", metric)
            self.assertIn("base_usada", metric)
            self.assertIn("escopo", metric)
            self.assertIn("confianca", metric)
            self.assertIn("decision_grade", metric)
            self.assertIn("limitations", metric)

        scenarios_response = self.client.get("/analytics/v2/financial_scenarios")
        self.assertEqual(scenarios_response.status_code, 200)
        scenarios_payload = scenarios_response.json()
        self.assertEqual(len(scenarios_payload["scenarios"]), 3)
        base = next(item for item in scenarios_payload["scenarios"] if item["scenario_id"] == "base")
        self.assertIn("revenue", base)
        self.assertIn("contribution_margin", base)
        self.assertIn("total_working_capital", base)
        self.assertIn("delta_vs_base", base)


if __name__ == "__main__":
    unittest.main()
