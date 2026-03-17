import unittest

from backend.app.analytics_v2.dataset_registry import get_dataset_registry_payload


class DatasetRegistryV2Tests(unittest.TestCase):
    def test_registry_contains_required_datasets_and_contract_fields(self) -> None:
        payload = get_dataset_registry_payload()
        self.assertIn("version", payload)
        self.assertIn("datasets", payload)
        self.assertIn("aliases", payload)

        datasets = payload["datasets"]
        dataset_ids = {item["dataset_id"] for item in datasets}
        expected = {
            "production",
            "sales_orders",
            "customers",
            "forecast_input",
            "bom",
            "raw_material_inventory",
            "finance_documents",
        }
        self.assertTrue(expected.issubset(dataset_ids))

        required_fields = {
            "dataset_id",
            "display_name",
            "aliases",
            "required_columns",
            "optional_columns",
            "ideal_columns",
            "granularity",
            "primary_business_keys",
            "date_columns",
            "quality_rules",
            "availability_rules",
            "notes",
        }
        for dataset in datasets:
            self.assertTrue(required_fields.issubset(dataset.keys()))


if __name__ == "__main__":
    unittest.main()
