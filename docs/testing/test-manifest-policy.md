# Test Manifest Evidence Policy

`public_api` is a hard gate. A public API item with `missing` status fails PR,
main, and gray-release gates. `public_api` items must not be converted to
`allowed_missing` to bypass the gate.

Allowed missing entries are only for explicitly allowlisted non-business
inventory, such as internal routes, generated code, bootstrap glue, platform
glue, or internal test helpers. Every `allowed_missing` entry must have a
reason.

Endpoint evidence is conservative:

- Static endpoint constants are covered only by the full path literal in the
  endpoint contract test, or `@coversEndpoint('Class.member')`.
- Dynamic endpoint builders must use `Uri.encodeComponent`.
- Dynamic endpoint tests must include a special-character input and an encoded
  expected path, or `@coversEndpoint('Class.member')` plus encoded expected
  path evidence.
- Merely mentioning a method or class name is not endpoint coverage.

Page route evidence is conservative:

- Each business route must appear as the full route string in a test, or as
  `@coversRoute('platform:/route')`.
- Fallback/404 routes are handled by the fallback rule.
- A generic file name such as `mobile_route_test.dart` or text such as `route
  tests` does not cover every route.

Public API evidence is symbol-level:

- A test name contains the symbol, or
- a test file contains `@coversSymbol('symbolName')`, or
- a test file contains an exact method/function call and the test file or test
  name points to the API class/file.

Generated FRB, generated Dart, `freezed`, `g.dart`, private helpers,
serialization helpers, and widget `build` methods are excluded from public API
inventory. API clients, providers, notifiers, and public Rust functions remain
in scope.
