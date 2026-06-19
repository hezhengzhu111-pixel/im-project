from __future__ import annotations

import importlib
import json
import os
import platform
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from deploy_utils import compose_base_command, DeploymentConfig, fatal, run_command
from . import paths
from .sync import sync_rust_source, sync_flutter_source, sync_spring_ai_source
from .source_guard import check_source_pollution


@dataclass(frozen=True)
class BuildOptions:
    profile: str = "release"
    clean: bool = False
    skip_rust: bool = False
    skip_web: bool = False
    skip_spring_ai: bool = False
    docker: bool = False
    package_images: bool = False
    parallel: bool = True


def _run(command: Sequence[object], *, cwd: Path, env: dict[str, str] | None = None, capture_output: bool = False):
    printable = " ".join(str(part) for part in command)
    print(f"$ {printable} (cwd: {paths.relative(cwd)})")
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    return subprocess.run(
        [str(part) for part in command],
        cwd=str(cwd),
        env=merged_env,
        check=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=capture_output,
    )


def _sync_sources(verbose: bool = False) -> None:
    """Sync source code to work directories with appropriate ignore patterns."""
    print("[SYNC] Syncing source code to work directories...")

    # Sync Rust
    stats = sync_rust_source(paths.RUST_SOURCE, paths.RUST_WORK, verbose=verbose)
    print(f"[SYNC] Rust: {stats}")

    # Sync Flutter
    stats = sync_flutter_source(paths.FLUTTER_SOURCE, paths.FLUTTER_WORK, verbose=verbose)
    print(f"[SYNC] Flutter: {stats}")

    # Sync Spring AI
    stats = sync_spring_ai_source(paths.SPRING_AI_SOURCE, paths.SPRING_AI_WORK, verbose=verbose)
    print(f"[SYNC] Spring AI: {stats}")

    # Copy SQL directory (simple copy, no filtering needed)
    if paths.SQL_SOURCE.exists():
        if paths.WORK_DIR / "sql" != paths.SQL_SOURCE:
            shutil.copytree(paths.SQL_SOURCE, paths.WORK_DIR / "sql", dirs_exist_ok=True)
            print("[SYNC] SQL: copied")


def _ensure_tool(name: str, commands: list[str]) -> str:
    """Ensure a tool is available and return its path."""
    for cmd in commands:
        resolved = shutil.which(cmd) or cmd
        try:
            subprocess.run(
                [resolved, "--version"],
                capture_output=True,
                check=True,
            )
            return resolved
        except (subprocess.CalledProcessError, FileNotFoundError):
            continue

    fatal(f"{name} not found. Please install it and ensure it's in your PATH.")
    return ""  # Never reached, but satisfies type checker


def _rust_env() -> dict[str, str]:
    """Return environment variables for Rust builds."""
    env = os.environ.copy()
    env["CARGO_HOME"] = str(paths.CARGO_HOME)
    env["CARGO_TARGET_DIR"] = str(paths.CARGO_TARGET)
    return env


def _flutter_env() -> dict[str, str]:
    """Return environment variables for Flutter builds."""
    env = os.environ.copy()
    env["PUB_CACHE"] = str(paths.PUB_CACHE)
    return env


def _maven_env() -> dict[str, str]:
    """Return environment variables for Maven builds."""
    env = os.environ.copy()
    env["MAVEN_OPTS"] = f"-Dmaven.repo.local={paths.MAVEN_REPO}"
    return env


def _docker_env() -> dict[str, str]:
    """Return environment variables for Docker builds."""
    env = os.environ.copy()
    env["DOCKER_CONFIG"] = str(paths.DOCKER_CACHE)
    return env


def _cargo_profile_dir(profile: str) -> Path:
    return paths.CARGO_TARGET / ("release" if profile == "release" else "debug")


def build_rust(profile: str) -> None:
    cargo = _ensure_tool("cargo", ["cargo"])
    args = ["build", "-p", "api-server", "-p", "im-server"]
    if profile == "release":
        args.insert(1, "--release")
    elif profile != "debug":
        args.insert(1, profile)
        args.insert(1, "--profile")
    _run([cargo, *args], cwd=paths.RUST_WORK, env=_rust_env())
    exe_suffix = ".exe" if platform.system() == "Windows" else ""
    for name in ("api-server", "im-server"):
        source = _cargo_profile_dir(profile) / f"{name}{exe_suffix}"
        dest = paths.DIST_DIR / "rust" / name / source.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, dest)
        print(f"[BUILD] Rust {name}: {paths.relative(dest)}")


def build_spring_ai() -> None:
    # Find pom.xml in spring-ai directory
    pom_file = paths.SPRING_AI_WORK / "pom.xml"
    if not pom_file.exists():
        print("[SKIP] Spring AI pom.xml not found, skipping build")
        return

    mvn = _ensure_tool("Maven", ["mvn", "mvnw"])
    args = [mvn, "package", "-DskipTests"]
    _run(args, cwd=paths.SPRING_AI_WORK, env=_maven_env())

    # Find built JARs
    target_dir = paths.SPRING_AI_WORK / "target"
    jars = sorted(
        path
        for path in target_dir.glob("*.jar")
        if path.is_file() and not path.name.endswith(("-sources.jar", "-javadoc.jar", ".original"))
    )
    if not jars:
        raise RuntimeError("Spring AI build did not produce a jar")

    # Copy to dist
    dist_dir = paths.DIST_DIR / "spring-ai"
    dist_dir.mkdir(parents=True, exist_ok=True)
    for jar in jars:
        shutil.copy2(jar, dist_dir / jar.name)
        print(f"[BUILD] Spring AI: {paths.relative(dist_dir / jar.name)}")


def build_web(profile: str) -> None:
    # Build WASM bridge
    wasm_pack = _ensure_tool("wasm-pack", ["wasm-pack"])
    python_cmd = _ensure_tool("Python", ["python", "python3"])

    wasm_bridge_dir = paths.RUST_WORK / "crates" / "im-e2ee-wasm"
    wasm_output_dir = paths.FLUTTER_WORK / "apps" / "web" / "pkg"

    wasm_args = [
        "build",
        "--target",
        "no-modules",
        "--out-dir",
        str(wasm_output_dir),
        "--no-default-features",
    ]

    env = _rust_env()
    env["RUSTFLAGS"] = "-C target-feature=-atomics,-bulk-memory,-mutable-globals"
    env["WASM_OPT"] = "0"

    _run(
        [wasm_pack, *wasm_args],
        cwd=wasm_bridge_dir,
        env=env,
    )

    # Patch WASM JS
    patch_script = wasm_bridge_dir / "patch_wasm_js.py"
    if patch_script.exists():
        _run(
            [python_cmd, str(patch_script), str(wasm_output_dir / "im_rust_bridge.js")],
            cwd=wasm_bridge_dir,
        )

    # Build Flutter web
    flutter = _ensure_tool("flutter", ["flutter"])
    web_dir = paths.FLUTTER_WORK / "apps" / "web"
    output_dir = paths.DIST_DIR / "flutter" / "web"

    # Clean and rebuild
    if output_dir.exists():
        shutil.rmtree(output_dir)

    # Get flutter build help to determine output argument
    help_text = _run(
        [flutter, "build", "web", "-h"],
        cwd=web_dir,
        env=_flutter_env(),
        capture_output=True,
    ).stdout

    output_arg = f"--output={output_dir}"
    if "--output" not in help_text:
        output_arg = f"--output-dir={output_dir}"

    args = ["build", "web", f"--{profile}", "--pwa-strategy=none", output_arg]
    if "wasm-dry-run" in help_text:
        args.append("--no-wasm-dry-run")

    _run([flutter, "pub", "get"], cwd=web_dir, env=_flutter_env())
    _run([flutter, *args], cwd=web_dir, env=_flutter_env())

    if not (output_dir / "index.html").is_file():
        raise RuntimeError(f"Flutter web build did not produce {paths.relative(output_dir / 'index.html')}")

    print(f"[BUILD] Flutter web: {paths.relative(output_dir)}")


def build_docker_images(config: DeploymentConfig, services: Sequence[str], *, package_images: bool) -> None:
    cmd = [*compose_base_command(config), "build", "--parallel", *services]
    run_command(cmd, cwd=config.project_dir)

    if not package_images:
        return

    docker = _ensure_tool("Docker", ["docker"])
    dist_images_dir = paths.DIST_DIR / "images"
    dist_images_dir.mkdir(parents=True, exist_ok=True)

    DOCKER_IMAGES = {
        "im-api-server": "im-project-sit/im-api-server:latest",
        "im-server": "im-project-sit/im-server:latest",
        "im-frontend": "im-project-sit/im-frontend:latest",
        "im-spring-ai": "im-project-sit/im-spring-ai:latest",
    }

    generated: dict[str, str] = {}
    for service in services:
        image = DOCKER_IMAGES.get(service)
        if not image:
            continue

        tar_path = dist_images_dir / f"{service}.tar"
        _run([docker, "save", "-o", str(tar_path), image], cwd=paths.PROJECT_ROOT, env=_docker_env())
        generated[service] = paths.relative(tar_path)
        print(f"[BUILD] Docker image: {paths.relative(tar_path)}")

    # Update manifest
    manifest = {}
    if paths.MANIFEST_FILE.is_file():
        try:
            manifest = json.loads(paths.MANIFEST_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            print(f"[BUILD] [WARNING] Failed to read manifest file, will overwrite: {exc}", file=sys.stderr)

    manifest["docker_image_names"] = DOCKER_IMAGES
    manifest["docker_image_tar_paths"] = generated

    paths.MANIFEST_FILE.parent.mkdir(parents=True, exist_ok=True)
    paths.MANIFEST_FILE.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def build_all(config: DeploymentConfig, options: BuildOptions) -> None:
    try:
        # Check for source pollution before build
        print("[BUILD] Checking for source pollution...")
        if check_source_pollution(paths.PROJECT_ROOT, verbose=True):
            fatal(
                "Source directory pollution detected! "
                "Run 'python scripts/imctl.py clean source-pollution' to clean."
            )

        if options.clean:
            print("[BUILD] Cleaning work, dist, and logs directories...")
            for dir_path in [paths.WORK_DIR, paths.DIST_DIR, paths.LOGS_DIR]:
                if dir_path.exists():
                    shutil.rmtree(dir_path)

        # Ensure build directory structure
        paths.ensure_build_structure()

        # Sync source code to work directories
        _sync_sources(verbose=options.profile == "debug")

        # Build tasks
        tasks: list[tuple[str, callable]] = []
        if not options.skip_rust:
            tasks.append(("rust", lambda: build_rust(options.profile)))
        if not options.skip_spring_ai:
            tasks.append(("spring-ai", build_spring_ai))

        if options.parallel and len(tasks) > 1:
            failures: list[str] = []
            with ThreadPoolExecutor(max_workers=len(tasks)) as pool:
                futures = {pool.submit(fn): name for name, fn in tasks}
                for future in as_completed(futures):
                    name = futures[future]
                    try:
                        future.result()
                    except Exception as exc:
                        failures.append(f"{name}: {exc}")
            if failures:
                fatal("Build failed:\n" + "\n".join(f"  - {item}" for item in failures))
        else:
            for _name, fn in tasks:
                fn()

        if not options.skip_web:
            build_web(options.profile)

        if options.docker:
            services = ["im-api-server", "im-server", "im-frontend"]
            if not options.skip_spring_ai:
                services.append("im-spring-ai")
            build_docker_images(config, services, package_images=options.package_images)

        # Write build manifest
        _write_manifest(options)

        # Check for source pollution after build
        print("[BUILD] Post-build pollution check...")
        if check_source_pollution(paths.PROJECT_ROOT, verbose=True):
            print("[WARNING] Source pollution detected after build!")

        print("[BUILD] Build complete!")

    except subprocess.CalledProcessError as exc:
        fatal(f"Build command failed with exit code {exc.returncode}: {' '.join(str(part) for part in exc.cmd)}")
    except Exception as exc:
        fatal(f"Build failed: {exc}")


def _write_manifest(options: BuildOptions) -> None:
    """Write build manifest with metadata."""
    manifest = {
        "profile": options.profile,
        "build_time": str(paths.PROJECT_ROOT.stat().st_mtime),
        "paths": {
            "work": paths.relative(paths.WORK_DIR),
            "dist": paths.relative(paths.DIST_DIR),
            "logs": paths.relative(paths.LOGS_DIR),
            "runtime": paths.relative(paths.RUNTIME_DIR),
        },
    }

    # Merge with existing manifest if it exists
    if paths.MANIFEST_FILE.is_file():
        try:
            existing = json.loads(paths.MANIFEST_FILE.read_text(encoding="utf-8"))
            manifest.update(existing)
        except (json.JSONDecodeError, OSError) as exc:
            print(f"[BUILD] [WARNING] Failed to read existing manifest, will overwrite: {exc}", file=sys.stderr)

    paths.MANIFEST_FILE.parent.mkdir(parents=True, exist_ok=True)
    paths.MANIFEST_FILE.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"[BUILD] Manifest: {paths.relative(paths.MANIFEST_FILE)}")
