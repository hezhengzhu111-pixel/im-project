from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

import check_test_manifest
import test_inventory


class ManifestEvidenceTest(unittest.TestCase):
    def test_public_api_missing_fails_manifest(self) -> None:
        errors = check_test_manifest.check_manifest(
            {
                "public_api": [
                    {
                        "kind": "public_api",
                        "name": "ImportantApi.doThing",
                        "file": "lib/important_api.dart",
                        "category": "flutter_public",
                        "status": "missing",
                    }
                ]
            }
        )

        self.assertTrue(any("public_api: missing ImportantApi.doThing" in error for error in errors))

    def test_endpoint_method_name_only_is_not_covered(self) -> None:
        index = [(Path("api_endpoints_test.dart"), "test('mentions member', () { recall; });")]

        self.assertEqual(
            test_inventory.has_endpoint_const_evidence(
                "MessageEndpoints",
                "recall",
                "/api/message/recall",
                index,
            ),
            ("", ""),
        )

    def test_endpoint_metadata_counts_as_covered(self) -> None:
        index = [
            (
                Path("some_test.dart"),
                "@coversEndpoint('MessageEndpoints.recall')\n"
                "test('metadata coverage', () { expect(true, isTrue); });",
            )
        ]

        self.assertEqual(
            test_inventory.has_endpoint_const_evidence(
                "MessageEndpoints",
                "recall",
                "/api/message/recall",
                index,
            )[0],
            "some_test.dart",
        )

    def test_route_tests_text_without_route_is_not_covered(self) -> None:
        index = [(Path("mobile_route_test.dart"), "test('route tests', () {});")]

        self.assertEqual(test_inventory.has_route_evidence("mobile", "/contacts/add", index), ("", ""))

    def test_route_metadata_counts_as_covered(self) -> None:
        index = [(Path("route_test.dart"), "@coversRoute('mobile:/contacts/add')\n")]

        self.assertEqual(test_inventory.has_route_evidence("mobile", "/contacts/add", index)[0], "route_test.dart")

    def test_symbol_metadata_counts_as_covered(self) -> None:
        index = [(Path("api_test.dart"), "@coversSymbol('sendPrivateMessage')\n")]

        self.assertEqual(
            test_inventory.has_symbol_evidence("sendPrivateMessage", Path("message_api.dart"), "MessageApi", index)[0],
            "api_test.dart",
        )

class CoverageBaselineReportTest(unittest.TestCase):
    def test_flutter_baseline_creation_summary_is_explicit(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            summary_path = Path(temp_dir) / "summary.md"
            summary = {
                "overall": {
                    "line_hit": 1,
                    "line_found": 10,
                    "line_percent": 10.0,
                    "threshold": 70.0,
                    "target_passed": False,
                    "baseline_passed": True,
                    "gate_passed": True,
                    "mode": "baseline",
                    "baseline_created": True,
                }
            }

            test_inventory_path = Path(__file__).resolve().parent / "coverage" / "flutter_coverage.py"
            spec = importlib.util.spec_from_file_location("flutter_coverage_under_test", test_inventory_path)
            assert spec is not None and spec.loader is not None
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            module.write_summary_md(summary, summary_path)

            text = summary_path.read_text(encoding="utf-8")
            self.assertIn("BASELINE CREATED: this does not mean target threshold was met.", text)
            self.assertIn("target_passed", text)
            self.assertIn("baseline_passed", text)
            self.assertIn("gate_passed", text)
            self.assertIn("baseline", text)


if __name__ == "__main__":
    unittest.main()
