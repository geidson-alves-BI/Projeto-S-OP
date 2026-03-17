import unittest

import backend.app.analytics_v2.engine as engine_module
from backend.app.analytics_v2.engine import AnalyticsEngineV2
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


class AnalyticsEngineV2AvailabilityTests(unittest.TestCase):
    def setUp(self) -> None:
        self._previous_store = engine_module.analytics_store
        self.store = AnalyticsMemoryStore()
        engine_module.analytics_store = self.store
        self.engine = AnalyticsEngineV2()

    def tearDown(self) -> None:
        engine_module.analytics_store = self._previous_store

    def test_only_production_makes_operational_metric_ready_and_commercial_unavailable(self) -> None:
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
                },
                {
                    "month": 2,
                    "reference_year": 2026,
                    "product_code": "P1",
                    "product_description": "Produto 1",
                    "produced_quantity": 120.0,
                },
            ],
        )

        result = self.engine.compute_metrics(
            metric_ids=["production_volume", "sales_volume", "demand_vs_operation_gap"]
        )
        by_id = {item["metric_id"]: item for item in result["metrics"]}

        self.assertEqual(by_id["production_volume"]["status"], "ready")
        self.assertEqual(by_id["sales_volume"]["status"], "unavailable")
        self.assertEqual(by_id["demand_vs_operation_gap"]["status"], "unavailable")

    def test_production_plus_sales_enables_integrated_metrics(self) -> None:
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
                    "price": 10.0,
                }
            ],
        )

        result = self.engine.compute_metrics(
            metric_ids=["demand_vs_operation_gap", "service_risk", "mts_mto_recommendation"]
        )
        by_id = {item["metric_id"]: item for item in result["metrics"]}
        self.assertIn(by_id["demand_vs_operation_gap"]["status"], {"ready", "partial"})
        self.assertIn(by_id["service_risk"]["status"], {"ready", "partial"})
        self.assertIn(by_id["mts_mto_recommendation"]["status"], {"ready", "partial"})

    def test_full_stack_with_finance_returns_v2_contract_fields(self) -> None:
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
        _register_dataset(
            self.store,
            dataset_id="bom",
            rows=[
                {
                    "product_code": "P1",
                    "raw_material_code": "RM1",
                    "raw_material_name": "Materia 1",
                    "qty_per_unit": 2.0,
                    "unit_cost": 1.5,
                }
            ],
        )
        _register_dataset(
            self.store,
            dataset_id="raw_material_inventory",
            rows=[
                {
                    "product_code": "RM1",
                    "product_description": "Materia 1",
                    "available_stock": 500.0,
                    "safety_stock": 100.0,
                    "on_order_stock": 30.0,
                    "reorder_point": 80.0,
                    "consumption_30_days": 120.0,
                    "average_consumption_90_days": 360.0,
                    "unit_net_cost_usd": 2.0,
                }
            ],
        )
        _register_dataset(
            self.store,
            dataset_id="finance_documents",
            rows=[
                {
                    "period": "2026-01",
                    "revenue": 5000.0,
                    "cogs": 2800.0,
                }
            ],
        )

        result = self.engine.compute_metrics(
            metric_ids=["projected_revenue", "contribution_margin", "total_working_capital"]
        )
        metric = result["metrics"][0]
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
        self.assertIn(metric["status"], {"ready", "partial"})


if __name__ == "__main__":
    unittest.main()
