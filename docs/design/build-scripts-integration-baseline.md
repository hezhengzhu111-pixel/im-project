# Build Scripts Integration Baseline

## Scope

This audit covers the existing Flutter, Rust, Docker Compose, deployment, and CI build entry points before introducing the repository-level local artifact build script. It does not change business code, Docker deployment behavior, Rust workspace layout, or Flutter application layout.

## Flutter Build Entry Points

- `flutter/melos.yaml` defines the Flutter workspace packages as `packages/**` and `apps/**`. Its existing `build:web` script delegates to `dart run tool/build_web.dart`.
- `flutter/tool/build_web.dart` builds only `flutter/apps/web`. It computes the repository root from the script location and currently writes to `build/flutter/web`.
- `flutter/apps/web/Dockerfile` is a Docker image build path. It builds the web app inside the container and copies `/app/apps/web/build/web` into nginx.
- `flutter/apps/web/pubspec.yaml` declares the `im_web` package and local Flutter package dependencies. It is not a repository-level build orchestrator.

Findings:

- No hard-coded `D:/project/new-im-project` path is present in `flutter/melos.yaml`.
- `build:web` is Flutter-specific and only builds the web app.
- The existing Flutter helper writes to `build/flutter/web`, which is outside the requested `build/dist/frontend/web` artifact layout.
- Melos should remain scoped to the Flutter workspace. Repository-level orchestration belongs in `scripts/build.py`.

## Rust Build Entry Points

- `rust/Cargo.toml` is the Rust workspace root. It includes `apps/api-server`, `apps/im-server`, and `crates/im-flutter-bridge`.
- `rust/apps/api-server/Cargo.toml` defines package `api-server`, which produces the API backend binary.
- `rust/apps/im-server/Cargo.toml` defines package `im-server`, which produces the IM backend binary.
- `rust/crates/im-flutter-bridge/Cargo.toml` defines package `im-flutter-bridge` with library name `im_rust_bridge` and `cdylib` output.
- `rust/apps/api-server/Dockerfile` and `rust/apps/im-server/Dockerfile` build service images and copy release binaries into runtime images. They are Docker image entry points, not local artifact collectors.

Findings:

- Rust Dockerfiles serve image builds only.
- There is no single local Rust artifact collection command that copies `api-server`, `im-server`, and the bridge dynamic library into `build/dist`.
- Cargo cache can be redirected by setting `CARGO_TARGET_DIR=build/cache/rust-target` from a root build script.

## Docker Compose And Deployment Entry Points

- `deploy/sit/docker-compose.yml` defines middleware, Rust backend services, the Flutter frontend, and `im-spring-ai`.
- `scripts/deploy_utils.py` centralizes Docker Compose command construction, Docker checks, environment loading, and service status helpers.
- `scripts/deploy_services.py` deploys application services through Docker Compose. `APP_SERVICES` currently includes `im-server`, `im-api-server`, and `im-frontend`; `im-spring-ai` aliases are commented out as temporarily disabled.
- `scripts/deploy_middleware.py` deploys middleware services.
- `scripts/init_db.py` initializes or checks the MySQL database through Docker Compose and Docker.

Findings:

- `deploy_services.py` is responsible for Docker Compose deployment, not local artifact collection.
- Existing Docker deployment should remain on Dockerfiles plus Compose.
- `im-spring-ai` has a Dockerfile and Maven package output, but it is temporarily disabled in `deploy_services.py`; the unified local build should document that state and not force-build Spring AI until the service is re-enabled as an app deployment target.

## CI Build Entry Points

- `.github/workflows/e2ee-rust-ci.yml` validates E2EE Rust crates with formatting, clippy, tests, and a wasm target check.
- `.github/workflows/rust-bridge-ci.yml` validates the Rust bridge and Flutter bridge package, including a release build and smoke test.

Findings:

- Existing workflows are targeted checks, not a unified build artifact workflow.
- No workflow currently uploads `build/dist` and `build/manifest.json` as local build artifacts.

## Current Problems To Address

- There is no unified `build/dist` artifact directory for backend binaries, Flutter web output, and the Rust bridge dynamic library.
- `build/` is already ignored by the root `.gitignore`.
- Build entry points are spread across Melos, Flutter helper scripts, Cargo, Dockerfiles, Docker Compose, and CI workflows.
- The new root build script should coordinate local artifacts without replacing Dockerfiles or deployment scripts.
