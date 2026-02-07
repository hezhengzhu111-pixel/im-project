from __future__ import annotations

import json
import os
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def mask_value(value: Any, keep: int = 6) -> str:
    if value is None:
        return ""
    value = str(value)
    if len(value) <= keep * 2:
        return "*" * len(value)
    return f"{value[:keep]}...{value[-keep:]}"


def mask_headers(headers: Dict[str, str]) -> Dict[str, str]:
    masked: Dict[str, str] = {}
    for k, v in (headers or {}).items():
        lk = k.lower()
        if lk in {"authorization", "x-internal-secret", "cookie", "set-cookie"}:
            masked[k] = mask_value(v, keep=10)
        else:
            masked[k] = v
    return masked


@dataclass
class AssertionRecord:
    name: str
    ok: bool
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class CaseRecord:
    case_id: str
    module: str
    name: str
    started_at: str
    finished_at: str
    duration_ms: int
    request: Dict[str, Any]
    response: Dict[str, Any]
    assertions: List[AssertionRecord]
    ok: bool
    error_category: Optional[str] = None
    error_message: Optional[str] = None
    exception: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "case_id": self.case_id,
            "module": self.module,
            "name": self.name,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "duration_ms": self.duration_ms,
            "request": self.request,
            "response": self.response,
            "assertions": [
                {"name": a.name, "ok": a.ok, "details": a.details} for a in self.assertions
            ],
            "ok": self.ok,
            "error_category": self.error_category,
            "error_message": self.error_message,
            "exception": self.exception,
        }


@dataclass
class ModuleReport:
    module: str
    run_id: str
    base_url: str
    started_at: str
    finished_at: str
    duration_ms: int
    totals: Dict[str, int]
    cases: List[Dict[str, Any]]
    artifacts: Dict[str, str]
    metrics: Dict[str, Any]


class Reporter:
    def __init__(self, module: str, base_url: str, run_id: str, root_dir: Path) -> None:
        self.module = module
        self.base_url = base_url.rstrip("/")
        self.run_id = run_id
        self.root_dir = root_dir
        self.module_dir = root_dir / module
        self.errors_dir = self.module_dir / "errors"
        ensure_dir(self.errors_dir)
        self.events_path = self.module_dir / "events.jsonl"
        self.cases_path = self.module_dir / "cases.jsonl"
        self.report_path = self.module_dir / "report.json"
        self._started_ts = time.time()
        self._started_at = utc_now_iso()

        ensure_dir(self.module_dir)
        self._append_event({"type": "module_start", "module": module, "run_id": run_id, "at": self._started_at})

    def new_case_id(self) -> str:
        return uuid.uuid4().hex

    def _append_line(self, path: Path, obj: Dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(obj, ensure_ascii=False) + "\n")

    def _append_event(self, obj: Dict[str, Any]) -> None:
        self._append_line(self.events_path, obj)

    def _append_error(self, category: str, obj: Dict[str, Any]) -> None:
        safe = "".join([c if c.isalnum() or c in {"-", "_"} else "_" for c in category])
        self._append_line(self.errors_dir / f"{safe}.jsonl", obj)

    def record_case(self, case: CaseRecord) -> None:
        d = case.to_dict()
        self._append_line(self.cases_path, d)
        self._append_event({"type": "case_end", "module": self.module, "case_id": case.case_id, "name": case.name, "ok": case.ok, "duration_ms": case.duration_ms, "at": case.finished_at})
        if not case.ok:
            cat = case.error_category or "assertion_failed"
            self._append_error(cat, d)

    def finalize(self) -> Path:
        finished_at = utc_now_iso()
        duration_ms = int((time.time() - self._started_ts) * 1000)

        totals = {"total": 0, "passed": 0, "failed": 0}
        cases: List[Dict[str, Any]] = []
        if self.cases_path.exists():
            for line in self.cases_path.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                obj = json.loads(line)
                cases.append(obj)
                totals["total"] += 1
                if obj.get("ok") is True:
                    totals["passed"] += 1
                else:
                    totals["failed"] += 1

        report = ModuleReport(
            module=self.module,
            run_id=self.run_id,
            base_url=self.base_url,
            started_at=self._started_at,
            finished_at=finished_at,
            duration_ms=duration_ms,
            totals=totals,
            cases=cases,
            artifacts={
                "events": str(self.events_path),
                "cases": str(self.cases_path),
                "errors_dir": str(self.errors_dir),
            },
            metrics=_compute_metrics(cases),
        )
        self.report_path.write_text(json.dumps(report.__dict__, ensure_ascii=False, indent=2), encoding="utf-8")
        self._append_event({"type": "module_end", "module": self.module, "run_id": self.run_id, "at": finished_at, "duration_ms": duration_ms, "totals": totals})
        return self.report_path


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


def _compute_metrics(cases: List[Dict[str, Any]]) -> Dict[str, Any]:
    total = len(cases)
    passed = sum(1 for c in cases if c.get("ok") is True)
    failed = total - passed
    pass_rate = (passed / total * 100.0) if total else 0.0
    error_rate = (failed / total * 100.0) if total else 0.0

    http_lat: List[int] = []
    all_lat: List[int] = []
    status_codes: Dict[str, int] = {}
    by_endpoint: Dict[str, Dict[str, Any]] = {}

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
            http_lat.append(elapsed if isinstance(elapsed, int) else 0)
            sc = resp.get("status_code")
            if sc is not None:
                status_codes[str(sc)] = status_codes.get(str(sc), 0) + 1
        else:
            key = f"WS {typ}" if isinstance(typ, str) else "CUSTOM"

        entry = by_endpoint.get(key)
        if entry is None:
            entry = {"total": 0, "passed": 0, "failed": 0, "latencies_ms": []}
            by_endpoint[key] = entry
        entry["total"] += 1
        entry["passed"] += 1 if ok else 0
        entry["failed"] += 0 if ok else 1
        if isinstance(elapsed, int):
            entry["latencies_ms"].append(elapsed)

    def summarize(latencies: List[int]) -> Dict[str, Any]:
        if not latencies:
            return {"count": 0, "min": 0, "avg": 0, "max": 0, **_percentiles([], [50, 90, 95, 99])}
        count = len(latencies)
        return {
            "count": count,
            "min": int(min(latencies)),
            "avg": int(sum(latencies) / count),
            "max": int(max(latencies)),
            **_percentiles(latencies, [50, 90, 95, 99]),
        }

    endpoints_out: Dict[str, Any] = {}
    for k, v in by_endpoint.items():
        lats = v.pop("latencies_ms", [])
        endpoints_out[k] = {**v, "latency_ms": summarize(lats), "error_rate": (v["failed"] / v["total"] * 100.0) if v["total"] else 0.0}

    return {
        "totals": {"total": total, "passed": passed, "failed": failed, "pass_rate": pass_rate, "error_rate": error_rate},
        "latency_ms": {"all": summarize(all_lat), "http": summarize(http_lat)},
        "status_codes": status_codes,
        "endpoints": endpoints_out,
    }


def default_run_id() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S") + f"_{os.getpid()}"
