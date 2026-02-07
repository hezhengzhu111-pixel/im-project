import re
from dataclasses import dataclass
from typing import Any, Optional, Type


@dataclass(frozen=True)
class AnyValue:
    label: str = "ANY"


ANY = AnyValue()


@dataclass(frozen=True)
class TypeIs:
    typ: Type[Any]


@dataclass(frozen=True)
class Regex:
    pattern: str
    flags: int = 0

    def matches(self, value: Any) -> bool:
        if value is None:
            return False
        return re.search(self.pattern, str(value), flags=self.flags) is not None


def to_expected_repr(value: Any) -> Any:
    if isinstance(value, AnyValue):
        return {"__any__": value.label}
    if isinstance(value, TypeIs):
        return {"__type__": getattr(value.typ, "__name__", str(value.typ))}
    if isinstance(value, Regex):
        return {"__regex__": value.pattern, "__flags__": value.flags}
    if isinstance(value, dict):
        return {k: to_expected_repr(v) for k, v in value.items()}
    if isinstance(value, list):
        return [to_expected_repr(v) for v in value]
    if isinstance(value, tuple):
        return [to_expected_repr(v) for v in value]
    return value


def match_expected(expected: Any, actual: Any) -> Optional[str]:
    if isinstance(expected, AnyValue):
        return None
    if isinstance(expected, TypeIs):
        if isinstance(actual, expected.typ):
            return None
        return f"type mismatch: expected {expected.typ.__name__}, got {type(actual).__name__}"
    if isinstance(expected, Regex):
        if expected.matches(actual):
            return None
        return f"regex mismatch: pattern={expected.pattern}"
    if expected == actual:
        return None
    return "value mismatch"
