import unittest

from fastapi.testclient import TestClient

import backend.app.main as main_module
from backend.app.analytics_v2.abc_xyz_rules import (
    ABC_CRITERIA_TEXT,
    COMBINED_CRITERIA_TEXT,
    XYZ_CRITERIA_TEXT,
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


class AbcXyzAnalysisEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self._previous_store = main_module.analytics_store
        self.store = AnalyticsMemoryStore()
        main_module.analytics_store = self.store
        self.client = TestClient(main_module.app)

    def tearDown(self) -> None:
        main_module.analytics_store = self._previous_store

    def test_returns_unavailable_when_production_is_missing(self) -> None:
        response = self.client.get("/analytics/abc_xyz")
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(payload["status"], "unavailable")
        self.assertEqual(payload["produtos"], [])
        self.assertIn("producao", payload["limitacoes"][0].lower())
        self.assertIn("indisponivel", payload["limitacoes"][0].lower())

    def test_returns_complete_contract_with_products_and_summary(self) -> None:
        production_rows: list[dict[str, object]] = []
        for month in range(1, 7):
            for sku_index in range(1, 7):
                production_rows.append(
                    {
                        "month": month,
                        "reference_year": 2026,
                        "product_code": f"P{sku_index}",
                        "product_description": f"Produto {sku_index}",
                        "produced_quantity": float(100 * sku_index + month * 3),
                        "customer_code": f"C{(sku_index % 3) + 1}",
                        "customer_name": f"Cliente {(sku_index % 3) + 1}",
                    }
                )

        _register_dataset(self.store, dataset_id="production", rows=production_rows)

        response = self.client.get("/analytics/abc_xyz")
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertIn(payload["status"], {"ready", "partial"})
        self.assertIn("base_utilizada", payload)
        self.assertIn("abrangencia_analise", payload)
        self.assertIn("confiabilidade", payload)
        self.assertIn("criterio_classificacao", payload)
        self.assertIn("indicadores_resumidos", payload)
        self.assertGreater(len(payload["produtos"]), 0)
        self.assertEqual(payload["criterio_classificacao"]["abc"], ABC_CRITERIA_TEXT)
        self.assertEqual(payload["criterio_classificacao"]["xyz"], XYZ_CRITERIA_TEXT)
        self.assertEqual(payload["criterio_classificacao"]["combinada"], COMBINED_CRITERIA_TEXT)
        self.assertIn("Historico de producao", payload["base_utilizada"])

        first_product = payload["produtos"][0]
        self.assertIn("sku", first_product)
        self.assertIn("classe_abc", first_product)
        self.assertIn("classe_xyz", first_product)
        self.assertIn("classe_combinada", first_product)
        self.assertIn("month_values", first_product)

        summary = payload["indicadores_resumidos"]
        self.assertEqual(summary["total_skus"], 6)
        self.assertIn("matriz_abc_xyz", summary)

    def test_marks_partial_for_short_history(self) -> None:
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
                },
                {
                    "month": 2,
                    "reference_year": 2026,
                    "product_code": "P1",
                    "product_description": "Produto 1",
                    "produced_quantity": 118.0,
                },
                {
                    "month": 1,
                    "reference_year": 2026,
                    "product_code": "P2",
                    "product_description": "Produto 2",
                    "produced_quantity": 70.0,
                },
                {
                    "month": 2,
                    "reference_year": 2026,
                    "product_code": "P2",
                    "product_description": "Produto 2",
                    "produced_quantity": 74.0,
                },
            ],
        )

        response = self.client.get("/analytics/abc_xyz")
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(payload["status"], "partial")
        self.assertGreater(len(payload["limitacoes"]), 0)

    def test_reuses_sales_orders_when_customer_signal_is_missing_in_production(self) -> None:
        production_rows: list[dict[str, object]] = []
        sales_rows: list[dict[str, object]] = []
        for month in range(1, 4):
            production_rows.append(
                {
                    "month": month,
                    "reference_year": 2026,
                    "product_code": "P1",
                    "product_description": "Produto 1",
                    "produced_quantity": 100 + month * 5,
                    "customer_code": "",
                    "customer_name": "",
                }
            )
            sales_rows.append(
                {
                    "product_code": "P1",
                    "customer_code": "C1",
                    "customer_name": "Cliente 1",
                    "order_quantity": 120 + month * 2,
                }
            )

        _register_dataset(self.store, dataset_id="production", rows=production_rows)
        _register_dataset(self.store, dataset_id="sales_orders", rows=sales_rows)

        response = self.client.get("/analytics/abc_xyz")
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertIn("Carteira comercial", " ".join(payload["base_utilizada"]))
        self.assertGreater(len(payload["clientes_disponiveis"]), 0)

    def test_parses_textual_months_and_restores_xyz_variability(self) -> None:
        production_rows: list[dict[str, object]] = []
        month_aliases = ["jan", "fev", "mar", "abr", "mai", "jun"]
        stable_profile = [100, 100, 100, 100, 100, 100]
        variable_profile = [10, 200, 20, 220, 30, 210]

        for month, stable_qty, variable_qty in zip(month_aliases, stable_profile, variable_profile, strict=True):
            production_rows.append(
                {
                    "month": month,
                    "reference_year": 2026,
                    "product_code": "P1",
                    "product_description": "Produto Estavel",
                    "produced_quantity": float(stable_qty),
                }
            )
            production_rows.append(
                {
                    "month": month,
                    "reference_year": 2026,
                    "product_code": "P2",
                    "product_description": "Produto Variavel",
                    "produced_quantity": float(variable_qty),
                }
            )

        _register_dataset(self.store, dataset_id="production", rows=production_rows)

        response = self.client.get("/analytics/abc_xyz")
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(payload["abrangencia_analise"]["meses_considerados"], 6)

        products_by_sku = {item["sku"]: item for item in payload["produtos"]}
        self.assertEqual(products_by_sku["P1"]["classe_xyz"], "X")
        self.assertIn(products_by_sku["P2"]["classe_xyz"], {"Y", "Z"})
        self.assertNotIn("sem_periodo", products_by_sku["P1"]["month_values"])
        self.assertIn("2026-01", products_by_sku["P1"]["month_values"])

    def test_flags_mts_mto_as_indicative_when_only_production_is_loaded(self) -> None:
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
                },
                {
                    "month": 2,
                    "reference_year": 2026,
                    "product_code": "P1",
                    "product_description": "Produto 1",
                    "produced_quantity": 132.0,
                },
                {
                    "month": 1,
                    "reference_year": 2026,
                    "product_code": "P2",
                    "product_description": "Produto 2",
                    "produced_quantity": 85.0,
                },
                {
                    "month": 2,
                    "reference_year": 2026,
                    "product_code": "P2",
                    "product_description": "Produto 2",
                    "produced_quantity": 72.0,
                },
            ],
        )

        response = self.client.get("/analytics/abc_xyz")
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        limitations = " ".join(payload["limitacoes"]).lower()
        self.assertIn("mts/mto", limitations)
        self.assertIn("somente na base de producao", limitations)
        self.assertNotIn("carteira comercial", " ".join(payload["base_utilizada"]).lower())


if __name__ == "__main__":
    unittest.main()
