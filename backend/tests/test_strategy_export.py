import unittest

from fastapi.testclient import TestClient

import backend.app.main as main_module
from backend.app.memory_store import AnalyticsMemoryStore


class StrategyExportContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self._previous_store = main_module.analytics_store
        main_module.analytics_store = AnalyticsMemoryStore()
        self.client = TestClient(main_module.app)

    def tearDown(self) -> None:
        main_module.analytics_store = self._previous_store

    @staticmethod
    def _rows() -> list[dict[str, object]]:
        return [
            {
                "product_code": "P1",
                "product_name": "Produto 1",
                "sales": 100,
            },
            {
                "product_code": "P2",
                "product_name": "Produto 2",
                "sales": 80,
            },
            {
                "product_code": "P1",
                "product_name": "Produto 1",
                "sales": 20,
            },
        ]

    def test_accepts_file_format_in_body_and_exports_csv(self) -> None:
        response = self.client.post(
            "/analytics/export_strategy_report",
            json={
                "rows": self._rows(),
                "file_format": "csv",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn('attachment; filename="strategy_report.csv"', response.headers.get("content-disposition", ""))
        self.assertIn("product_code", response.text)
        self.assertIn("recommended_strategy", response.text)

    def test_accepts_legacy_query_file_format_for_backward_compatibility(self) -> None:
        response = self.client.post(
            "/analytics/export_strategy_report?file_format=xlsx",
            json={"rows": self._rows()},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers.get("content-type"),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertIn('attachment; filename="strategy_report.xlsx"', response.headers.get("content-disposition", ""))
        self.assertGreater(len(response.content), 50)

    def test_rejects_empty_rows_with_clear_message(self) -> None:
        response = self.client.post(
            "/analytics/export_strategy_report",
            json={
                "rows": [],
                "file_format": "pdf",
            },
        )

        self.assertEqual(response.status_code, 400)
        payload = response.json()
        self.assertIn("rows must contain at least one record", payload.get("detail", ""))
        self.assertIn("file_format", payload.get("detail", ""))


if __name__ == "__main__":
    unittest.main()
