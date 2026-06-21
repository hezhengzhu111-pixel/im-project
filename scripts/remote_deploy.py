#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ipaddress
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import tarfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Sequence


PROJECT_ROOT = Path(__file__).resolve().parent.parent
REMOTE_BUNDLE_DIR = PROJECT_ROOT / "build" / "remote-deploy"
REMOTE_BUNDLE_FILE = REMOTE_BUNDLE_DIR / "deploy-files.tar.gz"
REMOTE_COMPOSE_FILE = REMOTE_BUNDLE_DIR / "docker-compose.remote.yml"
MANIFEST_FILE = PROJECT_ROOT / "build" / "manifest.json"
DEFAULT_ENV_FILE = PROJECT_ROOT / "build" / "runtime" / "env" / "local.env"
COMPOSE_TEMPLATE_FILE = PROJECT_ROOT / "scripts" / "templates" / "docker-compose.runtime.yml"
NGINX_TEMPLATE_DIR = PROJECT_ROOT / "scripts" / "templates" / "nginx-ssl"
NGINX_RUNTIME_DIR = PROJECT_ROOT / "build" / "runtime" / "nginx"
NGINX_CONF_DIR = NGINX_RUNTIME_DIR / "conf"
NGINX_CONF_FILE = NGINX_CONF_DIR / "default.conf"
NGINX_SSL_DIR = NGINX_RUNTIME_DIR / "ssl"
NGINX_CERT_FILE = NGINX_SSL_DIR / "im-server.crt"
NGINX_KEY_FILE = NGINX_SSL_DIR / "im-server.key"
DEFAULT_REMOTE_HOST = "223.109.143.207"
DEFAULT_REMOTE_USER = "root"
DEFAULT_IDENTITY_FILE = PROJECT_ROOT / "ssh" / "im-server.pem"
DEFAULT_REMOTE_DIR = "/home/new-im-project"
DEFAULT_SSH_OPTIONS = [
    "BatchMode=yes",
    "StrictHostKeyChecking=accept-new",
    "ConnectTimeout=20",
    "ServerAliveInterval=15",
    "ServerAliveCountMax=4",
]

EXCLUDED_DIR_NAMES = {"__pycache__", ".pytest_cache"}
EXCLUDED_SUFFIXES = {".pyc", ".pyo"}
MIDDLEWARE_SERVICES = [
    "im-mysql",
    "im-db-migrate",
    "im-redis",
    "im-redis-group-hot",
    "im-redis-group-hot-2",
    "im-redis-group-hot-3",
    "im-redis-group-hot-4",
    "im-redis-private-hot",
    "im-redis-private-hot-2",
    "im-redis-private-hot-3",
    "im-redis-private-hot-4",
    "im-files-init",
]


def generate_self_signed_cert(hostname: str, cert_path: Path, key_path: Path) -> None:
    """Generate a self-signed certificate for the given hostname or IP."""
    try:
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509.oid import NameOID
    except ImportError as exc:
        raise SystemExit(
            "Missing Python package `cryptography`. "
            "Install it with: python -m pip install cryptography"
        ) from exc

    cert_path.parent.mkdir(parents=True, exist_ok=True)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "CN"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "IM Project"),
        x509.NameAttribute(NameOID.COMMON_NAME, hostname),
    ])
    san_entries = []
    try:
        addr = ipaddress.ip_address(hostname)
        san_entries.append(x509.IPAddress(addr))
    except ValueError:
        san_entries.append(x509.DNSName(hostname))

    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(timezone.utc))
        .not_valid_after(datetime.now(timezone.utc) + timedelta(days=365))
        .add_extension(x509.SubjectAlternativeName(san_entries), critical=False)
        .sign(key, hashes.SHA256())
    )
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    key_path.write_bytes(
        key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )


def prepare_nginx_files(host: str) -> None:
    """Copy nginx config template and ensure self-signed SSL certs exist."""
    if not (NGINX_TEMPLATE_DIR / "default.conf").is_file():
        raise SystemExit(f"Missing nginx template: {rel(NGINX_TEMPLATE_DIR / 'default.conf')}")
    NGINX_CONF_DIR.mkdir(parents=True, exist_ok=True)
    NGINX_CONF_FILE.write_text((NGINX_TEMPLATE_DIR / "default.conf").read_text(encoding="utf-8"), encoding="utf-8")
    if not NGINX_CERT_FILE.is_file() or not NGINX_KEY_FILE.is_file():
        print(f"[REMOTE] generating self-signed certificate for {host}")
        generate_self_signed_cert(host, NGINX_CERT_FILE, NGINX_KEY_FILE)
    else:
        print(f"[REMOTE] reusing existing certificate: {rel(NGINX_CERT_FILE)}")


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    validate_local_args(args)
    remote = remote_target(args)
    ssh_base = ssh_command(args)

    ensure_tool("ssh")
    ensure_tool("scp")
    if not args.skip_build and not args.dry_run:
        ensure_python_module("yaml", "Install it with: python -m pip install PyYAML")

    if args.env_file and not args.skip_env_upload:
        resolve_env_file(args.env_file, required=True)

    remote_precheck(args, ssh_base, dry_run=args.dry_run)

    if not args.skip_build:
        if not args.no_clean_source_pollution:
            clean_command = [
                sys.executable,
                "scripts/imctl.py",
                "--profile",
                args.profile,
                "clean",
                "source-pollution",
            ]
            run_local(clean_command, dry_run=args.dry_run)

        build_command = [
            sys.executable,
            "scripts/imctl.py",
            "--profile",
            args.profile,
        ]
        if args.env_file:
            build_command.extend(["--env-file", args.env_file])
        build_command.extend([
            "build",
            "--docker-only",
            "--package-images",
            *(["--clean"] if args.clean else []),
        ])
        run_local(build_command, dry_run=args.dry_run)

    env_file = None if args.skip_env_upload else resolve_env_file(
        args.env_file,
        required=not args.dry_run,
        allow_placeholder=args.dry_run,
    )
    image_tars = image_tar_paths(allow_missing=args.dry_run)
    create_deploy_bundle(args, env_file=None if args.skip_env_upload else env_file)

    remote_env_file = f"{args.remote_dir.rstrip('/')}/build/runtime/env/remote.env"
    remote_compose_file = f"{args.remote_dir.rstrip('/')}/build/runtime/compose/docker-compose.remote.yml"
    remote_bundle = f"/tmp/im-remote-deploy-{os.getpid()}.tar.gz"

    remote_mkdir(args, ssh_base, remote_bundle=remote_bundle, dry_run=args.dry_run)

    scp_to_remote(args, REMOTE_BUNDLE_FILE, f"{remote}:{remote_bundle}", dry_run=args.dry_run)
    if image_tars:
        for image_tar in image_tars:
            scp_to_remote(
                args,
                image_tar,
                f"{remote}:{args.remote_dir.rstrip('/')}/build/dist/images/",
                dry_run=args.dry_run,
            )
    elif args.dry_run:
        print("$ scp <build/dist/images/*.tar> " + f"{remote}:{args.remote_dir.rstrip('/')}/build/dist/images/")

    remote_extract_and_deploy(
        args,
        ssh_base,
        remote_bundle=remote_bundle,
        remote_env_file=remote_env_file,
        remote_compose_file=remote_compose_file,
        dry_run=args.dry_run,
    )


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build locally, upload Docker image tar files, and deploy on a remote Linux server.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--host", default=DEFAULT_REMOTE_HOST, help="Remote server hostname or IP.")
    parser.add_argument("--user", default=DEFAULT_REMOTE_USER, help="SSH username.")
    parser.add_argument("--port", type=int, default=22, help="SSH port. Defaults to 22.")
    parser.add_argument(
        "--identity-file",
        default=str(DEFAULT_IDENTITY_FILE),
        help="SSH private key path.",
    )
    parser.add_argument("--ssh-option", action="append", default=[], help="Extra ssh/scp -o option. Repeatable.")
    parser.add_argument("--remote-dir", default=DEFAULT_REMOTE_DIR, help="Remote project directory.")
    parser.add_argument(
        "--project-name",
        help="Docker Compose project name on the remote server. Defaults to the selected profile.",
    )
    parser.add_argument("--profile", default="sit", choices=["local", "sit", "prod"], help="Deployment profile.")
    parser.add_argument(
        "--services",
        nargs="+",
        help="Compose services to start remotely. Defaults to the selected profile's application services.",
    )
    deploy_mode = parser.add_mutually_exclusive_group()
    deploy_mode.add_argument("--all", action="store_true", help="Recreate middleware and application services.")
    deploy_mode.add_argument("--server", action="store_true", help="Deploy application services only; do not touch middleware.")
    parser.add_argument("--env-file", help=f"Runtime env file to upload. Defaults to {rel(DEFAULT_ENV_FILE)}.")
    parser.add_argument("--skip-env-upload", action="store_true", help="Do not upload an env file.")
    parser.add_argument("--skip-build", action="store_true", help="Reuse existing build/dist/images tar files.")
    parser.add_argument(
        "--no-clean-source-pollution",
        action="store_true",
        help="Do not run `imctl.py clean source-pollution` before the local build.",
    )
    parser.add_argument("--clean", action="store_true", help="Pass --clean to the local build step.")
    parser.add_argument("--dry-run", action="store_true", help="Print commands without executing them.")
    return parser.parse_args(argv)


def validate_local_args(args: argparse.Namespace) -> None:
    if args.identity_file:
        identity_file = Path(args.identity_file)
        if not identity_file.is_absolute():
            identity_file = PROJECT_ROOT / identity_file
        if not identity_file.is_file():
            raise SystemExit(f"SSH identity file does not exist: {rel(identity_file)}")
        args.identity_file = str(identity_file)
    args.remote_dir = args.remote_dir.rstrip("/") or "/"
    if not args.project_name:
        args.project_name = args.profile


def remote_target(args: argparse.Namespace) -> str:
    return f"{args.user}@{args.host}"


def ssh_command(args: argparse.Namespace) -> list[str]:
    command = ["ssh", "-p", str(args.port)]
    if args.identity_file:
        command.extend(["-i", args.identity_file])
    for option in DEFAULT_SSH_OPTIONS:
        command.extend(["-o", option])
    for option in args.ssh_option:
        command.extend(["-o", option])
    command.append(remote_target(args))
    return command


def scp_command(args: argparse.Namespace) -> list[str]:
    command = ["scp", "-P", str(args.port)]
    if args.identity_file:
        command.extend(["-i", args.identity_file])
    for option in DEFAULT_SSH_OPTIONS:
        command.extend(["-o", option])
    for option in args.ssh_option:
        command.extend(["-o", option])
    return command


def ensure_tool(name: str) -> None:
    if not shutil.which(name):
        raise SystemExit(f"Missing required command: {name}")


def ensure_python_module(module: str, hint: str) -> None:
    result = subprocess.run(
        [sys.executable, "-c", f"import {module}"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0:
        raise SystemExit(f"Current Python cannot import `{module}`. {hint}")


def resolve_env_file(
    env_file: str | None,
    *,
    required: bool,
    allow_placeholder: bool = False,
) -> Path | None:
    if env_file:
        path = Path(env_file)
        if not path.is_absolute():
            path = PROJECT_ROOT / path
    else:
        path = DEFAULT_ENV_FILE
    if path.is_file():
        return path
    if allow_placeholder:
        print(f"[REMOTE] dry-run: env file is not present yet: {rel(path)}")
        return None
    if required:
        raise SystemExit(
            f"Env file does not exist: {rel(path)}. "
            "Run `python scripts/imctl.py up --dry-run` once or pass --env-file."
        )
    return None


def image_tar_paths(*, allow_missing: bool = False) -> list[Path]:
    if not MANIFEST_FILE.is_file():
        if allow_missing:
            print(f"[REMOTE] dry-run: {rel(MANIFEST_FILE)} is not present yet; image upload is shown as a placeholder.")
            return []
        raise SystemExit(
            f"Missing {rel(MANIFEST_FILE)}. Run local build first or remove --skip-build."
        )
    manifest = json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
    tar_paths = manifest.get("docker_image_tar_paths")
    if not isinstance(tar_paths, dict) or not tar_paths:
        if allow_missing:
            print(f"[REMOTE] dry-run: {rel(MANIFEST_FILE)} has no docker image tar paths yet.")
            return []
        raise SystemExit(
            f"{rel(MANIFEST_FILE)} does not contain docker_image_tar_paths. "
            "Run `python scripts/imctl.py --profile sit build --package-images`."
        )
    paths = []
    for service, tar_rel in sorted(tar_paths.items()):
        tar_path = PROJECT_ROOT / str(tar_rel).replace("\\", "/")
        if not tar_path.is_file():
            if allow_missing:
                print(f"[REMOTE] dry-run: missing image tar for {service}: {rel(tar_path)}")
                continue
            raise SystemExit(f"Missing image tar for {service}: {rel(tar_path)}")
        paths.append(tar_path)
    return paths


def create_deploy_bundle(args: argparse.Namespace, env_file: Path | None) -> None:
    generate_remote_compose(args)
    prepare_nginx_files(args.host)
    REMOTE_BUNDLE_DIR.mkdir(parents=True, exist_ok=True)
    with tarfile.open(REMOTE_BUNDLE_FILE, "w:gz") as archive:
        add_path(archive, REMOTE_COMPOSE_FILE, "build/runtime/compose/docker-compose.remote.yml")
        add_path(archive, PROJECT_ROOT / "sql", "sql")
        add_path(archive, NGINX_CONF_DIR, "build/runtime/nginx/conf")
        add_path(archive, NGINX_SSL_DIR, "build/runtime/nginx/ssl")
        if env_file is not None:
            add_path(archive, env_file, "build/runtime/env/remote.env")
    print(f"[REMOTE] bundle: {rel(REMOTE_BUNDLE_FILE)}")


def generate_remote_compose(args: argparse.Namespace) -> None:
    if not COMPOSE_TEMPLATE_FILE.is_file():
        raise SystemExit(f"Missing compose template: {rel(COMPOSE_TEMPLATE_FILE)}")

    remote_dir = args.remote_dir.rstrip("/")
    template_text = COMPOSE_TEMPLATE_FILE.read_text(encoding="utf-8")
    services = discover_compose_services(template_text)
    if not services:
        raise SystemExit("Compose template does not define services.")
    selected = selected_services(args)
    missing_services = [service for service in selected if service not in services]
    if missing_services:
        available = ", ".join(sorted(services))
        raise SystemExit(
            "Unknown remote compose service(s): "
            + ", ".join(missing_services)
            + f". Available services: {available}"
        )

    remote_text = rewrite_remote_compose_text(template_text, remote_dir)

    REMOTE_COMPOSE_FILE.parent.mkdir(parents=True, exist_ok=True)
    REMOTE_COMPOSE_FILE.write_text(
        "# Generated by scripts/remote_deploy.py. Do not edit on the server.\n"
        + remote_text,
        encoding="utf-8",
    )
    print(f"[REMOTE] compose: {rel(REMOTE_COMPOSE_FILE)}")


def discover_compose_services(compose_text: str) -> set[str]:
    services: set[str] = set()
    in_services = False
    for line in compose_text.splitlines():
        if line.startswith("services:"):
            in_services = True
            continue
        if in_services and line and not line.startswith(" "):
            break
        if in_services:
            match = re.match(r"^  ([A-Za-z0-9_-]+):\s*$", line)
            if match:
                services.add(match.group(1))
    return services


def rewrite_remote_compose_text(compose_text: str, remote_dir: str) -> str:
    lines = remove_build_blocks(compose_text.splitlines())
    return "\n".join(rewrite_remote_volume_line(line, remote_dir) for line in lines) + "\n"


def remove_build_blocks(lines: Sequence[str]) -> list[str]:
    output: list[str] = []
    skip_indent: int | None = None
    for line in lines:
        if skip_indent is not None:
            if not line.strip():
                continue
            indent = len(line) - len(line.lstrip(" "))
            if indent > skip_indent:
                continue
            skip_indent = None
        match = re.match(r"^(\s*)build:\s*$", line)
        if match:
            skip_indent = len(match.group(1))
            continue
        output.append(line)
    return output


def rewrite_remote_volume_line(line: str, remote_dir: str) -> str:
    match = re.match(r"^(\s*)-\s+(.+)$", line)
    if not match:
        return line
    indent, volume = match.groups()
    source, target, options = split_short_volume(volume)
    sources = remote_volume_sources(remote_dir)
    if source not in sources or not target:
        return line
    replacement = [
        f"{indent}- type: bind",
        f"{indent}  source: {sources[source]}",
        f"{indent}  target: {target}",
    ]
    if "ro" in options:
        replacement.append(f"{indent}  read_only: true")
    return "\n".join(replacement)


def split_short_volume(volume: str) -> tuple[str, str, list[str]]:
    parts = volume.split(":")
    if len(parts) < 2:
        return volume, "", []
    return parts[0], parts[1], parts[2:]


def remote_volume_sources(remote_dir: str) -> dict[str, str]:
    runtime = f"{remote_dir}/build/runtime"
    return {
        "mysql_data": f"{runtime}/mysql",
        "redis_data": f"{runtime}/redis/main",
        "redis_private_hot_data": f"{runtime}/redis/private-hot-1",
        "redis_private_hot_data_2": f"{runtime}/redis/private-hot-2",
        "redis_private_hot_data_3": f"{runtime}/redis/private-hot-3",
        "redis_private_hot_data_4": f"{runtime}/redis/private-hot-4",
        "redis_group_hot_data": f"{runtime}/redis/group-hot-1",
        "redis_group_hot_data_2": f"{runtime}/redis/group-hot-2",
        "redis_group_hot_data_3": f"{runtime}/redis/group-hot-3",
        "redis_group_hot_data_4": f"{runtime}/redis/group-hot-4",
        "im_files": f"{runtime}/files",
        "sql_init_file": f"{remote_dir}/sql/mysql8/init_all.sql",
        "sql_migration_file": f"{remote_dir}/sql/mysql8/migrations/0001_e2ee_migration.sql",
        "nginx_conf": f"{runtime}/nginx/conf",
        "nginx_ssl": f"{runtime}/nginx/ssl",
    }


def add_path(archive: tarfile.TarFile, source: Path, arcname: str) -> None:
    if source.is_dir():
        for child in source.rglob("*"):
            if should_exclude(child):
                continue
            if child.is_file():
                archive.add(child, arcname=(Path(arcname) / child.relative_to(source)).as_posix())
        return
    if source.is_file() and not should_exclude(source):
        archive.add(source, arcname=Path(arcname).as_posix())


def should_exclude(path: Path) -> bool:
    return any(part in EXCLUDED_DIR_NAMES for part in path.parts) or path.suffix in EXCLUDED_SUFFIXES


def remote_precheck(args: argparse.Namespace, ssh_base: Sequence[str], *, dry_run: bool) -> None:
    script = " && ".join([
        "command -v tar",
        "command -v docker",
        "docker info >/dev/null",
        "docker compose version >/dev/null",
    ])
    run_local([*ssh_base, script], dry_run=dry_run)


def remote_mkdir(
    args: argparse.Namespace,
    ssh_base: Sequence[str],
    *,
    remote_bundle: str,
    dry_run: bool,
) -> None:
    dirs = [
        args.remote_dir,
        f"{args.remote_dir.rstrip('/')}/build/dist/images",
        f"{args.remote_dir.rstrip('/')}/build/runtime/env",
        f"{args.remote_dir.rstrip('/')}/build/runtime/compose",
        f"{args.remote_dir.rstrip('/')}/build/runtime/nginx",
        f"{args.remote_dir.rstrip('/')}/build/runtime/nginx/conf",
        f"{args.remote_dir.rstrip('/')}/build/runtime/mysql",
        f"{args.remote_dir.rstrip('/')}/build/runtime/redis/main",
        f"{args.remote_dir.rstrip('/')}/build/runtime/redis/private-hot-1",
        f"{args.remote_dir.rstrip('/')}/build/runtime/redis/private-hot-2",
        f"{args.remote_dir.rstrip('/')}/build/runtime/redis/private-hot-3",
        f"{args.remote_dir.rstrip('/')}/build/runtime/redis/private-hot-4",
        f"{args.remote_dir.rstrip('/')}/build/runtime/redis/group-hot-1",
        f"{args.remote_dir.rstrip('/')}/build/runtime/redis/group-hot-2",
        f"{args.remote_dir.rstrip('/')}/build/runtime/redis/group-hot-3",
        f"{args.remote_dir.rstrip('/')}/build/runtime/redis/group-hot-4",
        f"{args.remote_dir.rstrip('/')}/build/runtime/files",
        remote_bundle.rsplit("/", 1)[0],
    ]
    script = "mkdir -p " + " ".join(shlex.quote(path) for path in dirs)
    run_local([*ssh_base, script], dry_run=dry_run)


def scp_to_remote(args: argparse.Namespace, source: Path, destination: str, *, dry_run: bool) -> None:
    run_local([*scp_command(args), str(source), destination], dry_run=dry_run)


def remote_extract_and_deploy(
    args: argparse.Namespace,
    ssh_base: Sequence[str],
    *,
    remote_bundle: str,
    remote_env_file: str,
    remote_compose_file: str,
    dry_run: bool,
) -> None:
    remote_dir = args.remote_dir.rstrip("/")
    compose_cmd = remote_compose_command(args, remote_env_file, remote_compose_file)
    services = " ".join(shlex.quote(service) for service in selected_services(args))
    compose_options = []
    if args.all:
        compose_options.append("--force-recreate")
    if args.server:
        compose_options.append("--no-deps")
    compose_option_text = (" " + " ".join(compose_options)) if compose_options else ""
    commands = [
        f"tar -xzf {shlex.quote(remote_bundle)} -C {shlex.quote(remote_dir)}",
        f"rm -f {shlex.quote(remote_bundle)}",
        f"cd {shlex.quote(remote_dir)}",
        "for image in build/dist/images/*.tar; do docker load -i \"$image\"; done",
        f"{compose_cmd} up -d{compose_option_text} {services}",
        (
            'docker ps --format '
            + shlex.quote("table {{.Names}}\t{{.Status}}\t{{.Ports}}")
        ),
    ]
    run_local([*ssh_base, " && ".join(commands)], dry_run=dry_run)


def remote_compose_command(args: argparse.Namespace, remote_env_file: str, remote_compose_file: str) -> str:
    return " ".join([
        "docker",
        "compose",
        "--project-name",
        shlex.quote(args.project_name),
        "--env-file",
        shlex.quote(remote_env_file),
        "-f",
        shlex.quote(remote_compose_file),
    ])


def selected_services(args: argparse.Namespace) -> list[str]:
    app_services = args.services if args.services else profile_services(args.profile)
    if args.all:
        services = [*MIDDLEWARE_SERVICES, *app_services]
        return list(dict.fromkeys(services))
    return app_services


def profile_services(profile: str) -> list[str]:
    return ["im-server", "im-api-server", "im-frontend", "im-nginx"]


def run_local(command: Sequence[object], *, dry_run: bool) -> None:
    printable = " ".join(str(part) for part in command)
    print(f"$ {printable}")
    if dry_run:
        return
    result = subprocess.run([str(part) for part in command], cwd=PROJECT_ROOT, check=False)
    if result.returncode != 0:
        raise SystemExit(f"Command failed with exit code {result.returncode}: {printable}")


def rel(path: Path) -> str:
    try:
        return path.resolve().relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


if __name__ == "__main__":
    main()
