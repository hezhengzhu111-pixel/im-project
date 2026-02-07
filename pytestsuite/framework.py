from __future__ import annotations

import json
import os
import time
import traceback
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional, Sequence, Tuple

import base64
import hashlib

import requests

from .diffing import diff_subset
from .matchers import to_expected_repr
from .reporting import AssertionRecord, CaseRecord, Reporter, default_run_id, mask_headers, utc_now_iso


@dataclass
class RunContext:
    base_url: str
    internal_secret: str
    run_id: str
    output_dir: Path

    @staticmethod
    def from_env(module: str) -> RunContext:
        base_url = os.environ.get("IM_BASE_URL", "http://localhost:8080").rstrip("/")
        internal_secret = os.environ.get("IM_INTERNAL_SECRET", "im-internal-secret")
        run_id = os.environ.get("IM_TEST_RUN_ID") or default_run_id()
        out = os.environ.get("IM_TEST_OUTPUT_DIR")
        if out:
            output_dir = Path(out)
        else:
            output_dir = Path(__file__).resolve().parent.parent / "test_reports" / f"run_{run_id}"
        output_dir = output_dir.resolve()
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / module).mkdir(parents=True, exist_ok=True)
        return RunContext(base_url=base_url, internal_secret=internal_secret, run_id=run_id, output_dir=output_dir)


class ApiClient:
    def __init__(self, reporter: Reporter, session: Optional[requests.Session] = None) -> None:
        self.reporter = reporter
        self.session = session or requests.Session()

    def call(
        self,
        name: str,
        method: str,
        path_or_url: str,
        *,
        expected_http: Sequence[int] = (200,),
        expected_json_subset: Any = None,
        expected_json_path: Optional[Tuple[str, Any]] = None,
        expected_response_headers: Optional[Dict[str, str]] = None,
        headers: Optional[Dict[str, str]] = None,
        params: Optional[Dict[str, Any]] = None,
        json_body: Any = None,
        data: Any = None,
        files: Any = None,
        timeout: int = 15,
        allow_empty_body: bool = True,
        response_mode: str = "auto",
        expected_binary_min_size: Optional[int] = None,
    ) -> Tuple[bool, Optional[requests.Response], Any]:
        case_id = self.reporter.new_case_id()
        started_at = utc_now_iso()
        start_ts = time.time()

        url = path_or_url
        if url.startswith("/"):
            url = f"{self.reporter.base_url}{url}"

        merged_headers = dict(self.session.headers)
        if headers:
            merged_headers.update(headers)
        merged_headers.setdefault("X-Gateway-Route", "true")
        merged_headers.setdefault("X-Trace-Id", f"{self.reporter.run_id}-{case_id}")

        resp: Optional[requests.Response] = None
        payload: Any = None
        assertions = []
        ok = True
        error_category = None
        error_message = None
        exc_info = None

        try:
            resp = self.session.request(
                method=method,
                url=url,
                headers=merged_headers,
                params=params,
                json=json_body,
                data=data,
                files=files,
                timeout=timeout,
            )
            ctype = (resp.headers.get("content-type") or "").lower()
            mode = response_mode
            if mode == "auto":
                mode = "json" if "json" in ctype else "text"
            if mode == "json":
                try:
                    if resp.text or not allow_empty_body:
                        payload = resp.json()
                    else:
                        payload = None
                except Exception:
                    payload = {"_raw": resp.text}
            elif mode == "bytes":
                raw = resp.content or b""
                head = raw[:64]
                payload = {
                    "_binary": {
                        "size": len(raw),
                        "sha256": hashlib.sha256(raw).hexdigest(),
                        "head_b64": base64.b64encode(head).decode("ascii"),
                    }
                }
            else:
                txt = resp.text or ""
                payload = {"_text": txt[:4000], "_text_len": len(txt)}

            http_ok = resp.status_code in tuple(expected_http)
            assertions.append(
                AssertionRecord(
                    name="http.status",
                    ok=http_ok,
                    details={"expected": list(expected_http), "actual": resp.status_code},
                )
            )
            ok &= http_ok

            if expected_response_headers:
                for hk, hv in expected_response_headers.items():
                    actual = resp.headers.get(hk)
                    header_ok = actual == hv
                    assertions.append(
                        AssertionRecord(
                            name="resp.header",
                            ok=header_ok,
                            details={"header": hk, "expected": hv, "actual": actual},
                        )
                    )
                    ok &= header_ok

            if expected_json_subset is not None:
                diffs = diff_subset(expected_json_subset, payload)
                subset_ok = len(diffs) == 0
                assertions.append(
                    AssertionRecord(
                        name="json.subset",
                        ok=subset_ok,
                        details={
                            "expected": to_expected_repr(expected_json_subset),
                            "diffs": [d.to_dict() for d in diffs[:50]],
                            "diff_count": len(diffs),
                        },
                    )
                )
                ok &= subset_ok

            if expected_json_path is not None:
                path, expected_val = expected_json_path
                actual_val = _get_json_path(payload, path)
                diffs = diff_subset(expected_val, actual_val)
                path_ok = len(diffs) == 0
                assertions.append(
                    AssertionRecord(
                        name="json.path",
                        ok=path_ok,
                        details={
                            "path": path,
                            "expected": to_expected_repr(expected_val),
                            "actual": actual_val,
                            "diffs": [d.to_dict() for d in diffs[:20]],
                        },
                    )
                )
                ok &= path_ok

            if expected_binary_min_size is not None:
                size_ok = True
                actual_size = None
                if resp.status_code == 200:
                    actual_size = len(resp.content or b"")
                    size_ok = actual_size >= int(expected_binary_min_size)
                assertions.append(
                    AssertionRecord(
                        name="binary.size",
                        ok=size_ok,
                        details={
                            "min_size": int(expected_binary_min_size),
                            "actual_size": actual_size,
                            "only_enforced_on_http_200": True,
                        },
                    )
                )
                ok &= size_ok

            if ok:
                print(f"[PASS] {name} ({resp.status_code}, {int(resp.elapsed.total_seconds()*1000)}ms)")
            else:
                error_category = "assertion_failed"
                error_message = "assertions failed"
                print(f"[FAIL] {name}")
                print(f"  request: {method} {url}")
                if params:
                    print(f"  params: {json.dumps(params, ensure_ascii=False)}")
                if json_body is not None:
                    print(f"  json: {json.dumps(json_body, ensure_ascii=False)}")
                print(f"  headers: {json.dumps(mask_headers(merged_headers), ensure_ascii=False)}")
                print(f"  response.status: {resp.status_code}")
                try:
                    print(f"  response.body: {json.dumps(payload, ensure_ascii=False)[:2000]}")
                except Exception:
                    print(f"  response.body: {str(payload)[:2000]}")

        except requests.Timeout as e:
            ok = False
            error_category = "timeout"
            error_message = str(e)
            exc_info = {"type": type(e).__name__, "message": str(e), "trace": traceback.format_exc()}
            print(f"[FAIL] {name}")
            print(f"  timeout: {e}")
        except requests.RequestException as e:
            ok = False
            error_category = "network_error"
            error_message = str(e)
            exc_info = {"type": type(e).__name__, "message": str(e), "trace": traceback.format_exc()}
            print(f"[FAIL] {name}")
            print(f"  network_error: {e}")
        except Exception as e:
            ok = False
            error_category = "unexpected_exception"
            error_message = str(e)
            exc_info = {"type": type(e).__name__, "message": str(e), "trace": traceback.format_exc()}
            print(f"[FAIL] {name}")
            print("".join(traceback.format_exception(type(e), e, e.__traceback__)))

        finished_at = utc_now_iso()
        duration_ms = int((time.time() - start_ts) * 1000)

        request_record = {
            "method": method,
            "url": url,
            "headers": mask_headers(merged_headers),
            "params": params,
            "json": json_body,
            "data": data,
            "files": _files_repr(files),
        }
        response_record = {}
        if resp is not None:
            response_record = {
                "status_code": resp.status_code,
                "headers": dict(resp.headers),
                "elapsed_ms": int(resp.elapsed.total_seconds() * 1000),
                "content_type": resp.headers.get("content-type"),
                "body": payload,
            }

        case = CaseRecord(
            case_id=case_id,
            module=self.reporter.module,
            name=name,
            started_at=started_at,
            finished_at=finished_at,
            duration_ms=duration_ms,
            request=request_record,
            response=response_record,
            assertions=assertions,
            ok=bool(ok),
            error_category=error_category,
            error_message=error_message,
            exception=exc_info,
        )
        self.reporter.record_case(case)
        return bool(ok), resp, payload


def _files_repr(files: Any) -> Any:
    if files is None:
        return None
    try:
        if isinstance(files, dict):
            out = {}
            for k, v in files.items():
                if isinstance(v, tuple) and len(v) >= 2:
                    filename = v[0]
                    obj = v[1]
                    size = None
                    try:
                        if isinstance(obj, (bytes, bytearray)):
                            size = len(obj)
                            out[k] = {"filename": filename, "size": size}
                            continue
                        pos = obj.tell()
                        obj.seek(0, 2)
                        size = obj.tell()
                        obj.seek(pos)
                    except Exception:
                        pass
                    out[k] = {"filename": filename, "size": size}
                else:
                    out[k] = str(v)
            return out
    except Exception:
        return str(files)
    return str(files)


def _get_json_path(obj: Any, path: str) -> Any:
    if path in {"", "$"}:
        return obj
    cur = obj
    parts = [p for p in path.strip().split(".") if p]
    for p in parts:
        if cur is None:
            return None
        if isinstance(cur, dict):
            cur = cur.get(p)
            continue
        return None
    return cur
