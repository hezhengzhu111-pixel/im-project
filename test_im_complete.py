import argparse
import io
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple
from urllib.parse import urlparse


if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


ROOT = Path(__file__).resolve().parent


MODULE_SCRIPTS: Dict[str, str] = {
    "gateway": "test_module_gateway.py",
    "auth": "test_module_auth.py",
    "user": "test_module_user.py",
    "group": "test_module_group.py",
    "message": "test_module_message.py",
    "file": "test_module_file.py",
    "im": "test_module_im.py",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", default="gateway")
    parser.add_argument("--service", default="all")
    parser.add_argument("--base-url", default=os.environ.get("IM_BASE_URL", "http://localhost:8080"))
    parser.add_argument("--internal-secret", default=os.environ.get("IM_INTERNAL_SECRET", "im-internal-secret"))
    parser.add_argument("--report", action="store_true", default=True)
    return parser.parse_args()


def to_services(service_arg: str) -> List[str]:
    value = (service_arg or "all").strip().lower()
    if value == "all":
        return ["gateway", "auth", "user", "group", "message", "file", "im"]
    parts = [p.strip() for p in value.split(",") if p.strip()]
    return [p for p in parts if p in MODULE_SCRIPTS]


def count_results(lines: List[str]) -> Tuple[int, int, int]:
    total = 0
    passed = 0
    failed = 0
    for line in lines:
        if line.startswith("[PASS]"):
            total += 1
            passed += 1
        elif line.startswith("[FAIL]"):
            total += 1
            failed += 1
    return total, passed, failed


def run_script(script_path: Path, env: Dict[str, str]) -> Tuple[int, List[str], int]:
    started = time.time()
    proc = subprocess.Popen(
        [sys.executable, str(script_path)],
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )
    lines: List[str] = []
    assert proc.stdout is not None
    for line in proc.stdout:
        print(line, end="")
        lines.append(line.rstrip("\n"))
    code = proc.wait()
    elapsed_ms = int((time.time() - started) * 1000)
    return code, lines, elapsed_ms


def write_report(report: dict) -> Path:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = ROOT / f"test_report_{ts}.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def _percentiles(values: List[int], ps: List[int]) -> Dict[str, int]:
    if not values:
        return {f"p{p}": 0 for p in ps}
    xs = sorted(values)
    n = len(xs)
    out: Dict[str, int] = {}
    for p in ps:
        if p <= 0:
            out[f"p{p}"] = xs[0]
            continue
        if p >= 100:
            out[f"p{p}"] = xs[-1]
            continue
        k = int((p / 100.0) * (n - 1))
        out[f"p{p}"] = int(xs[k])
    return out


def _summarize_lat(latencies: List[int]) -> Dict[str, int]:
    if not latencies:
        return {"count": 0, "min": 0, "avg": 0, "max": 0, **_percentiles([], [50, 90, 95, 99])}
    return {
        "count": len(latencies),
        "min": int(min(latencies)),
        "avg": int(sum(latencies) / len(latencies)),
        "max": int(max(latencies)),
        **_percentiles(latencies, [50, 90, 95, 99]),
    }


def _compute_metrics(cases: List[dict]) -> dict:
    total = len(cases)
    passed = sum(1 for c in cases if c.get("ok") is True)
    failed = total - passed
    pass_rate = (passed / total * 100.0) if total else 0.0
    error_rate = (failed / total * 100.0) if total else 0.0

    http_lat: List[int] = []
    all_lat: List[int] = []
    status_codes: Dict[str, int] = {}
    endpoints: Dict[str, dict] = {}

    for c in cases:
        req = c.get("request") or {}
        resp = c.get("response") or {}
        ok = c.get("ok") is True
        elapsed = resp.get("elapsed_ms")
        if not isinstance(elapsed, int):
            elapsed = c.get("duration_ms")
        if isinstance(elapsed, int):
            all_lat.append(elapsed)

        method = req.get("method")
        url = req.get("url")
        typ = req.get("type")
        if isinstance(method, str) and isinstance(url, str):
            try:
                p = urlparse(url)
                key = f"{method.upper()} {p.path}"
            except Exception:
                key = f"{method.upper()} {url}"
            if isinstance(elapsed, int):
                http_lat.append(elapsed)
            sc = resp.get("status_code")
            if sc is not None:
                status_codes[str(sc)] = status_codes.get(str(sc), 0) + 1
        else:
            key = f"WS {typ}" if isinstance(typ, str) else "CUSTOM"

        e = endpoints.get(key)
        if e is None:
            e = {"total": 0, "passed": 0, "failed": 0, "latencies": []}
            endpoints[key] = e
        e["total"] += 1
        e["passed"] += 1 if ok else 0
        e["failed"] += 0 if ok else 1
        if isinstance(elapsed, int):
            e["latencies"].append(elapsed)

    endpoints_out: Dict[str, dict] = {}
    for k, v in endpoints.items():
        lats = v.pop("latencies", [])
        endpoints_out[k] = {**v, "latency_ms": _summarize_lat(lats), "error_rate": (v["failed"] / v["total"] * 100.0) if v["total"] else 0.0}

    return {
        "totals": {"total": total, "passed": passed, "failed": failed, "pass_rate": pass_rate, "error_rate": error_rate},
        "latency_ms": {"all": _summarize_lat(all_lat), "http": _summarize_lat(http_lat)},
        "status_codes": status_codes,
        "endpoints": endpoints_out,
    }


def _write_summary_md(path: Path, report: dict) -> None:
    s = report.get("summary") or {}
    metrics = report.get("metrics") or {}
    lat = ((metrics.get("latency_ms") or {}).get("http") or {})
    totals = metrics.get("totals") or {}

    lines = []
    lines.append("# IM 自动化测试报告")
    lines.append("")
    lines.append(f"- base_url: {s.get('base_url')}")
    lines.append(f"- run_id: {s.get('run_id')}")
    lines.append(f"- total: {s.get('total')}, passed: {s.get('passed')}, failed: {s.get('failed')}, pass_rate: {s.get('pass_rate')}")
    lines.append(f"- error_rate: {totals.get('error_rate', 0):.2f}%")
    lines.append(f"- http latency(ms): p50={lat.get('p50')}, p95={lat.get('p95')}, p99={lat.get('p99')}, max={lat.get('max')}")
    lines.append("")
    lines.append("## 模块概览")
    lines.append("")
    lines.append("| module | total | passed | failed | pass_rate | elapsed_ms | http_p95 | http_max |")
    lines.append("|---|---:|---:|---:|---:|---:|---:|---:|")
    for m in report.get("modules") or []:
        cases = (m.get("cases") or {})
        mm = m.get("metrics") or {}
        mlat = ((mm.get("latency_ms") or {}).get("http") or {})
        pr = (cases.get("passed") / cases.get("total") * 100.0) if cases.get("total") else 0.0
        lines.append(f"| {m.get('module')} | {cases.get('total',0)} | {cases.get('passed',0)} | {cases.get('failed',0)} | {pr:.1f}% | {m.get('elapsed_ms',0)} | {mlat.get('p95',0)} | {mlat.get('max',0)} |")
    lines.append("")
    lines.append("## Top 慢接口（按 p95）")
    lines.append("")
    endpoints = metrics.get("endpoints") or {}
    rows = []
    for k, v in endpoints.items():
        latk = (v.get("latency_ms") or {})
        rows.append((latk.get("p95", 0), latk.get("max", 0), k, v.get("total", 0), v.get("failed", 0)))
    rows.sort(reverse=True)
    lines.append("| endpoint | total | failed | p95(ms) | max(ms) |")
    lines.append("|---|---:|---:|---:|---:|")
    for p95, mx, k, total, failed in rows[:15]:
        lines.append(f"| {k} | {total} | {failed} | {p95} | {mx} |")
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def main() -> int:
    args = parse_args()
    services = to_services(args.service)

    env = os.environ.copy()
    env["IM_BASE_URL"] = args.base_url
    env["IM_INTERNAL_SECRET"] = args.internal_secret
    run_id = env.get("IM_TEST_RUN_ID") or datetime.now().strftime("%Y%m%d_%H%M%S") + f"_{os.getpid()}"
    output_dir = Path(env.get("IM_TEST_OUTPUT_DIR") or (ROOT / "test_reports" / f"run_{run_id}")).resolve()
    ensure_dir(output_dir)
    env["IM_TEST_RUN_ID"] = run_id
    env["IM_TEST_OUTPUT_DIR"] = str(output_dir)

    overall_ok = True
    modules_report = []
    all_cases: List[dict] = []
    total_cases = 0
    total_passed = 0
    total_failed = 0

    for service in services:
        script_name = MODULE_SCRIPTS[service]
        script_path = ROOT / script_name
        if not script_path.exists():
            print(f"[FAIL] missing script: {script_path}")
            overall_ok = False
            continue

        print(f"\n{'=' * 80}\nRUN {service}: {script_name}\n{'=' * 80}")
        code, lines, elapsed_ms = run_script(script_path, env)

        mod_total, mod_pass, mod_fail = count_results(lines)
        report_path = output_dir / service / "report.json"
        report_obj = None
        if report_path.exists():
            try:
                report_obj = json.loads(report_path.read_text(encoding="utf-8"))
                totals = (report_obj.get("totals") or {})
                mod_total = int(totals.get("total", mod_total))
                mod_pass = int(totals.get("passed", mod_pass))
                mod_fail = int(totals.get("failed", mod_fail))
            except Exception:
                report_obj = None
        if isinstance(report_obj, dict):
            cases = report_obj.get("cases") or []
            if isinstance(cases, list):
                all_cases.extend(cases)
        total_cases += mod_total
        total_passed += mod_pass
        total_failed += mod_fail

        modules_report.append(
            {
                "module": service,
                "script": script_name,
                "exit_code": code,
                "elapsed_ms": elapsed_ms,
                "cases": {"total": mod_total, "passed": mod_pass, "failed": mod_fail},
                "module_report": str(report_path) if report_path.exists() else None,
                "metrics": (report_obj.get("metrics") if isinstance(report_obj, dict) else None),
            }
        )

        if code != 0 or mod_fail > 0:
            overall_ok = False

    pass_rate = (total_passed / total_cases * 100.0) if total_cases else 0.0
    report = {
        "summary": {
            "total": total_cases,
            "passed": total_passed,
            "failed": total_failed,
            "pass_rate": f"{pass_rate:.1f}%",
            "base_url": args.base_url,
            "run_id": run_id,
            "output_dir": str(output_dir),
        },
        "metrics": _compute_metrics(all_cases),
        "modules": modules_report,
    }

    if args.report:
        report_path = write_report(report)
        summary_path = output_dir / "summary.json"
        summary_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        _write_summary_md(output_dir / "summary.md", report)
        print(f"\nREPORT: {report_path}")
        print(f"REPORT_DIR: {output_dir}")
        print(f"SUMMARY: {summary_path}")

    return 0 if overall_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
