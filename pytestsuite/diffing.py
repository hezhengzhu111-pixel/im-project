from __future__ import annotations

from dataclasses import dataclass
from typing import Any, List, Optional

from .matchers import match_expected, to_expected_repr


@dataclass
class DiffItem:
    path: str
    expected: Any
    actual: Any
    reason: str

    def to_dict(self) -> dict:
        return {
            "path": self.path,
            "expected": to_expected_repr(self.expected),
            "actual": self.actual,
            "reason": self.reason,
        }


def _join(path: str, part: str) -> str:
    if not path:
        return part
    if part.startswith("["):
        return f"{path}{part}"
    return f"{path}.{part}"


def diff_subset(expected: Any, actual: Any, path: str = "") -> List[DiffItem]:
    diffs: List[DiffItem] = []

    matcher_reason = match_expected(expected, actual)
    if matcher_reason is None and not isinstance(expected, (dict, list)):
        return diffs
    if isinstance(expected, dict):
        if not isinstance(actual, dict):
            diffs.append(DiffItem(path or "$", expected, actual, "type mismatch: expected object"))
            return diffs
        for k, v in expected.items():
            if k not in actual:
                diffs.append(DiffItem(_join(path, k), v, None, "missing key"))
                continue
            diffs.extend(diff_subset(v, actual.get(k), _join(path, k)))
        return diffs

    if isinstance(expected, list):
        if not isinstance(actual, list):
            diffs.append(DiffItem(path or "$", expected, actual, "type mismatch: expected array"))
            return diffs
        if len(expected) != len(actual):
            diffs.append(DiffItem(path or "$", expected, actual, f"length mismatch: expected {len(expected)}, got {len(actual)}"))
            return diffs
        for i, v in enumerate(expected):
            diffs.extend(diff_subset(v, actual[i], _join(path, f"[{i}]")))
        return diffs

    if matcher_reason is not None:
        diffs.append(DiffItem(path or "$", expected, actual, matcher_reason))
    return diffs


def first_diff(expected: Any, actual: Any) -> Optional[DiffItem]:
    diffs = diff_subset(expected, actual)
    return diffs[0] if diffs else None

