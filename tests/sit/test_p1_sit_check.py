#!/usr/bin/env python3
"""Tests for P1 SIT summary checking in gray_smoke.py."""

import json
import tempfile
from pathlib import Path

import pytest

# Add tests/gates directory to path for imports
import sys
PROJECT_ROOT = Path(__file__).resolve().parents[2]
gates_dir = str(PROJECT_ROOT / "tests" / "gates")
common_dir = str(PROJECT_ROOT / "tests" / "common")
if gates_dir not in sys.path:
    sys.path.insert(0, gates_dir)
if common_dir not in sys.path:
    sys.path.insert(0, common_dir)

# Mock gate_common if not available
try:
    from gray_smoke import check_p1_sit_status, _check_p1_sit_markdown
except ImportError:
    # Create a minimal gate_common mock
    import types
    gate_common = types.ModuleType('gate_common')
    gate_common.ROOT = PROJECT_ROOT
    gate_common.REPORT_DIR = gate_common.ROOT / "build" / "reports"
    gate_common.sanitize = lambda x: x
    sys.modules['gate_common'] = gate_common
    from gray_smoke import check_p1_sit_status, _check_p1_sit_markdown


class TestCheckP1SitStatus:
    """Test check_p1_sit_status function."""

    def test_summary_json_pass(self, tmp_path):
        """P1 summary.json with PASS and valid_for_p1_signoff=True should PASS."""
        sit_dir = tmp_path / "artifacts" / "p1-sit" / "20260101T000000Z"
        sit_dir.mkdir(parents=True)

        summary = {
            "overall_status": "PASS",
            "pass": 5,
            "fail": 0,
            "pending": 0,
            "allowed_pending": 0,
            "allowed_fail": 0,
            "valid_for_p1_signoff": True,
        }
        (sit_dir / "summary.json").write_text(json.dumps(summary), encoding="utf-8")

        passed, error, report_path = check_p1_sit_status(tmp_path)
        assert passed is True
        assert error is None
        assert report_path.name == "summary.json"

    def test_summary_json_fail(self, tmp_path):
        """P1 summary.json with fail > 0 should FAIL."""
        sit_dir = tmp_path / "artifacts" / "p1-sit" / "20260101T000000Z"
        sit_dir.mkdir(parents=True)

        summary = {
            "overall_status": "FAIL",
            "pass": 4,
            "fail": 1,
            "pending": 0,
            "allowed_pending": 0,
            "allowed_fail": 0,
            "valid_for_p1_signoff": False,
        }
        (sit_dir / "summary.json").write_text(json.dumps(summary), encoding="utf-8")

        passed, error, report_path = check_p1_sit_status(tmp_path)
        assert passed is False
        assert "FAIL" in error
        assert report_path.name == "summary.json"

    def test_summary_json_allowed_pending(self, tmp_path):
        """P1 summary.json with allowed_pending > 0 should FAIL."""
        sit_dir = tmp_path / "artifacts" / "p1-sit" / "20260101T000000Z"
        sit_dir.mkdir(parents=True)

        summary = {
            "overall_status": "FAIL",
            "pass": 4,
            "fail": 0,
            "pending": 0,
            "allowed_pending": 1,
            "allowed_fail": 0,
            "valid_for_p1_signoff": False,
        }
        (sit_dir / "summary.json").write_text(json.dumps(summary), encoding="utf-8")

        passed, error, report_path = check_p1_sit_status(tmp_path)
        assert passed is False
        assert "allowed_pending" in error.lower() or "FAIL" in error

    def test_summary_json_invalid_signoff(self, tmp_path):
        """P1 summary.json with valid_for_p1_signoff=False should FAIL."""
        sit_dir = tmp_path / "artifacts" / "p1-sit" / "20260101T000000Z"
        sit_dir.mkdir(parents=True)

        summary = {
            "overall_status": "PASS",
            "pass": 5,
            "fail": 0,
            "pending": 0,
            "allowed_pending": 0,
            "allowed_fail": 0,
            "valid_for_p1_signoff": False,
        }
        (sit_dir / "summary.json").write_text(json.dumps(summary), encoding="utf-8")

        passed, error, report_path = check_p1_sit_status(tmp_path)
        assert passed is False
        assert "valid_for_p1_signoff" in error.lower()


class TestCheckP1SitMarkdown:
    """Test _check_p1_sit_markdown fallback parsing."""

    def test_markdown_pass(self, tmp_path):
        """summary.md with all pass should PASS."""
        summary_path = tmp_path / "summary.md"
        content = """# P1 SIT Summary

## Status Counts

| status | count |
| --- | ---: |
| pass | 5 |
| fail | 0 |
| pending | 0 |
| allowed-pending | 0 |
| allowed-fail | 0 |

## Steps

| step | status | exit | log |
| --- | --- | ---: | --- |
| test1 | pass | 0 | test.log |
"""
        summary_path.write_text(content, encoding="utf-8")

        passed, error, report_path = _check_p1_sit_markdown(summary_path)
        assert passed is True
        assert error is None

    def test_markdown_fail_with_fail_count(self, tmp_path):
        """summary.md with fail=1 should FAIL even if has PASS text."""
        summary_path = tmp_path / "summary.md"
        content = """# P1 SIT Summary

## Status Counts

| status | count |
| --- | ---: |
| pass | 4 |
| fail | 1 |
| pending | 0 |
| allowed-pending | 0 |
| allowed-fail | 0 |

## Gate Status

P1 SIT GATE: **FAIL**
"""
        summary_path.write_text(content, encoding="utf-8")

        passed, error, report_path = _check_p1_sit_markdown(summary_path)
        assert passed is False
        assert "failure" in error.lower()

    def test_markdown_fail_with_pending(self, tmp_path):
        """summary.md with pending=1 should FAIL."""
        summary_path = tmp_path / "summary.md"
        content = """# P1 SIT Summary

## Status Counts

| status | count |
| --- | ---: |
| pass | 4 |
| fail | 0 |
| pending | 1 |
| allowed-pending | 0 |
| allowed-fail | 0 |
"""
        summary_path.write_text(content, encoding="utf-8")

        passed, error, report_path = _check_p1_sit_markdown(summary_path)
        assert passed is False
        assert "pending" in error.lower()

    def test_markdown_fail_with_allowed_pending(self, tmp_path):
        """summary.md with allowed-pending=1 should FAIL (NOT VALID for sign-off)."""
        summary_path = tmp_path / "summary.md"
        content = """# P1 SIT Summary

## Status Counts

| status | count |
| --- | ---: |
| pass | 4 |
| fail | 0 |
| pending | 0 |
| allowed-pending | 1 |
| allowed-fail | 0 |

> **NOT VALID FOR P1 SIGN-OFF**
"""
        summary_path.write_text(content, encoding="utf-8")

        passed, error, report_path = _check_p1_sit_markdown(summary_path)
        assert passed is False
        assert "allowed-pending" in error.lower()

    def test_markdown_pass_text_but_fail_count(self, tmp_path):
        """summary.md with PASS text but fail > 0 should FAIL."""
        summary_path = tmp_path / "summary.md"
        content = """# P1 SIT Summary

Some text mentioning PASS here.

## Status Counts

| status | count |
| --- | ---: |
| pass | 4 |
| fail | 2 |
| pending | 0 |
| allowed-pending | 0 |
| allowed-fail | 0 |

## Gate Status

This is confusing: P1 SIT GATE: **PASS**
"""
        summary_path.write_text(content, encoding="utf-8")

        passed, error, report_path = _check_p1_sit_markdown(summary_path)
        assert passed is False
        assert "failure" in error.lower()

    def test_markdown_no_pass_count(self, tmp_path):
        """summary.md with pass=0 should FAIL."""
        summary_path = tmp_path / "summary.md"
        content = """# P1 SIT Summary

## Status Counts

| status | count |
| --- | ---: |
| pass | 0 |
| fail | 0 |
| pending | 0 |
| allowed-pending | 0 |
| allowed-fail | 0 |
"""
        summary_path.write_text(content, encoding="utf-8")

        passed, error, report_path = _check_p1_sit_markdown(summary_path)
        assert passed is False
        assert "no passing" in error.lower()


class TestCheckP1SitStatusFallback:
    """Test fallback behavior when summary.json is missing."""

    def test_fallback_to_markdown(self, tmp_path):
        """When summary.json doesn't exist, should fallback to summary.md."""
        sit_dir = tmp_path / "artifacts" / "p1-sit" / "20260101T000000Z"
        sit_dir.mkdir(parents=True)

        # Only create summary.md, no summary.json
        content = """# P1 SIT Summary

## Status Counts

| status | count |
| --- | ---: |
| pass | 5 |
| fail | 0 |
| pending | 0 |
| allowed-pending | 0 |
| allowed-fail | 0 |
"""
        (sit_dir / "summary.md").write_text(content, encoding="utf-8")

        passed, error, report_path = check_p1_sit_status(tmp_path)
        assert passed is True
        assert error is None
        assert report_path.name == "summary.md"

    def test_fallback_markdown_fail(self, tmp_path):
        """Fallback to summary.md with fail > 0 should FAIL."""
        sit_dir = tmp_path / "artifacts" / "p1-sit" / "20260101T000000Z"
        sit_dir.mkdir(parents=True)

        content = """# P1 SIT Summary

## Status Counts

| status | count |
| --- | ---: |
| pass | 4 |
| fail | 1 |
| pending | 0 |
| allowed-pending | 0 |
| allowed-fail | 0 |
"""
        (sit_dir / "summary.md").write_text(content, encoding="utf-8")

        passed, error, report_path = check_p1_sit_status(tmp_path)
        assert passed is False
        assert "failure" in error.lower()

    def test_no_artifacts_dir(self, tmp_path):
        """When artifacts directory doesn't exist, should FAIL."""
        passed, error, report_path = check_p1_sit_status(tmp_path)
        assert passed is False
        assert "not found" in error.lower()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
