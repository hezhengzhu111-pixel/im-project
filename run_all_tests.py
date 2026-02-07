#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import argparse
import os
import subprocess
import sys
import time
from typing import List
from tqdm import tqdm


VERSION_FILE = os.path.join(os.path.dirname(__file__), "VERSION")


def read_version() -> str:
    try:
        with open(VERSION_FILE, "r", encoding="utf-8") as f:
            return f.read().strip()
    except Exception:
        return "0.0.0"


def run(cmd: List[str]) -> int:
    return subprocess.run(cmd).returncode


def run_phase(name: str, path: str, junit: str, allure: str) -> int:
    cmd = [
        sys.executable,
        "-m",
        "pytest",
        path,
        "-q",
        "--disable-warnings",
        "--maxfail=1",
        "--reruns",
        "2",
        "--reruns-delay",
        "1",
        f"--junitxml={junit}",
        f"--alluredir={allure}",
    ]
    print(f"[{name}] {' '.join(cmd)}")
    return run(cmd)


def main():
    parser = argparse.ArgumentParser(description="统一测试入口", formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    parser.add_argument("--config", default="test_config.yaml")
    parser.add_argument("--version", action="version", version=read_version())
    args = parser.parse_args()

    phases = [
        ("health", "tests/health", "junit_health.xml", "allure_report/health"),
        ("smoke", "tests/smoke", "junit_smoke.xml", "allure_report/smoke"),
        ("regression", "tests/regression", "junit_regression.xml", "allure_report/regression"),
    ]

    if not os.path.exists(args.config):
        print("test_config.yaml 不存在")
        sys.exit(1)

    os.environ["TEST_CONFIG"] = os.path.abspath(args.config)
    overall = 0
    start = time.time()
    for name, path, junit, allure in tqdm(phases, desc="test-phases", unit="phase"):
        if not os.path.isdir(path):
            print(f"未找到测试目录: {path}")
            overall = 1
            break
        code = run_phase(name, path, junit, allure)
        if code != 0:
            overall = 1
            break
    cost_ms = int((time.time() - start) * 1000)
    print(f"TOTAL_MS={cost_ms}")
    sys.exit(0 if overall == 0 else 1)


if __name__ == "__main__":
    main()
