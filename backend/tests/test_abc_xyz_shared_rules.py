import unittest

import pandas as pd

from backend.app.abcxyz import compute_abcxyz
from backend.app.analytics_v2.abc_xyz_rules import classify_abc, classify_xyz


class AbcXyzSharedRulesTests(unittest.TestCase):
    def test_classify_abc_thresholds(self) -> None:
        self.assertEqual(classify_abc(0.80), "A")
        self.assertEqual(classify_abc(0.95), "B")
        self.assertEqual(classify_abc(0.951), "C")

    def test_classify_xyz_thresholds(self) -> None:
        self.assertEqual(classify_xyz(0.50), "X")
        self.assertEqual(classify_xyz(1.00), "Y")
        self.assertEqual(classify_xyz(1.01), "Z")

    def test_legacy_compute_endpoint_logic_uses_same_xyz_thresholds(self) -> None:
        df = pd.DataFrame(
            [
                {"sku": "S1", "qty": 100, "cost": 1},
                {"sku": "S1", "qty": 100, "cost": 1},
                {"sku": "S1", "qty": 100, "cost": 1},
                {"sku": "S2", "qty": 0, "cost": 1},
                {"sku": "S2", "qty": 100, "cost": 1},
                {"sku": "S2", "qty": 200, "cost": 1},
                {"sku": "S3", "qty": 0, "cost": 1},
                {"sku": "S3", "qty": 100, "cost": 1},
                {"sku": "S3", "qty": 300, "cost": 1},
            ]
        )

        output = compute_abcxyz(df, "sku", "qty", "cost")
        xyz_by_sku = dict(zip(output["sku"], output["xyz"]))

        self.assertEqual(xyz_by_sku["S1"], "X")
        self.assertEqual(xyz_by_sku["S2"], "Y")
        self.assertEqual(xyz_by_sku["S3"], "Z")


if __name__ == "__main__":
    unittest.main()
