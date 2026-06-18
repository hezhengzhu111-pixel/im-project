# Coverage Policy

Coverage has two gates:

- Completeness gate: route, endpoint, page route, dynamic path, legacy path,
  critical E2EE/SIT, and public inventory checks must not be missing.
- Percentage gate: line coverage must meet the configured threshold, or the
  project must keep a generated baseline from falling while critical scopes
  reach their target.

Initial thresholds:

| scope | line threshold |
| --- | ---: |
| Rust workspace overall | 65% |
| Rust `im-e2ee-core` | 85% |
| Rust `im-e2ee-ffi` | 75% |
| Rust `im-flutter-bridge` | 70% |
| Rust `im-common` | 75% |
| Rust `api-server` | 60% |
| Flutter combined overall | 70% |
| Flutter `packages/core` | 85% |
| Flutter `packages/core_flutter` | 75% |
| Flutter `packages/shared_features` | 75% |
| Flutter `apps/web` | 60% |
| Flutter `apps/mobile` | 60% |
| Flutter `apps/desktop` | 60% |

Allowed percentage exclusions are generated files, `*.g.dart`,
`*.freezed.dart`, `*.gen.dart`, l10n generated files, generated FRB bindings,
and unstable bootstrap/platform registration glue.

Do not exclude API clients, endpoint contracts, providers/notifiers, business
pages, route files, E2EE manager/session/key store, or security sanitizer/logger
code.
