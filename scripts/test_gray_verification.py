#!/usr/bin/env python3
"""Tests for gray release verification scripts."""

import json
import os
import subprocess
import sys
from pathlib import Path

# Add scripts directory to path
SCRIPTS_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPTS_DIR))


def test_test_py_no_empty_args():
    """Test that test.py gray-signoff doesn't pass empty strings."""
    print("\n==> Test: test.py gray-signoff no empty args")

    # Read the source code
    test_py = SCRIPTS_DIR / "test.py"
    content = test_py.read_text(encoding="utf-8")

    # Check for problematic pattern
    if '"--continue-on-error" if args.continue_on_error else ""' in content:
        print("  FAIL: Found problematic empty string pattern")
        return False

    # Check for proper conditional append
    if 'if args.continue_on_error:' in content and 'cmd.append("--continue-on-error")' in content:
        print("  PASS: Proper conditional append found")
    else:
        print("  FAIL: Could not verify fix")
        return False

    # Check gray-release passes --base-url and --db-url
    if 'args.command == "gray-release"' in content:
        if '--base-url", args.api_base' in content and '--db-url", args.db_url' in content:
            print("  PASS: gray-release passes --base-url and --db-url")
        else:
            print("  FAIL: gray-release doesn't pass parameters")
            return False

    # Check --base-url is alias for --api-base
    if '"--api-base", "--base-url"' in content:
        print("  PASS: --base-url is alias for --api-base")
    else:
        print("  FAIL: --base-url alias not found")
        return False

    return True


def test_gray_gate_final_report_timing():
    """Test that gray_gate.py doesn't read gray-gate-report.json before it's generated."""
    print("\n==> Test: gray_gate.py final report timing")

    gray_gate = SCRIPTS_DIR / "gray_gate.py"
    content = gray_gate.read_text(encoding="utf-8")

    # Check that gray_signoff doesn't have a final report step
    if 'Step 9: Generate final report' in content:
        print("  FAIL: gray_signoff still has final report step")
        return False

    # Check that final report is generated after write_gate_reports
    if 'write_gate_reports' in content and 'finalize' in content:
        # Verify the order: write_gate_reports first, then finalize
        write_pos = content.find('write_gate_reports')
        finalize_pos = content.find('"finalize"')
        if write_pos < finalize_pos:
            print("  PASS: Final report generated after gate report")
            return True

    print("  FAIL: Could not verify fix")
    return False


def test_infer_gate_status():
    """Test infer_gate_status function."""
    print("\n==> Test: infer_gate_status")

    from gray_report import infer_gate_status

    # Test empty summary
    assert infer_gate_status({}) == "NOT RUN"
    assert infer_gate_status(None) == "NOT RUN"

    # Test PASS
    assert infer_gate_status({"summary": {"pass": 10, "fail": 0, "skip": 0}}) == "PASS"

    # Test FAIL
    assert infer_gate_status({"summary": {"pass": 5, "fail": 2, "skip": 0}}) == "FAIL"

    # Test WARN (non-critical skip)
    assert infer_gate_status({
        "summary": {"pass": 5, "fail": 0, "skip": 2},
        "steps": [
            {"name": "step1", "status": "SKIP", "critical": False},
            {"name": "step2", "status": "SKIP", "critical": False},
        ]
    }) == "WARN"

    # Test FAIL (critical skip)
    assert infer_gate_status({
        "summary": {"pass": 5, "fail": 0, "skip": 1},
        "steps": [
            {"name": "step1", "status": "SKIP", "critical": True},
        ]
    }) == "FAIL"

    print("  PASS: infer_gate_status works correctly")
    return True


def test_commit_mismatch_fail():
    """Test that gray_report.py --commit mismatch results in FAIL."""
    print("\n==> Test: gray_report.py commit mismatch")

    # Get current commit
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        cwd=str(SCRIPTS_DIR.parent),
    )
    current_commit = result.stdout.strip()

    if not current_commit:
        print("  SKIP: Cannot get current commit")
        return True

    # Use a fake commit that doesn't match
    fake_commit = "0000000000000000000000000000000000000000"

    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPTS_DIR / "gray_report.py"),
            "build-info",
            "--env", "test",
            "--api-base", "http://localhost:8082",
            "--commit", fake_commit,
            "--operator", "test",
        ],
        capture_output=True,
        text=True,
        cwd=str(SCRIPTS_DIR.parent),
    )

    # Should fail (exit code 1)
    if result.returncode != 0:
        # Check if report mentions mismatch
        report_file = SCRIPTS_DIR.parent / "build" / "reports" / "gray-build-info.json"
        if report_file.exists():
            report = json.loads(report_file.read_text(encoding="utf-8"))
            issues = report.get("issues", [])
            if any("does not match" in issue for issue in issues):
                print("  PASS: Commit mismatch detected and reported")
                return True

    print("  FAIL: Commit mismatch not detected")
    return False


def test_coverage_summary_missing_gate_passed():
    """Test coverage summary with missing gate_passed but failed sub-items."""
    print("\n==> Test: Coverage summary missing gate_passed")

    from gray_report import determine_decision

    # Simulate coverage summary without top-level gate_passed
    # but with failed rust sub-items
    coverage_summary = {
        "rust": {
            "overall": {
                "covered": 50,
                "total": 100,
                "percentage": 50.0,
                "gate_passed": False,  # Explicitly failed
            },
            "im-e2ee-core": {
                "covered": 80,
                "total": 100,
                "percentage": 80.0,
                "passed": False,  # Explicitly failed
            }
        },
        "flutter": {
            "overall": {
                "covered": 70,
                "total": 100,
                "percentage": 70.0,
                "gate_passed": True,
            }
        }
    }

    result = determine_decision(
        build_info={},
        env_check={"status": "PASS"},
        gate_summary={},
        smoke_results={},
        coverage_summary=coverage_summary,
        manifest_summary={},
    )

    if result["decision"] == "NO-GO":
        # Check that coverage issues are mentioned
        if any("coverage FAIL" in issue for issue in result["issues"]):
            print("  PASS: Coverage failure detected")
            return True

    print("  FAIL: Coverage failure not detected")
    return False


def test_manifest_errors_no_go():
    """Test that manifest errors result in NO-GO."""
    print("\n==> Test: Manifest errors NO-GO")

    from gray_report import determine_decision

    # Simulate manifest with errors
    manifest_summary = {
        "errors": ["Missing critical endpoint: /api/message/send/private"],
        "categories": {
            "backend_routes": {"covered": 100, "missing": 0, "passed": True},
            "frontend_endpoints": {"covered": 110, "missing": 2, "passed": False},
        }
    }

    result = determine_decision(
        build_info={},
        env_check={"status": "PASS"},
        gate_summary={},
        smoke_results={},
        coverage_summary={"rust": {"overall": {"gate_passed": True}}, "flutter": {"overall": {"gate_passed": True}}},
        manifest_summary=manifest_summary,
    )

    if result["decision"] == "NO-GO":
        if any("Manifest has" in issue for issue in result["issues"]):
            print("  PASS: Manifest errors detected")
            return True

    print("  FAIL: Manifest errors not detected")
    return False


def test_warn_holds_decision():
    """Test that WARN results in HOLD, not GO."""
    print("\n==> Test: WARN results in HOLD")

    from gray_report import determine_decision

    # Simulate env WARN with all other checks PASS
    result = determine_decision(
        build_info={},
        env_check={"status": "WARN"},
        gate_summary={"summary": {"pass": 10, "fail": 0, "skip": 0}},
        smoke_results={"overall_status": "PASS", "summary": {"critical_failures": 0, "not_run": 0}},
        coverage_summary={
            "rust": {"overall": {"gate_passed": True, "passed": True}},
            "flutter": {"overall": {"gate_passed": True, "passed": True}}
        },
        manifest_summary={
            "categories": {
                "backend_routes": {"covered": 122, "missing": 0},
                "frontend_endpoints": {"covered": 112, "missing": 0},
            }
        },
    )

    if result["decision"] == "HOLD":
        if any("Environment check WARN" in w for w in result["warnings"]):
            print("  PASS: WARN results in HOLD")
            return True

    print(f"  FAIL: Expected HOLD, got {result['decision']}, issues: {result['issues']}, warnings: {result['warnings']}")
    return False


def test_critical_not_run_no_go():
    """Test that critical NOT RUN results in NO-GO."""
    print("\n==> Test: Critical NOT RUN results in NO-GO")

    from gray_report import determine_decision

    # Simulate critical smoke NOT RUN
    result = determine_decision(
        build_info={},
        env_check={"status": "PASS"},
        gate_summary={"summary": {"pass": 10, "fail": 0, "skip": 0}},
        smoke_results={
            "overall_status": "WARN",
            "summary": {"critical_failures": 0, "not_run": 1},
            "scenarios": [
                {"name": "E1. Private E2EE smoke", "status": "NOT RUN", "critical": True},
            ]
        },
        coverage_summary={"rust": {"overall": {"gate_passed": True}}, "flutter": {"overall": {"gate_passed": True}}},
        manifest_summary={},
    )

    if result["decision"] == "NO-GO":
        if any("Critical smoke tests NOT RUN" in issue for issue in result["issues"]):
            print("  PASS: Critical NOT RUN results in NO-GO")
            return True

    print(f"  FAIL: Expected NO-GO, got {result['decision']}")
    return False


def test_gray_smoke_no_old_paths():
    """Test that gray_smoke.py doesn't contain old API paths."""
    print("\n==> Test: gray_smoke.py no old paths")

    gray_smoke = SCRIPTS_DIR / "gray_smoke.py"
    content = gray_smoke.read_text(encoding="utf-8")

    old_paths = [
        "/api/auth/register",
        "/api/auth/login",
        "/api/ws/ticket",
        "/api/friends",
        "/api/messages",
        "/api/groups",
        "/api/files",
        "/api/e2ee/device-keys",
        "encrypted_envelope_base64_placeholder",
    ]

    found_old_paths = []
    for path in old_paths:
        if path in content:
            found_old_paths.append(path)

    if found_old_paths:
        print(f"  FAIL: Found old paths: {found_old_paths}")
        return False

    print("  PASS: No old paths found")
    return True


def test_gray_env_check_no_old_paths():
    """Test that gray_env_check.py doesn't contain old API paths."""
    print("\n==> Test: gray_env_check.py no old paths")

    env_check = SCRIPTS_DIR / "gray_env_check.py"
    content = env_check.read_text(encoding="utf-8")

    old_paths = [
        "/api/auth/register",
        "/api/auth/login",
        "/api/ws/ticket",
        "/api/files/upload",
        "/api/files/",
    ]

    found_old_paths = []
    for path in old_paths:
        if path in content:
            found_old_paths.append(path)

    if found_old_paths:
        print(f"  FAIL: Found old paths: {found_old_paths}")
        return False

    print("  PASS: No old paths found")
    return True


def test_e2ee_no_fake_envelope():
    """Test that E2EE smoke doesn't use fake envelopes."""
    print("\n==> Test: E2EE smoke no fake envelope")

    gray_smoke = SCRIPTS_DIR / "gray_smoke.py"
    content = gray_smoke.read_text(encoding="utf-8")

    fake_patterns = [
        "encrypted_envelope_base64_placeholder",
        "fake_envelope",
        "test_envelope",
        "dummy_envelope",
    ]

    found_fake = []
    for pattern in fake_patterns:
        if pattern in content:
            found_fake.append(pattern)

    if found_fake:
        print(f"  FAIL: Found fake envelope patterns: {found_fake}")
        return False

    # Check that P1 SIT path is searched in multiple locations
    if 'ROOT / "artifacts" / "p1-sit"' in content and 'ROOT / "build" / "artifacts" / "p1-sit"' in content:
        print("  PASS: No fake envelope patterns, P1 SIT path search correct")
    else:
        print("  FAIL: P1 SIT path search not correct")
        return False

    return True


def run_all_tests():
    """Run all tests."""
    print("="*60)
    print("Running Gray Release Verification Tests")
    print("="*60)

    tests = [
        test_test_py_no_empty_args,
        test_gray_gate_final_report_timing,
        test_commit_mismatch_fail,
        test_infer_gate_status,
        test_coverage_summary_missing_gate_passed,
        test_manifest_errors_no_go,
        test_warn_holds_decision,
        test_critical_not_run_no_go,
        test_gray_smoke_no_old_paths,
        test_gray_env_check_no_old_paths,
        test_e2ee_no_fake_envelope,
    ]

    results = []
    for test in tests:
        try:
            result = test()
            results.append((test.__name__, result))
        except Exception as e:
            print(f"  ERROR: {e}")
            results.append((test.__name__, False))

    print("\n" + "="*60)
    print("Test Results Summary")
    print("="*60)

    passed = sum(1 for _, result in results if result)
    failed = sum(1 for _, result in results if not result)

    for name, result in results:
        status = "PASS" if result else "FAIL"
        print(f"  {name}: {status}")

    print(f"\nTotal: {len(results)}, Passed: {passed}, Failed: {failed}")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(run_all_tests())
