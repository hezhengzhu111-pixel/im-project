#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import platform
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BUILD_DIR = PROJECT_ROOT / "build"
DIST_DIR = BUILD_DIR / "dist"
CACHE_DIR = BUILD_DIR / "cache"
LOGS_DIR = BUILD_DIR / "logs"
STATE_FILE = LOGS_DIR / "build-state.json"
RUST_ROOT = PROJECT_ROOT / "rust"
WEB_ROOT = PROJECT_ROOT / "flutter" / "apps" / "web"
WASM_BRIDGE_ROOT = RUST_ROOT / "crates" / "im-flutter-bridge"
WEB_WASM_PKG_DIR = WEB_ROOT / "web" / "pkg"
COMPOSE_FILE = PROJECT_ROOT / "deploy" / "sit" / "docker-compose.yml"
DOCKER_IMAGES = {
    "im-api-server": "im-project-sit/im-api-server:latest",
    "im-server": "im-project-sit/im-server:latest",
    "im-frontend": "im-project-sit/im-frontend:latest",
}


def main() -> None:
    args = parse_args()
    try:
        builder = Builder(args.profile)
        if args.command == "all":
            builder.all(
                no_clean=args.no_clean,
                skip_rust=args.skip_rust,
                skip_bridge=args.skip_bridge,
                skip_web=args.skip_web,
                include_docker=args.docker,
            )
        elif args.command == "clean":
            builder.clean()
        elif args.command == "rust":
            builder.build_rust()
        elif args.command == "bridge":
            builder.build_bridge()
        elif args.command == "web":
            builder.build_web()
        elif args.command == "docker-images":
            builder.build_docker_images(update_manifest=True)
        elif args.command == "manifest":
            builder.write_manifest()
        else:
            raise BuildError(f"Unknown command: {args.command}")
    except BuildError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
    except subprocess.CalledProcessError as exc:
        print(f"ERROR: command failed with exit code {exc.returncode}: {format_command(exc.cmd)}", file=sys.stderr)
        sys.exit(exc.returncode or 1)
    except FileNotFoundError as exc:
        print(f"ERROR: executable was not found: {exc.filename}", file=sys.stderr)
        sys.exit(1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build local IM project artifacts into build/dist.")
    parser.add_argument(
        "command",
        choices=["all", "rust", "web", "bridge", "clean", "docker-images", "manifest"],
        help="Build command to run.",
    )
    parser.add_argument(
        "--no-clean",
        action="store_true",
        help="Do not delete build/ before the all command.",
    )
    parser.add_argument(
        "--profile",
        choices=["release", "debug"],
        default="release",
        help="Cargo/Flutter build profile. Defaults to release.",
    )
    parser.add_argument("--skip-web", action="store_true", help="Skip the web build during all.")
    parser.add_argument("--skip-rust", action="store_true", help="Skip backend Rust builds during all.")
    parser.add_argument("--skip-bridge", action="store_true", help="Skip Rust bridge build during all.")
    parser.add_argument(
        "--docker",
        action="store_true",
        help="Run docker-images after the default all sequence.",
    )
    return parser.parse_args()


class BuildError(RuntimeError):
    pass


class Builder:
    def __init__(self, profile: str) -> None:
        self.profile = profile
        ensure_tool("Python", ["python", "python3"])

    @property
    def cargo_profile_dir(self) -> Path:
        return self.cargo_target_dir / ("release" if self.profile == "release" else "debug")

    @property
    def cargo_target_dir(self) -> Path:
        return CACHE_DIR / "rust-target"

    def all(
        self,
        *,
        no_clean: bool,
        skip_rust: bool,
        skip_bridge: bool,
        skip_web: bool,
        include_docker: bool,
    ) -> None:
        if not no_clean:
            self.clean()
        else:
            ensure_base_dirs()
        if not skip_rust:
            self.build_rust()
        if not skip_bridge:
            self.build_bridge()
        if not skip_web:
            self.build_web()
        if include_docker:
            self.build_docker_images(update_manifest=False)
        self.write_manifest()

    def clean(self) -> None:
        if BUILD_DIR.exists():
            shutil.rmtree(BUILD_DIR)
        ensure_base_dirs()
        self.record_command("clean", [])
        print(f"Cleaned build directory: {relative(BUILD_DIR)}")

    def build_rust(self) -> None:
        ensure_base_dirs()
        cargo = ensure_tool("cargo", ["cargo"])
        args = ["build", f"--{self.profile}", "-p", "api-server", "-p", "im-server"]
        self.run_external([cargo, *args], cwd=RUST_ROOT, env={"CARGO_TARGET_DIR": str(self.cargo_target_dir)})
        exe_suffix = ".exe" if platform.system() == "Windows" else ""
        for name in ("api-server", "im-server"):
            source = self.cargo_profile_dir / f"{name}{exe_suffix}"
            dest = DIST_DIR / "backend" / name / source.name
            copy_artifact(source, dest)
        self.record_command("rust", ["cargo", *args])

    def build_bridge(self) -> None:
        ensure_base_dirs()
        cargo = ensure_tool("cargo", ["cargo"])
        args = ["build", f"--{self.profile}", "-p", "im-flutter-bridge"]
        self.run_external([cargo, *args], cwd=RUST_ROOT, env={"CARGO_TARGET_DIR": str(self.cargo_target_dir)})
        source = self.cargo_profile_dir / bridge_library_name()
        dest = DIST_DIR / "rust_bridge" / source.name
        copy_artifact(source, dest)
        self.record_command("bridge", ["cargo", *args])

    def build_web_wasm_bridge(self) -> None:
        ensure_base_dirs()
        wasm_pack = ensure_tool("wasm-pack", ["wasm-pack"])
        python_cmd = ensure_tool("Python", ["python", "python3"])
        args = [
            "build",
            "--target",
            "no-modules",
            "--out-dir",
            str(WEB_WASM_PKG_DIR),
            "--no-default-features",
        ]
        self.run_external(
            [wasm_pack, *args],
            cwd=WASM_BRIDGE_ROOT,
            env={
                "RUSTFLAGS": "-C target-feature=-atomics,-bulk-memory,-mutable-globals",
                "WASM_OPT": "0",
            },
        )
        self.run_external(
            [
                python_cmd,
                str(WASM_BRIDGE_ROOT / "patch_wasm_js.py"),
                str(WEB_WASM_PKG_DIR / "im_rust_bridge.js"),
            ],
            cwd=WASM_BRIDGE_ROOT,
        )
        assert_web_wasm_bridge_assets(WEB_WASM_PKG_DIR)
        self.record_command("web-wasm-bridge", ["wasm-pack", *args])

    def build_web(self) -> None:
        ensure_base_dirs()
        self.build_web_wasm_bridge()
        flutter = ensure_tool("flutter", ["flutter"])
        output_dir = DIST_DIR / "frontend" / "web"
        if output_dir.exists():
            shutil.rmtree(output_dir)
        help_text = self.run_external(
            [flutter, "build", "web", "-h"],
            cwd=WEB_ROOT,
            capture_output=True,
        ).stdout
        output_arg = f"--output={output_dir}"
        if "--output" not in help_text:
            output_arg = f"--output-dir={output_dir}"
        args = ["build", "web", f"--{self.profile}", "--pwa-strategy=none", output_arg]
        if "wasm-dry-run" in help_text:
            args.append("--no-wasm-dry-run")
        self.run_external([flutter, *args], cwd=WEB_ROOT)
        if not (output_dir / "index.html").is_file():
            raise BuildError(f"Flutter web build did not produce {relative(output_dir / 'index.html')}")
        assert_web_wasm_bridge_assets(output_dir / "pkg")
        recorded_args = [
            "build",
            "web",
            f"--{self.profile}",
            "--pwa-strategy=none",
            f"--output={relative(output_dir)}",
        ]
        if "wasm-dry-run" in help_text:
            recorded_args.append("--no-wasm-dry-run")
        self.record_command("web", ["flutter", *recorded_args])
        print_artifact(output_dir / "index.html")

    def build_docker_images(self, *, update_manifest: bool = False) -> None:
        ensure_base_dirs()
        docker = ensure_tool("Docker", ["docker"])
        compose = resolve_docker_compose(docker)
        build_cmd = [*compose, "-f", str(COMPOSE_FILE), "build", *DOCKER_IMAGES.keys()]
        self.run_external(build_cmd, cwd=PROJECT_ROOT)
        docker_dir = DIST_DIR / "docker"
        docker_dir.mkdir(parents=True, exist_ok=True)
        generated: dict[str, str] = {}
        for service, image in DOCKER_IMAGES.items():
            tar_path = docker_dir / f"{service}.tar"
            self.run_external([docker, "save", "-o", str(tar_path), image], cwd=PROJECT_ROOT)
            print_artifact(tar_path)
            generated[service] = relative(tar_path)
        state = self.load_state()
        state["docker_images"] = generated
        self.save_state(state)
        self.record_command("docker-images", build_cmd)
        if update_manifest:
            self.write_manifest()

    def write_manifest(self) -> None:
        ensure_base_dirs()
        self.record_command("manifest", [])
        state = self.load_state()
        manifest = {
            "build_time": datetime.now(timezone.utc).isoformat(),
            "git_commit": git_commit(),
            "platform": platform.platform(),
            "python_version": sys.version,
            "cargo_target_dir": relative(self.cargo_target_dir),
            "api_server_artifact": existing_relative(backend_artifact("api-server")),
            "im_server_artifact": existing_relative(backend_artifact("im-server")),
            "flutter_web_artifact": existing_relative(DIST_DIR / "frontend" / "web"),
            "flutter_web_wasm_bridge": {
                "js": existing_relative(
                    DIST_DIR / "frontend" / "web" / "pkg" / "im_rust_bridge.js"
                ),
                "wasm": existing_relative(
                    DIST_DIR
                    / "frontend"
                    / "web"
                    / "pkg"
                    / "im_rust_bridge_bg.wasm"
                ),
            },
            "rust_bridge_artifact": existing_relative(DIST_DIR / "rust_bridge" / bridge_library_name()),
            "docker_images": state.get("docker_images", {}),
            "commands": state.get("commands", []),
        }
        manifest_path = BUILD_DIR / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print_artifact(manifest_path)

    def run_external(
        self,
        command: Sequence[str],
        *,
        cwd: Path,
        env: dict[str, str] | None = None,
        capture_output: bool = False,
    ) -> subprocess.CompletedProcess[str]:
        printable = format_command(command)
        print(f"$ {printable} (cwd: {relative(cwd)})")
        merged_env = None
        if env:
            import os

            merged_env = os.environ.copy()
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

    def record_command(self, name: str, command: Sequence[str]) -> None:
        state = self.load_state()
        commands = state.setdefault("commands", [])
        commands.append(
            {
                "name": name,
                "command": [str(part) for part in command],
                "profile": self.profile,
                "time": datetime.now(timezone.utc).isoformat(),
            }
        )
        self.save_state(state)

    def load_state(self) -> dict[str, Any]:
        if not STATE_FILE.is_file():
            return {}
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))

    def save_state(self, state: dict[str, Any]) -> None:
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def ensure_base_dirs() -> None:
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)


def ensure_tool(name: str, candidates: Iterable[str]) -> str:
    if name.lower() == "python" and Path(sys.executable).is_file():
        return sys.executable
    for candidate in candidates:
        found = shutil.which(candidate)
        if found:
            return found
    raise BuildError(f"{name} executable was not found on PATH.")


def resolve_docker_compose(docker: str) -> list[str]:
    try:
        print(f"$ {docker} compose version")
        subprocess.run([docker, "compose", "version"], check=True, text=True, encoding="utf-8", errors="replace")
        return [docker, "compose"]
    except subprocess.CalledProcessError:
        docker_compose = shutil.which("docker-compose")
        if docker_compose:
            print(f"$ {docker_compose} version")
            subprocess.run([docker_compose, "version"], check=True, text=True, encoding="utf-8", errors="replace")
            return [docker_compose]
    raise BuildError("Docker Compose was not found. Install the Docker Compose plugin or docker-compose.")


def copy_artifact(source: Path, dest: Path) -> None:
    if not source.is_file():
        raise BuildError(f"Expected artifact does not exist: {relative(source)}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, dest)
    print_artifact(dest)


def assert_web_wasm_bridge_assets(pkg_dir: Path) -> None:
    required = [
        pkg_dir / "im_rust_bridge.js",
        pkg_dir / "im_rust_bridge_bg.wasm",
    ]
    missing = [path for path in required if not path.is_file()]
    if missing:
        missing_text = ", ".join(relative(path) for path in missing)
        raise BuildError(
            "Missing Flutter web Rust bridge assets: "
            f"{missing_text}. Install wasm-pack and rebuild the web bridge."
        )
    for path in required:
        print_artifact(path)


def print_artifact(path: Path) -> None:
    if path.is_dir():
        print(f"Artifact: {relative(path)}")
        return
    print(f"Artifact: {relative(path)} ({path.stat().st_size} bytes)")


def bridge_library_name() -> str:
    system = platform.system()
    if system == "Windows":
        return "im_rust_bridge.dll"
    if system == "Darwin":
        return "libim_rust_bridge.dylib"
    return "libim_rust_bridge.so"


def backend_artifact(name: str) -> Path:
    suffix = ".exe" if platform.system() == "Windows" else ""
    return DIST_DIR / "backend" / name / f"{name}{suffix}"


def existing_relative(path: Path) -> str | None:
    if path.exists():
        return relative(path)
    return None


def git_commit() -> str:
    try:
        completed = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(PROJECT_ROOT),
            check=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
        )
        return completed.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "unknown"


def relative(path: Path) -> str:
    try:
        return path.resolve().relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return str(path)


def format_command(command: Sequence[object]) -> str:
    return " ".join(str(part) for part in command)


if __name__ == "__main__":
    main()
