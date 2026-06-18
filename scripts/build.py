#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BUILD_DIR = PROJECT_ROOT / "build"
CACHE_DIR = BUILD_DIR / "cache"
WORK_DIR = BUILD_DIR / "work"
DIST_DIR = BUILD_DIR / "dist"
LOGS_DIR = BUILD_DIR / "logs"
RUNTIME_DIR = BUILD_DIR / "runtime"
REPORTS_DIR = BUILD_DIR / "reports"
MANIFEST_FILE = BUILD_DIR / "manifest.json"
STATE_FILE = LOGS_DIR / "build-state.json"
BUILD_LOG_FILE = LOGS_DIR / "build.log"

SOURCE_FLUTTER_ROOT = PROJECT_ROOT / "flutter"
SOURCE_RUST_ROOT = PROJECT_ROOT / "rust"
SOURCE_SPRING_AI_ROOT = PROJECT_ROOT / "spring-ai"
SOURCE_SQL_ROOT = PROJECT_ROOT / "sql"

WORK_FLUTTER_ROOT = WORK_DIR / "flutter"
WORK_RUST_ROOT = WORK_DIR / "rust"
WORK_SPRING_AI_ROOT = WORK_DIR / "spring-ai"
WORK_SQL_ROOT = WORK_DIR / "sql"

WORK_WEB_ROOT = WORK_FLUTTER_ROOT / "apps" / "web"
WORK_WASM_BRIDGE_ROOT = WORK_RUST_ROOT / "crates" / "im-flutter-bridge"
WORK_WEB_WASM_PKG_DIR = WORK_WEB_ROOT / "web" / "pkg"

DIST_FRONTEND_DIR = DIST_DIR / "frontend"
DIST_RUST_DIR = DIST_DIR / "rust"
DIST_SPRING_AI_DIR = DIST_DIR / "spring-ai"
DIST_IMAGES_DIR = DIST_DIR / "images"

CARGO_HOME_DIR = CACHE_DIR / "cargo-home"
CARGO_TARGET_DIR = CACHE_DIR / "rust-target"
PUB_CACHE_DIR = CACHE_DIR / "pub-cache"
MAVEN_REPO_DIR = CACHE_DIR / "maven-repo"
DOCKER_CACHE_DIR = CACHE_DIR / "docker"
TOOLS_CACHE_DIR = CACHE_DIR / "tools"

DOCKER_IMAGES = {
    "im-api-server": "im-project-sit/im-api-server:latest",
    "im-server": "im-project-sit/im-server:latest",
    "im-frontend": "im-project-sit/im-frontend:latest",
    "im-spring-ai": "im-project-sit/im-spring-ai:latest",
}

SYNC_EXCLUDED_NAMES = {
    ".git",
    "build",
    "target",
    ".dart_tool",
    ".flutter-plugins",
    ".flutter-plugins-dependencies",
    "pubspec.lock",
    "__pycache__",
    ".venv",
    "venv",
    "node_modules",
    "coverage",
    "logs",
    ".pytest_cache",
    ".cache",
}
SYNC_EXCLUDED_PATTERNS = (
    "*.pyc",
    "*.pyo",
    "*.pyd",
    "*.tmp",
    "*.temp",
    "*.swp",
    "*.swo",
    "*~",
    ".DS_Store",
    "Thumbs.db",
    "*.log",
    "*.dill",
    "*.dill.track.dill",
    "*.cache.dill*",
)


def main() -> None:
    args = parse_args()
    try:
        builder = Builder(args.profile)
        command = args.command or "all"
        if command == "all":
            builder.all(
                no_clean=args.no_clean,
                skip_rust=args.skip_rust,
                skip_bridge=args.skip_bridge,
                skip_web=args.skip_web,
                skip_spring_ai=args.skip_spring_ai,
                include_docker=args.docker,
            )
        elif command == "clean":
            builder.clean(include_cache=args.cache)
        elif command == "clean-work":
            builder.clean_work()
        elif command == "clean-dist":
            builder.clean_dist()
        elif command == "clean-cache":
            builder.clean_cache()
        elif command == "rust":
            builder.build_rust()
            builder.write_manifest()
        elif command == "bridge":
            builder.build_bridge()
            builder.write_manifest()
        elif command in {"web", "flutter"}:
            builder.build_web()
            builder.write_manifest()
        elif command == "spring-ai":
            builder.build_spring_ai()
            builder.write_manifest()
        elif command == "docker-images":
            builder.build_docker_images()
            builder.write_manifest()
        elif command == "manifest":
            builder.write_manifest()
        else:
            raise BuildError(f"Unknown command: {command}")
    except BuildError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
    except subprocess.CalledProcessError as exc:
        print(
            f"ERROR: command failed with exit code {exc.returncode}: {format_command(exc.cmd)}",
            file=sys.stderr,
        )
        sys.exit(exc.returncode or 1)
    except FileNotFoundError as exc:
        print(f"ERROR: executable was not found: {exc.filename}", file=sys.stderr)
        sys.exit(1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build IM project artifacts with isolated build/work workspaces."
    )
    parser.add_argument(
        "command",
        nargs="?",
        choices=[
            "all",
            "rust",
            "bridge",
            "web",
            "flutter",
            "spring-ai",
            "docker-images",
            "manifest",
            "clean",
            "clean-work",
            "clean-dist",
            "clean-cache",
        ],
        help="Build command to run. Defaults to all.",
    )
    parser.add_argument(
        "--no-clean",
        action="store_true",
        help="Do not clean build/work, build/dist, and build/logs before all.",
    )
    parser.add_argument(
        "--cache",
        action="store_true",
        help="With clean, also remove build/cache. Runtime is never removed.",
    )
    parser.add_argument(
        "--profile",
        choices=["release", "debug"],
        default="release",
        help="Cargo/Flutter build profile. Defaults to release.",
    )
    parser.add_argument("--skip-web", action="store_true", help="Skip the web build during all.")
    parser.add_argument("--skip-rust", action="store_true", help="Skip backend Rust builds during all.")
    parser.add_argument("--skip-bridge", action="store_true", help="Skip Rust bridge native build during all.")
    parser.add_argument("--skip-spring-ai", action="store_true", help="Skip Spring AI build during all.")
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
        return CARGO_TARGET_DIR / ("release" if self.profile == "release" else "debug")

    def all(
        self,
        *,
        no_clean: bool,
        skip_rust: bool,
        skip_bridge: bool,
        skip_web: bool,
        skip_spring_ai: bool,
        include_docker: bool,
    ) -> None:
        if no_clean:
            ensure_base_dirs()
        else:
            self.clean(include_cache=False)
        self.sync_sql()
        if not skip_rust:
            self.build_rust()
        if not skip_bridge:
            self.build_bridge()
        if not skip_web:
            self.build_web()
        if not skip_spring_ai:
            self.build_spring_ai()
        if include_docker:
            self.build_docker_images()
        self.write_manifest()

    def clean(self, *, include_cache: bool = False) -> None:
        remove_tree(WORK_DIR)
        remove_tree(DIST_DIR)
        remove_tree(LOGS_DIR)
        if include_cache:
            remove_tree(CACHE_DIR)
        ensure_base_dirs()
        self.record_command("clean", ["clean", "--cache"] if include_cache else ["clean"])
        print(f"Cleaned build work/dist/logs under {relative(BUILD_DIR)}")
        if include_cache:
            print(f"Cleaned cache: {relative(CACHE_DIR)}")

    def clean_work(self) -> None:
        remove_tree(WORK_DIR)
        ensure_work_dirs()
        self.record_command("clean-work", ["clean-work"])
        print(f"Cleaned work directory: {relative(WORK_DIR)}")

    def clean_dist(self) -> None:
        remove_tree(DIST_DIR)
        ensure_dist_dirs()
        self.record_command("clean-dist", ["clean-dist"])
        print(f"Cleaned dist directory: {relative(DIST_DIR)}")

    def clean_cache(self) -> None:
        remove_tree(CACHE_DIR)
        ensure_cache_dirs()
        self.record_command("clean-cache", ["clean-cache"])
        print(f"Cleaned cache directory: {relative(CACHE_DIR)}")

    def build_rust(self) -> None:
        guard = SourceGuard.capture()
        ensure_base_dirs()
        self.sync_rust()
        cargo = ensure_tool("cargo", ["cargo"])
        args = ["build", f"--{self.profile}", "-p", "api-server", "-p", "im-server"]
        self.run_external([cargo, *args], cwd=WORK_RUST_ROOT, env=rust_env())
        exe_suffix = ".exe" if platform.system() == "Windows" else ""
        for name in ("api-server", "im-server"):
            source = self.cargo_profile_dir / f"{name}{exe_suffix}"
            dest = DIST_RUST_DIR / name / source.name
            copy_artifact(source, dest)
        self.record_command("rust", ["cargo", *args])
        guard.assert_no_new_source_pollution()

    def build_bridge(self) -> None:
        guard = SourceGuard.capture()
        ensure_base_dirs()
        self.sync_rust()
        cargo = ensure_tool("cargo", ["cargo"])
        args = ["build", f"--{self.profile}", "-p", "im-flutter-bridge"]
        self.run_external([cargo, *args], cwd=WORK_RUST_ROOT, env=rust_env())
        source = self.cargo_profile_dir / bridge_library_name()
        dest = DIST_RUST_DIR / "rust-bridge" / source.name
        copy_artifact(source, dest)
        self.record_command("bridge", ["cargo", *args])
        guard.assert_no_new_source_pollution()

    def build_web_wasm_bridge(self) -> None:
        ensure_base_dirs()
        self.sync_rust()
        self.sync_flutter()
        wasm_pack = ensure_tool("wasm-pack", ["wasm-pack"])
        python_cmd = ensure_tool("Python", ["python", "python3"])
        args = [
            "build",
            "--target",
            "no-modules",
            "--out-dir",
            str(WORK_WEB_WASM_PKG_DIR),
            "--no-default-features",
        ]
        self.run_external(
            [wasm_pack, *args],
            cwd=WORK_WASM_BRIDGE_ROOT,
            env={
                **rust_env(),
                "RUSTFLAGS": "-C target-feature=-atomics,-bulk-memory,-mutable-globals",
                "WASM_OPT": "0",
            },
        )
        self.run_external(
            [
                python_cmd,
                str(WORK_WASM_BRIDGE_ROOT / "patch_wasm_js.py"),
                str(WORK_WEB_WASM_PKG_DIR / "im_rust_bridge.js"),
            ],
            cwd=WORK_WASM_BRIDGE_ROOT,
        )
        assert_web_wasm_bridge_assets(WORK_WEB_WASM_PKG_DIR)
        self.record_command("web-wasm-bridge", ["wasm-pack", *args])

    def build_web(self) -> None:
        guard = SourceGuard.capture()
        ensure_base_dirs()
        self.build_web_wasm_bridge()
        flutter = ensure_tool("flutter", ["flutter"])
        output_dir = DIST_FRONTEND_DIR / "web"
        remove_tree(output_dir)
        help_text = self.run_external(
            [flutter, "build", "web", "-h"],
            cwd=WORK_WEB_ROOT,
            env=flutter_env(),
            capture_output=True,
        ).stdout
        output_arg = f"--output={output_dir}"
        if "--output" not in help_text:
            output_arg = f"--output-dir={output_dir}"
        args = ["build", "web", f"--{self.profile}", "--pwa-strategy=none", output_arg]
        if "wasm-dry-run" in help_text:
            args.append("--no-wasm-dry-run")
        self.run_external([flutter, "pub", "get"], cwd=WORK_WEB_ROOT, env=flutter_env())
        self.run_external([flutter, *args], cwd=WORK_WEB_ROOT, env=flutter_env())
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
        guard.assert_no_new_source_pollution()

    def build_spring_ai(self) -> None:
        guard = SourceGuard.capture()
        ensure_base_dirs()
        self.sync_spring_ai()
        args, cwd, env, recorded_args = spring_ai_maven_invocation()
        self.run_external(args, cwd=cwd, env=env)
        jars = sorted(
            path
            for path in (WORK_SPRING_AI_ROOT / "target").glob("*.jar")
            if path.is_file() and not path.name.endswith(("-sources.jar", "-javadoc.jar", ".original"))
        )
        if not jars:
            raise BuildError("Spring AI build did not produce a jar under build/work/spring-ai/target.")
        remove_tree(DIST_SPRING_AI_DIR)
        DIST_SPRING_AI_DIR.mkdir(parents=True, exist_ok=True)
        for jar in jars:
            copy_artifact(jar, DIST_SPRING_AI_DIR / jar.name)
        self.record_command("spring-ai", recorded_args)
        guard.assert_no_new_source_pollution()

    def build_docker_images(self) -> None:
        guard = SourceGuard.capture()
        ensure_base_dirs()
        self.sync_rust()
        self.sync_flutter()
        self.sync_spring_ai()
        self.sync_sql()
        docker = ensure_tool("Docker", ["docker"])
        build_nonce = git_commit()[:12] or "manual"
        build_specs = {
            "im-api-server": {
                "context": WORK_RUST_ROOT,
                "dockerfile": WORK_RUST_ROOT / "apps" / "api-server" / "Dockerfile",
            },
            "im-server": {
                "context": WORK_RUST_ROOT,
                "dockerfile": WORK_RUST_ROOT / "apps" / "im-server" / "Dockerfile",
            },
            "im-frontend": {
                "context": WORK_DIR,
                "dockerfile": WORK_FLUTTER_ROOT / "apps" / "web" / "Dockerfile",
            },
            "im-spring-ai": {
                "context": WORK_SPRING_AI_ROOT,
                "dockerfile": WORK_SPRING_AI_ROOT / "Dockerfile",
            },
        }
        state = self.load_state()
        generated: dict[str, str] = dict(state.get("docker_images", {}))
        for service, image in DOCKER_IMAGES.items():
            spec = build_specs[service]
            build_cmd = [
                docker,
                "build",
                "-t",
                image,
                "-f",
                str(spec["dockerfile"]),
                "--build-arg",
                f"IM_BUILD_NONCE={build_nonce}",
                str(spec["context"]),
            ]
            self.run_external(build_cmd, cwd=PROJECT_ROOT, env=docker_env())
            tar_path = DIST_IMAGES_DIR / f"{service}.tar"
            self.run_external([docker, "save", "-o", str(tar_path), image], cwd=PROJECT_ROOT, env=docker_env())
            generated[service] = relative(tar_path)
            print_artifact(tar_path)
            self.record_command(f"docker-image:{service}", build_cmd)
            state = self.load_state()
            state["docker_images"] = generated
            self.save_state(state)
        guard.assert_no_new_source_pollution()

    def write_manifest(self) -> None:
        ensure_base_dirs()
        self.record_command("manifest", ["manifest"])
        state = self.load_state()
        manifest = {
            "git_commit": git_commit(),
            "build_time": datetime.now(timezone.utc).isoformat(),
            "platform": platform.platform(),
            "python_version": sys.version,
            "source_paths": {
                "flutter": relative(SOURCE_FLUTTER_ROOT),
                "rust": relative(SOURCE_RUST_ROOT),
                "spring_ai": relative(SOURCE_SPRING_AI_ROOT),
                "sql": relative(SOURCE_SQL_ROOT),
            },
            "work_paths": {
                "flutter": relative(WORK_FLUTTER_ROOT),
                "rust": relative(WORK_RUST_ROOT),
                "spring_ai": relative(WORK_SPRING_AI_ROOT),
                "sql": relative(WORK_SQL_ROOT),
            },
            "cache_paths": {
                "cargo_home": relative(CARGO_HOME_DIR),
                "rust_target": relative(CARGO_TARGET_DIR),
                "pub_cache": relative(PUB_CACHE_DIR),
                "maven_repo": relative(MAVEN_REPO_DIR),
                "docker": relative(DOCKER_CACHE_DIR),
                "tools": relative(TOOLS_CACHE_DIR),
            },
            "final_artifact_paths": {
                "api_server": existing_relative(rust_binary_artifact("api-server")),
                "im_server": existing_relative(rust_binary_artifact("im-server")),
                "rust_bridge": existing_relative(rust_bridge_artifact()),
                "flutter_web": existing_relative(DIST_FRONTEND_DIR / "web"),
                "flutter_web_wasm_bridge": {
                    "js": existing_relative(DIST_FRONTEND_DIR / "web" / "pkg" / "im_rust_bridge.js"),
                    "wasm": existing_relative(DIST_FRONTEND_DIR / "web" / "pkg" / "im_rust_bridge_bg.wasm"),
                },
                "spring_ai": [relative(path) for path in sorted(DIST_SPRING_AI_DIR.glob("*.jar"))],
                "docker_images": relative(DIST_IMAGES_DIR),
            },
            "docker_image_names": DOCKER_IMAGES,
            "docker_image_tar_paths": state.get("docker_images", {}),
            "commands": state.get("commands", []),
            "phases_executed": [item.get("name") for item in state.get("commands", []) if isinstance(item, dict)],
        }
        MANIFEST_FILE.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print_artifact(MANIFEST_FILE)

    def sync_rust(self) -> None:
        sync_source_tree(SOURCE_RUST_ROOT, WORK_RUST_ROOT)

    def sync_flutter(self) -> None:
        sync_source_tree(SOURCE_FLUTTER_ROOT, WORK_FLUTTER_ROOT)

    def sync_spring_ai(self) -> None:
        sync_source_tree(SOURCE_SPRING_AI_ROOT, WORK_SPRING_AI_ROOT)

    def sync_sql(self) -> None:
        sync_source_tree(SOURCE_SQL_ROOT, WORK_SQL_ROOT)

    def run_external(
        self,
        command: Sequence[object],
        *,
        cwd: Path,
        env: dict[str, str] | None = None,
        capture_output: bool = False,
    ) -> subprocess.CompletedProcess[str]:
        printable = format_command(command)
        print(f"$ {printable} (cwd: {relative(cwd)})")
        append_build_log(f"$ {printable} (cwd: {relative(cwd)})")
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

    def record_command(self, name: str, command: Sequence[object]) -> None:
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


class SourceGuard:
    def __init__(self, snapshot: dict[str, str | None]) -> None:
        self.snapshot = snapshot

    @classmethod
    def capture(cls) -> SourceGuard:
        return cls(source_pollution_snapshot())

    def assert_no_new_source_pollution(self) -> None:
        current = source_pollution_snapshot()
        introduced = [
            name
            for name, before in self.snapshot.items()
            if before is None and current.get(name) is not None
        ]
        modified = [
            name
            for name, before in self.snapshot.items()
            if before is not None and current.get(name) is not None and before != current.get(name)
        ]
        if introduced or modified:
            details = []
            if introduced:
                details.append("new: " + ", ".join(introduced))
            if modified:
                details.append("modified: " + ", ".join(modified))
            raise BuildError("Source directory pollution detected (" + "; ".join(details) + ").")
        existing = [name for name, before in self.snapshot.items() if before is not None]
        if existing:
            print("Warning: source pollution already existed before this command: " + ", ".join(existing))


def ensure_base_dirs() -> None:
    ensure_cache_dirs()
    ensure_work_dirs()
    ensure_dist_dirs()
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def ensure_cache_dirs() -> None:
    for path in (CARGO_HOME_DIR, CARGO_TARGET_DIR, PUB_CACHE_DIR, MAVEN_REPO_DIR, DOCKER_CACHE_DIR, TOOLS_CACHE_DIR):
        path.mkdir(parents=True, exist_ok=True)
    (DOCKER_CACHE_DIR / "config").mkdir(parents=True, exist_ok=True)


def ensure_work_dirs() -> None:
    for path in (WORK_FLUTTER_ROOT, WORK_RUST_ROOT, WORK_SPRING_AI_ROOT, WORK_SQL_ROOT):
        path.mkdir(parents=True, exist_ok=True)


def ensure_dist_dirs() -> None:
    for path in (DIST_FRONTEND_DIR, DIST_RUST_DIR, DIST_SPRING_AI_DIR, DIST_IMAGES_DIR):
        path.mkdir(parents=True, exist_ok=True)


def sync_source_tree(source: Path, dest: Path) -> None:
    if not source.is_dir():
        raise BuildError(f"Source directory does not exist: {relative(source)}")
    remove_tree(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, dest, ignore=copy_ignore)
    print(f"Synced {relative(source)} -> {relative(dest)}")


def copy_ignore(directory: str, names: list[str]) -> set[str]:
    ignored: set[str] = set()
    for name in names:
        if name in SYNC_EXCLUDED_NAMES:
            ignored.add(name)
            continue
        if any(fnmatch.fnmatch(name, pattern) for pattern in SYNC_EXCLUDED_PATTERNS):
            ignored.add(name)
    return ignored


def remove_tree(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)


def ensure_tool(name: str, candidates: Iterable[str]) -> str:
    if name.lower() == "python" and Path(sys.executable).is_file():
        return sys.executable
    for candidate in candidates:
        found = shutil.which(candidate)
        if found:
            return found
    raise BuildError(f"{name} executable was not found on PATH.")


def maven_command(work_root: Path) -> list[str]:
    if platform.system() == "Windows" and (work_root / "mvnw.cmd").is_file():
        return [str(work_root / "mvnw.cmd")]
    if (work_root / "mvnw").is_file():
        return [str(work_root / "mvnw")]
    return [ensure_tool("Maven", ["mvn"])]


def spring_ai_maven_invocation() -> tuple[list[object], Path, dict[str, str], list[str]]:
    minimum = 25
    major = java_major_version()
    if major is not None and major >= minimum:
        mvn = maven_command(WORK_SPRING_AI_ROOT)
        args = [*mvn, "package", "-DskipTests", "-B", "-q", f"-Dmaven.repo.local={MAVEN_REPO_DIR}"]
        return args, WORK_SPRING_AI_ROOT, maven_env(), redact_work_command(args)

    docker = shutil.which("docker")
    if docker:
        image = "docker.m.daocloud.io/library/eclipse-temurin:25-jdk-noble"
        shell_command = (
            "sed -i 's/\\r$//' mvnw "
            "&& chmod +x mvnw "
            "&& ./mvnw package -DskipTests -B -q -Dmaven.repo.local=/maven-repo"
        )
        args = [
            docker,
            "run",
            "--rm",
            "-v",
            f"{WORK_SPRING_AI_ROOT}:/workspace",
            "-v",
            f"{MAVEN_REPO_DIR}:/maven-repo",
            "-w",
            "/workspace",
            image,
            "sh",
            "-lc",
            shell_command,
        ]
        recorded = [
            "docker",
            "run",
            "--rm",
            "-v",
            f"{relative(WORK_SPRING_AI_ROOT)}:/workspace",
            "-v",
            f"{relative(MAVEN_REPO_DIR)}:/maven-repo",
            "-w",
            "/workspace",
            image,
            "sh",
            "-lc",
            shell_command,
        ]
        if major is None:
            print("Warning: local Java version is unknown; using Docker JDK 25 for Spring AI.")
        else:
            print(f"Warning: local Java major version is {major}; using Docker JDK 25 for Spring AI.")
        return args, PROJECT_ROOT, docker_env(), recorded

    raise BuildError(
        f"Spring AI requires JDK {minimum}+ because spring-ai/pom.xml sets java.version={minimum}; "
        f"current java major version is {major or 'unknown'}, and Docker is not available for the JDK 25 fallback."
    )


def java_major_version() -> int | None:
    java = shutil.which("java")
    if not java:
        return None
    completed = subprocess.run(
        [java, "-version"],
        check=False,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
    )
    version_text = completed.stderr or completed.stdout
    return parse_java_major(version_text)


def parse_java_major(version_text: str) -> int | None:
    for token in version_text.replace('"', " ").split():
        if token.count(".") >= 1 and token[0].isdigit():
            first = token.split(".", 1)[0]
            if first == "1":
                parts = token.split(".")
                if len(parts) > 1 and parts[1].isdigit():
                    return int(parts[1])
            if first.isdigit():
                return int(first)
    return None


def rust_env() -> dict[str, str]:
    return {
        "CARGO_HOME": str(CARGO_HOME_DIR),
        "CARGO_TARGET_DIR": str(CARGO_TARGET_DIR),
    }


def flutter_env() -> dict[str, str]:
    return {
        "PUB_CACHE": str(PUB_CACHE_DIR),
    }


def maven_env() -> dict[str, str]:
    return {
        "MAVEN_OPTS": f"{os.environ.get('MAVEN_OPTS', '')} -Dmaven.repo.local={MAVEN_REPO_DIR}".strip(),
    }


def docker_env() -> dict[str, str]:
    return {
        "DOCKER_CONFIG": str(DOCKER_CACHE_DIR / "config"),
    }


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


def rust_binary_artifact(name: str) -> Path:
    suffix = ".exe" if platform.system() == "Windows" else ""
    return DIST_RUST_DIR / name / f"{name}{suffix}"


def rust_bridge_artifact() -> Path:
    return DIST_RUST_DIR / "rust-bridge" / bridge_library_name()


def existing_relative(path: Path) -> str | None:
    if path.exists():
        return relative(path)
    return None


def source_pollution_snapshot() -> dict[str, str | None]:
    return {
        "rust/target": path_signature(SOURCE_RUST_ROOT / "target"),
        "spring-ai/target": path_signature(SOURCE_SPRING_AI_ROOT / "target"),
        "flutter/.dart_tool": path_signature(SOURCE_FLUTTER_ROOT / ".dart_tool"),
        "flutter/apps/web/build": path_signature(SOURCE_FLUTTER_ROOT / "apps" / "web" / "build"),
        "flutter/apps/web/web/pkg": path_signature(SOURCE_FLUTTER_ROOT / "apps" / "web" / "web" / "pkg"),
    }


def path_signature(path: Path) -> str | None:
    if not path.exists():
        return None
    digest = hashlib.sha256()
    if path.is_file():
        digest.update(path.name.encode("utf-8", errors="replace"))
        digest.update(str(path.stat().st_mtime_ns).encode("ascii"))
        digest.update(str(path.stat().st_size).encode("ascii"))
        return digest.hexdigest()
    for item in sorted(path.rglob("*")):
        try:
            stat = item.stat()
        except OSError:
            continue
        rel = item.relative_to(path).as_posix()
        digest.update(rel.encode("utf-8", errors="replace"))
        digest.update(b"D" if item.is_dir() else b"F")
        digest.update(str(stat.st_mtime_ns).encode("ascii"))
        digest.update(str(stat.st_size).encode("ascii"))
    return digest.hexdigest()


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


def append_build_log(line: str) -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    with BUILD_LOG_FILE.open("a", encoding="utf-8") as handle:
        handle.write(f"{datetime.now(timezone.utc).isoformat()} {line}\n")


def redact_work_command(command: Sequence[object]) -> list[str]:
    return [str(part) for part in command]


def relative(path: Path) -> str:
    try:
        return path.resolve().relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return str(path)


def format_command(command: Sequence[object]) -> str:
    return " ".join(str(part) for part in command)


if __name__ == "__main__":
    main()
