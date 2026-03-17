import unittest

from backend.app.analytics_v2.metric_registry import get_metric_registry_payload


class MetricRegistryV2Tests(unittest.TestCase):
    def test_registry_groups_and_key_metrics_exist(self) -> None:
        payload = get_metric_registry_payload()
        self.assertIn("version", payload)
        self.assertIn("metrics", payload)

        metrics = payload["metrics"]
        metric_ids = {item["metric_id"] for item in metrics}
        categories = {item["category"] for item in metrics}

        self.assertTrue(
            {"operacional", "comercial", "sop_integrado", "supply", "financeiro_executivo"}.issubset(
                categories
            )
        )

        expected_metric_ids = {
            "production_volume",
            "sales_volume",
            "demand_vs_operation_gap",
            "raw_material_coverage",
            "projected_revenue",
            "scenario_delta_financial",
        }
        self.assertTrue(expected_metric_ids.issubset(metric_ids))

    def test_metric_contract_fields_are_present(self) -> None:
        payload = get_metric_registry_payload()
        metric = payload["metrics"][0]
        required_fields = {
            "metric_id",
            "display_name",
            "category",
            "executive_description",
            "minimum_datasets",
            "ideal_datasets",
            "minimum_fields",
            "supported_scopes",
            "formula_engine",
            "fallback_strategy",
            "blockers",
            "confidence_rule",
            "decision_grade_rule",
            "output_unit",
            "output_format",
            "missing_data_message",
        }
        self.assertTrue(required_fields.issubset(metric.keys()))


if __name__ == "__main__":
    unittest.main()
