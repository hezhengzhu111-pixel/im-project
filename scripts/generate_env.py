#!/usr/bin/env python3
"""Generate runtime and frontend environment files for dev/SIT/production."""
from __future__ import annotations

import argparse
import base64
import os
import re
import secrets
import shutil
import string
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from runtime_paths import DEFAULT_RUNTIME_ENV_FILE, relative

PROFILE_ALIASES = {
    "dev": "dev",
    "development": "dev",
    "sit": "sit",
    "test": "sit",
    "prd": "prd",
    "prod": "prd",
    "production": "prd",
}

PROFILE_VALUES: dict[str, dict[str, str]] = {
    "dev": {
        "GLOBAL_DOCKER_NETWORK": "im-dev-network",
        "MYSQL_PORT": "3306",
        "REDIS_PORT": "6379",
        "GATEWAY_PORT": "8082",
        "IM_SERVER_PORT": "8083",
        "SPRING_AI_PORT": "8084",
        "FRONTEND_PORT": "3000",
        "IM_PRIVATE_HOT_SHARDS": "1",
        "IM_GROUP_HOT_SHARDS": "1",
        "IM_BUILD_NONCE": "dev",
        "FRONTEND_BUILD_MODE": "dev",
        "API_SERVER_RUST_LOG": "api_server_rs=debug,im_observe=debug,tower_http=info,sqlx::query=warn",
        "VITE_APP_ENV": "dev",
        "VITE_GATEWAY_HOST": "127.0.0.1",
        "VITE_GATEWAY_PORT": "8082",
        "VITE_DEBUG_MODE": "true",
        "VITE_LOG_LEVEL": "debug",
        "VITE_ENABLE_MOCK": "false",
    },
    "sit": {
        "GLOBAL_DOCKER_NETWORK": "im-sit-network",
        "MYSQL_PORT": "3306",
        "REDIS_PORT": "6379",
        "GATEWAY_PORT": "8082",
        "IM_SERVER_PORT": "8083",
        "SPRING_AI_PORT": "8084",
        "FRONTEND_PORT": "80",
        "IM_PRIVATE_HOT_SHARDS": "1",
        "IM_GROUP_HOT_SHARDS": "1",
        "IM_BUILD_NONCE": "sit",
        "FRONTEND_BUILD_MODE": "sit",
        "API_SERVER_RUST_LOG": "api_server_rs=info,im_observe=info,tower_http=warn,sqlx::query=off",
        "VITE_APP_ENV": "sit",
        "VITE_GATEWAY_HOST": "127.0.0.1",
        "VITE_GATEWAY_PORT": "8082",
        "VITE_DEBUG_MODE": "false",
        "VITE_LOG_LEVEL": "info",
        "VITE_ENABLE_MOCK": "false",
    },
    "prd": {
        "GLOBAL_DOCKER_NETWORK": "im-prd-network",
        "MYSQL_PORT": "3306",
        "REDIS_PORT": "6379",
        "GATEWAY_PORT": "8082",
        "IM_SERVER_PORT": "8083",
        "SPRING_AI_PORT": "8084",
        "FRONTEND_PORT": "80",
        "IM_PRIVATE_HOT_SHARDS": "4",
        "IM_GROUP_HOT_SHARDS": "4",
        "IM_BUILD_NONCE": "prd",
        "FRONTEND_BUILD_MODE": "production",
        "API_SERVER_RUST_LOG": "api_server_rs=warn,im_observe=info,tower_http=warn,sqlx::query=off",
        "IM_EVENT_STREAM_MAX_LEN": "1000000",
        "IM_PUBLISHER_BATCH_SIZE": "2000",
        "IM_WRITER_BATCH_SIZE": "2000",
        "VITE_APP_ENV": "production",
        "VITE_GATEWAY_HOST": "",
        "VITE_GATEWAY_PORT": "",
        "VITE_DEBUG_MODE": "false",
        "VITE_LOG_LEVEL": "error",
        "VITE_ENABLE_MOCK": "false",
    },
}

FRONTEND_ENV_FILES = {
    "dev": ".env.dev",
    "sit": ".env.sit",
    "prd": ".env.production",
}

FRONTEND_KEYS = {
    "VITE_APP_ENV",
    "VITE_API_BASE_URL",
    "VITE_WS_BASE_URL",
    "VITE_GATEWAY_HOST",
    "VITE_GATEWAY_PORT",
    "VITE_UPLOAD_MAX_SIZE",
    "VITE_ENABLE_MOCK",
    "VITE_DEBUG_MODE",
    "VITE_LOG_LEVEL",
}

SECRETS: dict[str, tuple[str, str, str]] = {
    "mysql_root": ("MYSQL_ROOT_PASSWORD", "alnum32", "MySQL root password"),
    "redis_password": ("REDIS_PASSWORD", "alnum32", "Redis password"),
    "jwt_secret": ("JWT_SECRET", "base64_64", "JWT signing secret"),
    "refresh_secret": ("AUTH_REFRESH_SECRET", "base64_64", "Refresh token secret"),
    "internal_secret": ("IM_INTERNAL_SECRET", "base64_64", "Internal HMAC secret"),
    "gateway_secret": ("IM_GATEWAY_AUTH_SECRET", "base64_64", "Gateway auth secret"),
    "ai_encryption_key": ("IM_AI_ENCRYPTION_KEY", "base64_32", "AI AES-256 key"),
}


def gen_alnum(length: int) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def gen_base64(byte_count: int) -> str:
    return base64.b64encode(os.urandom(byte_count)).decode("ascii")


GENERATORS = {
    "alnum32": lambda: gen_alnum(32),
    "base64_64": lambda: gen_base64(64),
    "base64_32": lambda: gen_base64(32),
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate build/runtime/env/local.env for dev, sit, or prd deployment."
    )
    parser.add_argument("profile", nargs="?", choices=sorted(PROFILE_ALIASES), help="dev, sit, or prd.")
    parser.add_argument("--profile", dest="profile_option", choices=sorted(PROFILE_ALIASES), help="dev, sit, or prd.")
    parser.add_argument(
        "--env-file",
        default=str(DEFAULT_RUNTIME_ENV_FILE),
        help=f"Output deployment env file. Defaults to {relative(DEFAULT_RUNTIME_ENV_FILE)}.",
    )
    parser.add_argument(
        "--force-secrets",
        action="store_true",
        help="Regenerate secrets even when the runtime env already has values.",
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="Do not create a .bak file before overwriting the runtime env.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print what would be written without changing files.")
    return parser


def parse_args() -> argparse.Namespace:
    parser = build_parser()
    args, unknown = parser.parse_known_args()
    implicit_profiles: list[str] = []
    for item in unknown:
        if item.startswith("--") and item[2:] in PROFILE_ALIASES:
            implicit_profiles.append(item[2:])
            continue
        parser.error(f"unrecognized argument: {item}")
    selected = [
        value for value in [args.profile, args.profile_option, *implicit_profiles] if value
    ]
    if len(selected) != 1:
        parser.error("choose exactly one environment: --dev, --sit, --prd, or positional dev/sit/prd")
    args.resolved_profile = PROFILE_ALIASES[selected[0]]
    return args


def read_env_values(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        values[key.strip()] = value
    return values


def apply_overrides(content: str, overrides: dict[str, str]) -> str:
    key_pattern = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=")
    seen: set[str] = set()
    lines: list[str] = []
    for line in content.splitlines():
        match = key_pattern.match(line)
        if match and match.group(1) in overrides:
            key = match.group(1)
            lines.append(f"{key}={overrides[key]}")
            seen.add(key)
        else:
            lines.append(line)
    missing = [key for key in overrides if key not in seen]
    if missing:
        if lines and lines[-1].strip():
            lines.append("")
        lines.append("# Generated profile overrides")
        lines.extend(f"{key}={overrides[key]}" for key in missing)
    return "\n".join(lines).rstrip() + "\n"


def secret_replacements(
    content: str,
    existing_env: dict[str, str],
    *,
    force: bool,
) -> tuple[dict[str, str], dict[str, str]]:
    pattern = re.compile(r"change_me_(\w+)")
    replacements: dict[str, str] = {}
    sources: dict[str, str] = {}
    for match in pattern.finditer(content):
        suffix = match.group(1)
        if suffix not in SECRETS or suffix in replacements:
            continue
        env_key, generator_name, _description = SECRETS[suffix]
        existing_value = existing_env.get(env_key, "")
        if existing_value and not existing_value.startswith("change_me_") and not force:
            replacements[suffix] = existing_value
            sources[env_key] = "preserved"
            continue
        replacements[suffix] = GENERATORS[generator_name]()
        sources[env_key] = "generated"
    return replacements, sources


def render_root_env(profile: str, env_file: Path, *, force_secrets: bool) -> tuple[str, dict[str, str]]:
    env_example = PROJECT_ROOT / ".env.example"
    if not env_example.is_file():
        print(f"ERROR: {env_example} not found", file=sys.stderr)
        raise SystemExit(1)

    template = env_example.read_text(encoding="utf-8")
    existing_env = read_env_values(env_file)
    replacements, secret_sources = secret_replacements(
        template,
        existing_env,
        force=force_secrets,
    )
    placeholder_pattern = re.compile(r"change_me_(\w+)")

    def replace_placeholder(match: re.Match[str]) -> str:
        suffix = match.group(1)
        return replacements.get(suffix, match.group(0))

    rendered = placeholder_pattern.sub(replace_placeholder, template)
    rendered = apply_overrides(rendered, PROFILE_VALUES[profile])
    remaining = placeholder_pattern.findall(rendered)
    if remaining:
        print(f"WARNING: unresolved placeholders: {sorted(set(remaining))}", file=sys.stderr)
    return rendered, secret_sources


def render_frontend_env(profile: str) -> tuple[Path, str]:
    frontend_file = PROJECT_ROOT / "frontend" / "apps" / "web" / FRONTEND_ENV_FILES[profile]
    base_content = frontend_file.read_text(encoding="utf-8") if frontend_file.is_file() else ""
    values = {"VITE_API_BASE_URL": "/api", "VITE_WS_BASE_URL": "", "VITE_UPLOAD_MAX_SIZE": "10485760"}
    values.update({key: value for key, value in PROFILE_VALUES[profile].items() if key in FRONTEND_KEYS})
    return frontend_file, apply_overrides(base_content, values)


def write_file(path: Path, content: str, *, dry_run: bool) -> None:
    if dry_run:
        print(f"[dry-run] would write {path}")
        return
    path.write_text(content, encoding="utf-8")
    print(f"Wrote {path}")


def main() -> None:
    args = parse_args()
    profile = args.resolved_profile
    env_file = Path(args.env_file)
    if not env_file.is_absolute():
        env_file = PROJECT_ROOT / env_file
    rendered_root, secret_sources = render_root_env(
        profile,
        env_file,
        force_secrets=args.force_secrets,
    )
    frontend_file, rendered_frontend = render_frontend_env(profile)

    if env_file.is_file() and not args.no_backup and not args.dry_run:
        backup = env_file.with_name(env_file.name + ".bak")
        shutil.copy2(env_file, backup)
        print(f"Backed up existing env to {backup}")

    env_file.parent.mkdir(parents=True, exist_ok=True)
    write_file(env_file, rendered_root, dry_run=args.dry_run)
    write_file(frontend_file, rendered_frontend, dry_run=args.dry_run)

    print(f"Environment profile: {profile}")
    for suffix, (env_key, _generator_name, description) in SECRETS.items():
        source = secret_sources.get(env_key, "unchanged")
        print(f"  {description}: {source}")
    print(f"Runtime env: {relative(env_file)}")
    print("Keep runtime env files secure and do not commit them.")
    print("Next step: run scripts/deploy_services.py to apply database migrations and start services.")


if __name__ == "__main__":
    main()
