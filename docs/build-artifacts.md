# Build Artifacts

## Goal

All local deliverable artifacts are collected under `build/dist`.

Compilation caches are kept under `build/cache`.

The root build script is:

```sh
python scripts/build.py all
```

## Commands

```sh
python scripts/build.py clean
python scripts/build.py clean-work
python scripts/build.py clean-dist
python scripts/build.py clean-cache
python scripts/build.py rust
python scripts/build.py bridge
python scripts/build.py web
python scripts/build.py spring-ai
python scripts/build.py manifest
python scripts/build.py docker-images
```

Useful options:

```sh
python scripts/build.py all --no-clean
python scripts/build.py all --skip-web
python scripts/build.py all --skip-rust
python scripts/build.py all --skip-bridge
python scripts/build.py all --docker
python scripts/build.py rust --profile debug
```

## Output Layout

- `build/dist/rust/api-server`
- `build/dist/rust/im-server`
- `build/dist/rust/rust-bridge`
- `build/dist/frontend/web`
- `build/dist/spring-ai`
- `build/dist/images`
- `build/work/flutter`
- `build/work/rust`
- `build/work/spring-ai`
- `build/work/sql`
- `build/cache/cargo-home`
- `build/cache/rust-target`
- `build/cache/pub-cache`
- `build/cache/maven-repo`
- `build/manifest.json`

`build/` is ignored by git and must not be committed.

## Docker Boundary

- `scripts/build.py` collects local and CI build artifacts.
- `scripts/deploy_services.py` deploys services through Docker Compose.
- `docs/deployment.md` documents the full deployment workflow and the root compatibility entry points.
- `rust/apps/*/Dockerfile`, `flutter/apps/web/Dockerfile`, and `spring-ai/Dockerfile` continue to build Docker images.
- `scripts/build.py docker-images` builds from synchronized `build/work` contexts and saves image tar files under `build/dist/images`.
- `scripts/build.py` does not replace `scripts/deploy_services.py`.
- `scripts/deploy_services.py` does not collect `build/dist` artifacts.
- `python scripts/build.py docker-images` is optional and is not part of the default `all` command because it depends on Docker and is slower than local artifact collection.

## Platform Differences

- Windows backend binaries use `.exe`.
- Windows Rust bridge dynamic library: `im_rust_bridge.dll`.
- macOS Rust bridge dynamic library: `libim_rust_bridge.dylib`.
- Linux Rust bridge dynamic library: `libim_rust_bridge.so`.

## Verification

After a build, run:

```sh
python scripts/check_build_outputs.py
```

The checker validates `build/manifest.json`, backend binaries, Flutter web output, the Rust bridge dynamic library, and Docker tar files only when the manifest records generated Docker images.
