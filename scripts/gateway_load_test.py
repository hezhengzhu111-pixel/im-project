import argparse
import ast
import json
import os
import statistics
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import requests


METHODS = {"GET", "POST", "PUT", "DELETE", "PATCH"}


@dataclass(frozen=True)
class Target:
    method: str
    path: str


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--base-url", default=os.environ.get("IM_BASE_URL", "http://localhost:8080"))
    p.add_argument("--tests-glob", default="test_module_*.py")
    p.add_argument("--method", default="GET")
    p.add_argument("--count", type=int, default=200)
    p.add_argument("--concurrency", type=int, default=200)
    p.add_argument("--timeout", type=int, default=15)
    p.add_argument("--token", default=os.environ.get("IM_BEARER_TOKEN", ""))
    p.add_argument("--payloads", default="")
    p.add_argument("--out", default="")
    return p.parse_args()


def now_ts() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def normalize_path(p: str) -> str:
    if not p.startswith("/"):
        p = "/" + p
    return p


def _str_from_ast(node: ast.AST) -> Optional[str]:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.JoinedStr):
        parts: List[str] = []
        for v in node.values:
            if isinstance(v, ast.Constant) and isinstance(v.value, str):
                parts.append(v.value)
            else:
                parts.append("{param}")
        return "".join(parts)
    return None


class _Visitor(ast.NodeVisitor):
    def __init__(self) -> None:
        self.items: List[Target] = []

    def visit_Call(self, node: ast.Call) -> None:
        if isinstance(node.func, ast.Attribute) and node.func.attr == "call":
            args = list(node.args or [])
            if len(args) >= 3:
                method = _str_from_ast(args[1])
                path = _str_from_ast(args[2])
                if method and path:
                    m = method.upper()
                    if m in METHODS and path.startswith("/"):
                        self.items.append(Target(method=m, path=normalize_path(path)))
        self.generic_visit(node)


def extract_targets(glob_pattern: str, method_filter: str) -> List[Target]:
    method_filter = method_filter.strip().upper()
    out: List[Target] = []
    for py in sorted(Path(".").glob(glob_pattern)):
        try:
            tree = ast.parse(py.read_text(encoding="utf-8", errors="replace"))
        except SyntaxError:
            continue
        v = _Visitor()
        v.visit(tree)
        for t in v.items:
            if method_filter and t.method != method_filter:
                continue
            if "{param}" in t.path:
                continue
            out.append(t)
    uniq = sorted({(t.method, t.path) for t in out}, key=lambda x: (x[1], x[0]))
    return [Target(method=m, path=p) for m, p in uniq]


def percentile(values: Sequence[float], p: float) -> float:
    if not values:
        return 0.0
    xs = sorted(values)
    k = int(round((len(xs) - 1) * p))
    k = max(0, min(k, len(xs) - 1))
    return xs[k]


def load_payloads(path: str) -> Dict[str, dict]:
    if not path:
        return {}
    obj = json.loads(Path(path).read_text(encoding="utf-8"))
    return obj if isinstance(obj, dict) else {}


def choose_out_path(out_arg: str) -> Path:
    if out_arg:
        return Path(out_arg)
    return Path("test_reports") / f"gateway_load_{now_ts()}.json"


def run_one(
    session: requests.Session,
    base_url: str,
    target: Target,
    timeout: int,
    token: str,
    payloads: Dict[str, dict],
    i: int,
) -> Tuple[int, float]:
    url = base_url.rstrip("/") + target.path
    headers = {"X-Gateway-Route": "true", "X-Trace-Id": f"load-{now_ts()}-{i}"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    key = f"{target.method} {target.path}"
    cfg = payloads.get(key) or {}
    params = cfg.get("params")
    json_body = cfg.get("json")
    data = cfg.get("data")
    started = time.perf_counter()
    resp = session.request(
        method=target.method,
        url=url,
        headers=headers,
        params=params,
        json=json_body,
        data=data,
        timeout=timeout,
    )
    elapsed_ms = (time.perf_counter() - started) * 1000.0
    return resp.status_code, elapsed_ms


def main() -> int:
    args = parse_args()
    base_url = args.base_url.rstrip("/")
    targets = extract_targets(args.tests_glob, args.method)
    if not targets:
        print("no targets")
        return 2

    payloads = load_payloads(args.payloads)
    out_path = choose_out_path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    report = {
        "meta": {
            "base_url": base_url,
            "method": args.method.strip().upper(),
            "count": args.count,
            "concurrency": args.concurrency,
            "timeout": args.timeout,
            "targets": [{"method": t.method, "path": t.path} for t in targets],
            "generated_at": datetime.now().isoformat(),
        },
        "results": [],
    }

    session = requests.Session()
    overall_ok = True

    for t in targets:
        statuses: List[int] = []
        latencies: List[float] = []
        with ThreadPoolExecutor(max_workers=max(1, args.concurrency)) as ex:
            futures = [
                ex.submit(run_one, session, base_url, t, args.timeout, args.token, payloads, i)
                for i in range(args.count)
            ]
            for fut in as_completed(futures):
                try:
                    status, ms = fut.result()
                    statuses.append(status)
                    latencies.append(ms)
                except Exception:
                    statuses.append(0)
                    latencies.append(float(args.timeout) * 1000.0)

        total = len(statuses)
        err5xx = sum(1 for s in statuses if s >= 500)
        err_rate = (err5xx / total * 100.0) if total else 0.0
        p99 = percentile(latencies, 0.99)
        avg = statistics.fmean(latencies) if latencies else 0.0

        ok = err_rate < 0.1 and p99 < 500.0
        overall_ok &= ok

        report["results"].append(
            {
                "target": {"method": t.method, "path": t.path},
                "total": total,
                "status_counts": {str(s): statuses.count(s) for s in sorted(set(statuses))},
                "errors": {"5xx": err5xx, "5xx_rate_percent": round(err_rate, 4)},
                "latency_ms": {"avg": round(avg, 2), "p99": round(p99, 2), "max": round(max(latencies) if latencies else 0.0, 2)},
                "pass": ok,
            }
        )

    report["summary"] = {
        "pass": overall_ok,
        "targets": len(targets),
        "generated_at": datetime.now().isoformat(),
    }
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK: {out_path}")
    return 0 if overall_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

