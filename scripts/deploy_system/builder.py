from __future__ import annotations

import importlib
import os
import platform
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from deploy_utils import compose_base_command, DeploymentConfig, fatal, run_command
from runtime_paths import PROJECT_ROOT

legacy_build = importlib.import_module("build")


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
    print(f"$ {printable} (cwd: {legacy_build.relative(cwd)})")
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


def _sync_sources() -> None:
    legacy_build.sync_source_tree(legacy_build.SOURCE_SQL_ROOT, legacy_build.WORK_SQL_ROOT)
    legacy_build.sync_source_tree(legacy_build.SOURCE_RUST_ROOT, legacy_build.WORK_RUST_ROOT)
    legacy_build.sync_source_tree(legacy_build.SOURCE_FLUTTER_ROOT, legacy_build.WORK_FLUTTER_ROOT)
    legacy_build.sync_source_tree(legacy_build.SOURCE_SPRING_AI_ROOT, legacy_build.WORK_SPRING_AI_ROOT)


def _cargo_profile_dir(profile: str) -> Path:
    return legacy_build.CARGO_TARGET_DIR / ("release" if profile == "release" else "debug")


def build_rust(profile: str) -> None:
    cargo = legacy_build.ensure_tool("cargo", ["cargo"])
    args = ["build", f"--{profile}", "-p", "api-server", "-p", "im-server"]
    _run([cargo, *args], cwd=legacy_build.WORK_RUST_ROOT, env=legacy_build.rust_env())
    exe_suffix = ".exe" if platform.system() == "Windows" else ""
    for name in ("api-server", "im-server"):
        source = _cargo_profile_dir(profile) / f"{name}{exe_suffix}"
        dest = legacy_build.DIST_RUST_DIR / name / source.name
        legacy_build.copy_artifact(source, dest)


def build_spring_ai() -> None:
    args, cwd, env, _recorded = legacy_build.spring_ai_maven_invocation()
    _run(args, cwd=cwd, env=env)
    jars = sorted(
        path
        for path in (legacy_build.WORK_SPRING_AI_ROOT / "target").glob("*.jar")
        if path.is_file() and not path.name.endswith(("-sources.jar", "-javadoc.jar", ".original"))
    )
    if not jars:
        raise RuntimeError("Spring AI build did not produce a jar under build/work/spring-ai/target.")
    legacy_build.remove_tree(legacy_build.DIST_SPRING_AI_DIR)
    legacy_build.DIST_SPRING_AI_DIR.mkdir(parents=True, exist_ok=True)
    for jar in jars:
        legacy_build.copy_artifact(jar, legacy_build.DIST_SPRING_AI_DIR / jar.name)


def build_web(profile: str) -> None:
    wasm_pack = legacy_build.ensure_tool("wasm-pack", ["wasm-pack"])
    python_cmd = legacy_build.ensure_tool("Python", ["python", "python3"])
    wasm_args = [
        "build",
        "--target",
        "no-modules",
        "--out-dir",
        str(legacy_build.WORK_WEB_WASM_PKG_DIR),
        "--no-default-features",
    ]
    _run(
        [wasm_pack, *wasm_args],
        cwd=legacy_build.WORK_WASM_BRIDGE_ROOT,
        env={
            **legacy_build.rust_env(),
            "RUSTFLAGS": "-C target-feature=-atomics,-bulk-memory,-mutable-globals",
            "WASM_OPT": "0",
        },
    )
    _run(
        [
            python_cmd,
            str(legacy_build.WORK_WASM_BRIDGE_ROOT / "patch_wasm_js.py"),
            str(legacy_build.WORK_WEB_WASM_PKG_DIR / "im_rust_bridge.js"),
        ],
        cwd=legacy_build.WORK_WASM_BRIDGE_ROOT,
    )
    legacy_build.assert_web_wasm_bridge_assets(legacy_build.WORK_WEB_WASM_PKG_DIR)

    flutter = legacy_build.ensure_tool("flutter", ["flutter"])
    output_dir = legacy_build.DIST_FRONTEND_DIR / "web"
    legacy_build.remove_tree(output_dir)
    help_text = _run(
        [flutter, "build", "web", "-h"],
        cwd=legacy_build.WORK_WEB_ROOT,
        env=legacy_build.flutter_env(),
        capture_output=True,
    ).stdout
    output_arg = f"--output={output_dir}"
    if "--output" not in help_text:
        output_arg = f"--output-dir={output_dir}"
    args = ["build", "web", f"--{profile}", "--pwa-strategy=none", output_arg]
    if "wasm-dry-run" in help_text:
        args.append("--no-wasm-dry-run")
    _run([flutter, "pub", "get"], cwd=legacy_build.WORK_WEB_ROOT, env=legacy_build.flutter_env())
    _run([flutter, *args], cwd=legacy_build.WORK_WEB_ROOT, env=legacy_build.flutter_env())
    if not (output_dir / "index.html").is_file():
        raise RuntimeError(f"Flutter web build did not produce {legacy_build.relative(output_dir / 'index.html')}")
    legacy_build.assert_web_wasm_bridge_assets(output_dir / "pkg")
    legacy_build.print_artifact(output_dir / "index.html")


def build_docker_images(config: DeploymentConfig, services: Sequence[str], *, package_images: bool) -> None:
    cmd = [*compose_base_command(config), "build", "--parallel", *services]
    run_command(cmd, cwd=config.project_dir)
    if not package_images:
        return
    docker = legacy_build.ensure_tool("Docker", ["docker"])
    legacy_build.DIST_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    generated: dict[str, str] = {}
    for service in services:
        image = legacy_build.DOCKER_IMAGES.get(service)
        if not image:
            continue
        tar_path = legacy_build.DIST_IMAGES_DIR / f"{service}.tar"
        _run([docker, "save", "-o", str(tar_path), image], cwd=PROJECT_ROOT, env=legacy_build.docker_env())
        generated[service] = legacy_build.relative(tar_path)
        legacy_build.print_artifact(tar_path)
    state = {}
    if legacy_build.STATE_FILE.is_file():
        state = legacy_build.json.loads(legacy_build.STATE_FILE.read_text(encoding="utf-8"))
    state["docker_images"] = generated
    legacy_build.STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    legacy_build.STATE_FILE.write_text(legacy_build.json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def build_all(config: DeploymentConfig, options: BuildOptions) -> None:
    try:
        if options.clean:
            legacy_build.remove_tree(legacy_build.WORK_DIR)
            legacy_build.remove_tree(legacy_build.DIST_DIR)
            legacy_build.remove_tree(legacy_build.LOGS_DIR)
        legacy_build.ensure_base_dirs()
        _sync_sources()

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
                    except Exception as exc:  # noqa: BLE001
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

        builder = legacy_build.Builder(options.profile)
        builder.write_manifest()
    except subprocess.CalledProcessError as exc:
        fatal(f"Build command failed with exit code {exc.returncode}: {' '.join(str(part) for part in exc.cmd)}")
    except Exception as exc:  # noqa: BLE001
        fatal(f"Build failed: {exc}")
