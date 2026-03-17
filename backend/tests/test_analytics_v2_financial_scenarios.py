import unittest

from fastapi.testclient import TestClient

import backend.app.analytics_v2.engine as engine_module
import backend.app.main as main_module
from backend.app.analytics_v2.financial_scenarios import (
    build_financial_scenarios,
    normalize_scenario_name,
)
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


class FinancialScenariosV2Tests(unittest.TestCase):
    def setUp(self) -> None:
        self._previous_main_store = main_module.analytics_store
        self._previous_engine_store = engine_module.analytics_store
        self.store = AnalyticsMemoryStore()
        main_module.analytics_store = self.store
        engine_module.analytics_store = self.store
        self.client = TestClient(main_module.app)

    def tearDown(self) -> None:
        main_module.analytics_store = self._previous_main_store
        engine_module.analytics_store = self._previous_engine_store

    def _seed_finance_documents(
        self,
        *,
        include_fx: bool = True,
        include_carrying: bool = True,
    ) -> None:
        row: dict[str, object] = {
            "period": "2026-01",
            "revenue": 100000.0,
            "cogs": 62000.0,
            "material_cost": 42000.0,
            "conversion_cost": 20000.0,
        }
        if include_fx:
            row["usd_brl"] = 5.2
        if include_carrying:
            row["carrying_cost_rate"] = 0.16
        _register_dataset(self.store, dataset_id="finance_documents", rows=[row])

    def _required_scenario_fields(self) -> set[str]:
        return {
            "scenario_id",
            "display_name",
            "assumptions",
            "revenue",
            "cogs",
            "contribution_margin",
            "contribution_margin_pct",
            "fg_working_capital",
            "rm_working_capital",
            "total_working_capital",
            "mts_incremental_investment",
            "inventory_carrying_cost",
            "delta_vs_base",
            "confianca",
            "decision_grade",
            "status",
            "missing_data",
            "limitations",
            "calculation_method",
            "base_usada",
            "engine_version",
        }

    def _assert_metric_contract(self, node: dict[str, object]) -> None:
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
            "estimate_type",
        }
        self.assertTrue(required_fields.issubset(node.keys()))

    def test_normalizes_known_scenarios(self) -> None:
        self.assertEqual(normalize_scenario_name("base"), "base")
        self.assertEqual(normalize_scenario_name("conservador"), "conservador")
        self.assertEqual(normalize_scenario_name("agressivo"), "agressivo")
        self.assertEqual(normalize_scenario_name("unknown"), "base")

    def test_builds_three_scenarios_with_delta_vs_base(self) -> None:
        payload = build_financial_scenarios(
            base_revenue=1000.0,
            base_cogs=600.0,
            base_total_working_capital=500.0,
            base_confidence="high",
            base_limitations=[],
        )
        scenarios = payload["scenarios"]
        self.assertIn("base", scenarios)
        self.assertIn("conservador", scenarios)
        self.assertIn("agressivo", scenarios)

        base = scenarios["base"]
        conservative = scenarios["conservador"]
        aggressive = scenarios["agressivo"]

        self.assertAlmostEqual(base["delta_vs_base"]["contribution_margin"], 0.0, places=6)
        self.assertLess(conservative["projected_revenue"], base["projected_revenue"])
        self.assertGreater(aggressive["projected_revenue"], base["projected_revenue"])
        self.assertIn("confianca", conservative)
        self.assertIn("limitations", aggressive)
        self.assertIn("mts_incremental_investment", base)

    def test_endpoint_returns_three_scenarios_with_required_contract(self) -> None:
        self._seed_finance_documents()
        response = self.client.get("/analytics/v2/financial_scenarios")
        self.assertEqual(response.status_code, 200)

        payload = response.json()
        self.assertIn("scenarios", payload)
        scenarios = payload["scenarios"]
        self.assertEqual(len(scenarios), 3)
        scenario_ids = {item["scenario_id"] for item in scenarios}
        self.assertTrue({"base", "conservador", "agressivo"}.issubset(scenario_ids))

        for scenario in scenarios:
            self.assertTrue(self._required_scenario_fields().issubset(scenario.keys()))
            self._assert_metric_contract(scenario["revenue"])
            self._assert_metric_contract(scenario["cogs"])
            self._assert_metric_contract(scenario["contribution_margin"])
            self._assert_metric_contract(scenario["contribution_margin_pct"])
            self._assert_metric_contract(scenario["fg_working_capital"])
            self._assert_metric_contract(scenario["rm_working_capital"])
            self._assert_metric_contract(scenario["total_working_capital"])
            self._assert_metric_contract(scenario["mts_incremental_investment"])
            self._assert_metric_contract(scenario["inventory_carrying_cost"])
            self.assertIn("scenario_delta_financial", scenario["delta_vs_base"])
            self.assertIn("breakdown", scenario["delta_vs_base"])

    def test_scenario_with_finance_documents_only(self) -> None:
        self._seed_finance_documents(include_fx=False, include_carrying=False)
        response = self.client.get("/analytics/v2/financial_scenarios")
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        base = next(item for item in payload["scenarios"] if item["scenario_id"] == "base")
        self.assertEqual(base["status"], "partial")
        self.assertIn("fx_rate", base["missing_data"])
        self.assertIn("carrying_cost_rate", base["missing_data"])
        self.assertEqual(base["revenue"]["estimate_type"], "documented")
        self.assertIn(base["cogs"]["estimate_type"], {"documented", "hybrid"})

    def test_scenario_with_finance_documents_and_raw_material_inventory(self) -> None:
        self._seed_finance_documents()
        _register_dataset(
            self.store,
            dataset_id="raw_material_inventory",
            rows=[
                {
                    "product_code": "RM-01",
                    "product_description": "Materia prima A",
                    "available_stock": 1000.0,
                    "safety_stock": 200.0,
                    "on_order_stock": 100.0,
                    "reorder_point": 180.0,
                    "consumption_30_days": 300.0,
                    "average_consumption_90_days": 900.0,
                    "unit_net_cost_usd": 2.5,
                    "last_entry_unit_net_cost_usd": 2.4,
                }
            ],
        )

        response = self.client.get("/analytics/v2/financial_scenarios")
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        base = next(item for item in payload["scenarios"] if item["scenario_id"] == "base")
        self.assertIn("raw_material_inventory", base["base_usada"])
        self.assertIn(base["rm_working_capital"]["status"], {"ready", "partial"})
        self.assertIn(base["rm_working_capital"]["estimate_type"], {"documented", "hybrid"})

    def test_full_scenario_supports_financial_metrics(self) -> None:
        self._seed_finance_documents()
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
                    "order_quantity": 140.0,
                    "customer_code": "C1",
                    "customer_name": "Cliente 1",
                    "price": 1100.0,
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
                    "raw_material_name": "Materia prima A",
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
                    "product_description": "Materia prima A",
                    "available_stock": 1000.0,
                    "safety_stock": 200.0,
                    "on_order_stock": 100.0,
                    "reorder_point": 180.0,
                    "consumption_30_days": 300.0,
                    "average_consumption_90_days": 900.0,
                    "unit_net_cost_usd": 2.5,
                    "last_entry_unit_net_cost_usd": 2.4,
                }
            ],
        )

        response = self.client.get("/analytics/v2/financial_scenarios")
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        base = next(item for item in payload["scenarios"] if item["scenario_id"] == "base")
        self.assertGreater(base["mts_incremental_investment"]["value"], 0.0)
        self.assertIn("components", base["cogs"])
        self.assertIn("material_cost", base["cogs"]["components"])
        self.assertIn("conversion_cost", base["cogs"]["components"])
        self.assertIn("estimated_cogs", base["cogs"]["components"])

    def test_missing_data_returns_partial_and_real_limitations(self) -> None:
        _register_dataset(
            self.store,
            dataset_id="finance_documents",
            rows=[{"period": "2026-01"}],
            availability_status="partial",
            validation_status="partial",
        )
        response = self.client.get("/analytics/v2/financial_scenarios")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        base = next(item for item in payload["scenarios"] if item["scenario_id"] == "base")

        self.assertEqual(base["status"], "partial")
        self.assertGreater(len(base["missing_data"]), 0)
        self.assertGreater(len(base["limitations"]), 0)
        self.assertEqual(base["revenue"]["status"], "partial")

    def test_transparency_for_assumptions_limitations_and_estimate_type(self) -> None:
        self._seed_finance_documents()
        response = self.client.get("/analytics/v2/financial_scenarios")
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        for scenario in payload["scenarios"]:
            assumptions = scenario["assumptions"]
            self.assertIn("revenue_factor", assumptions)
            self.assertIn("demand_factor", assumptions)
            self.assertIn("inventory_coverage_factor", assumptions)
            self.assertIn("carrying_cost_rate", assumptions)
            self.assertIn("safety_factor", assumptions)
            self.assertIn("notes", assumptions)

            self.assertIsInstance(scenario["limitations"], list)
            self.assertTrue(scenario["calculation_method"])
            for metric_key in [
                "revenue",
                "cogs",
                "contribution_margin",
                "contribution_margin_pct",
                "fg_working_capital",
                "rm_working_capital",
                "total_working_capital",
                "mts_incremental_investment",
                "inventory_carrying_cost",
            ]:
                self.assertIn("estimate_type", scenario[metric_key])
                self.assertIn(
                    scenario[metric_key]["estimate_type"],
                    {"documented", "estimated", "hybrid"},
                )


if __name__ == "__main__":
    unittest.main()
