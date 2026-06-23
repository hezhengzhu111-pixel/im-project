"""Tests for gray_frontend_check.py P0 desktop build reporting."""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Ensure the gates package is importable.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import gray_frontend_check as gfc


def _pass_step(name: str, cmd: list, cwd: Path, **kwargs) -> dict:
    return {
        "name": name,
        "status": "PASS",
        "exit_code": 0,
        "duration_seconds": 1.0,
    }


def _fail_step(name: str, cmd: list, cwd: Path, **kwargs) -> dict:
    return {
        "name": name,
        "status": "FAIL",
        "exit_code": 1,
        "duration_seconds": 1.0,
    }


def test_default_desktop_platform_windows():
    with patch.object(sys, "platform", "win32"):
        assert gfc._default_desktop_platform() == "windows"


def test_default_desktop_platform_macos():
    with patch.object(sys, "platform", "darwin"):
        assert gfc._default_desktop_platform() == "macos"


def test_default_desktop_platform_linux():
    with patch.object(sys, "platform", "linux"):
        assert gfc._default_desktop_platform() == "linux"


def test_desktop_build_cmd_known_platforms():
    assert gfc._desktop_build_cmd("windows") == ["flutter", "build", "windows"]
    assert gfc._desktop_build_cmd("macos") == ["flutter", "build", "macos"]
    assert gfc._desktop_build_cmd("linux") == ["flutter", "build", "linux"]


def test_desktop_build_cmd_unknown_platform():
    assert gfc._desktop_build_cmd("haiku") is None


@patch.object(gfc, "ensure_work_workspace")
@patch.object(gfc, "setup_isolated_env", return_value={})
@patch.object(gfc, "run_flutter_step", side_effect=_pass_step)
def test_desktop_build_not_requested_reports_not_run(
    mock_run_step: MagicMock,
    mock_setup_env: MagicMock,
    mock_ensure_workspace: MagicMock,
):
    result = gfc.check_target(
        name="desktop",
        rel_path="apps/desktop",
        needs_build=False,
        env="local-gray",
        api_base="http://localhost:8082",
        ws_base="ws://localhost:8082",
    )

    assert result["status"] == "PASS_WITH_NOT_RUN"
    build_steps = [s for s in result["steps"] if "build" in s["name"]]
    assert len(build_steps) == 1
    assert build_steps[0]["status"] == "NOT RUN"
    assert build_steps[0]["reason"] == "desktop_build_not_requested"


@patch.object(gfc, "ensure_work_workspace")
@patch.object(gfc, "setup_isolated_env", return_value={})
@patch.object(gfc, "run_flutter_step", side_effect=_pass_step)
def test_desktop_build_requested_runs_platform_build(
    mock_run_step: MagicMock,
    mock_setup_env: MagicMock,
    mock_ensure_workspace: MagicMock,
):
    with patch.object(sys, "platform", "win32"):
        result = gfc.check_target(
            name="desktop",
            rel_path="apps/desktop",
            needs_build=False,
            env="local-gray",
            api_base="http://localhost:8082",
            ws_base="ws://localhost:8082",
            desktop_build=True,
        )

    assert result["status"] == "PASS"
    build_steps = [s for s in result["steps"] if "build" in s["name"]]
    assert len(build_steps) == 1
    assert build_steps[0]["status"] == "PASS"
    assert mock_run_step.call_args_list[-1][0][0] == "desktop build windows"


@patch.object(gfc, "ensure_work_workspace")
@patch.object(gfc, "setup_isolated_env", return_value={})
@patch.object(gfc, "run_flutter_step", side_effect=_pass_step)
def test_desktop_build_requested_with_explicit_platform(
    mock_run_step: MagicMock,
    mock_setup_env: MagicMock,
    mock_ensure_workspace: MagicMock,
):
    result = gfc.check_target(
        name="desktop",
        rel_path="apps/desktop",
        needs_build=False,
        env="local-gray",
        api_base="http://localhost:8082",
        ws_base="ws://localhost:8082",
        desktop_build=True,
        desktop_platform="linux",
    )

    assert result["status"] == "PASS"
    assert mock_run_step.call_args_list[-1][0][0] == "desktop build linux"


@patch.object(gfc, "ensure_work_workspace")
@patch.object(gfc, "setup_isolated_env", return_value={})
@patch.object(gfc, "run_flutter_step", side_effect=_fail_step)
def test_desktop_build_failure_marks_target_fail(
    mock_run_step: MagicMock,
    mock_setup_env: MagicMock,
    mock_ensure_workspace: MagicMock,
):
    result = gfc.check_target(
        name="desktop",
        rel_path="apps/desktop",
        needs_build=False,
        env="local-gray",
        api_base="http://localhost:8082",
        ws_base="ws://localhost:8082",
        desktop_build=True,
        desktop_platform="windows",
    )

    assert result["status"] == "FAIL"


@patch.object(gfc, "ensure_work_workspace")
@patch.object(gfc, "setup_isolated_env", return_value={})
@patch.object(gfc, "run_flutter_step", side_effect=_pass_step)
def test_unsupported_desktop_platform_reports_not_run(
    mock_run_step: MagicMock,
    mock_setup_env: MagicMock,
    mock_ensure_workspace: MagicMock,
):
    result = gfc.check_target(
        name="desktop",
        rel_path="apps/desktop",
        needs_build=False,
        env="local-gray",
        api_base="http://localhost:8082",
        ws_base="ws://localhost:8082",
        desktop_build=True,
        desktop_platform="haiku",
    )

    assert result["status"] == "PASS_WITH_NOT_RUN"
    build_steps = [s for s in result["steps"] if "build" in s["name"]]
    assert build_steps[0]["status"] == "NOT RUN"
    assert "haiku" in build_steps[0]["reason"]


@patch.object(gfc, "ensure_work_workspace")
@patch.object(gfc, "setup_isolated_env", return_value={})
@patch.object(gfc, "run_flutter_step", side_effect=_pass_step)
def test_web_build_skip_still_reports_not_run_for_desktop(
    mock_run_step: MagicMock,
    mock_setup_env: MagicMock,
    mock_ensure_workspace: MagicMock,
):
    result = gfc.check_target(
        name="desktop",
        rel_path="apps/desktop",
        needs_build=False,
        env="local-gray",
        api_base="http://localhost:8082",
        ws_base="ws://localhost:8082",
        skip_web_build=True,
    )

    assert result["status"] == "PASS_WITH_NOT_RUN"
