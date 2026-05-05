#!/usr/bin/env python3
"""Generate .env with cryptographically strong random secrets.

Reads .env.example, replaces change_me_* placeholders with random values,
and writes .env. Existing .env is backed up to .env.bak.
"""
from __future__ import annotations

import base64
import os
import re
import secrets
import shutil
import string
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

# Secret definitions: placeholder suffix -> (generator, description)
SECRETS: dict[str, tuple[str, str]] = {
    "mysql_root": ("alnum32", "MySQL root password"),
    "redis_password": ("alnum32", "Redis password"),
    "jwt_secret": ("base64_64", "JWT signing secret (64 bytes)"),
    "refresh_secret": ("base64_64", "Refresh token secret (64 bytes)"),
    "internal_secret": ("base64_64", "Internal HMAC secret (64 bytes)"),
    "gateway_secret": ("base64_64", "Gateway auth secret (64 bytes)"),
    "ai_encryption_key": ("base64_32", "AES-256 encryption key (32 bytes)"),
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


def main() -> None:
    env_example = PROJECT_ROOT / ".env.example"
    env_file = PROJECT_ROOT / ".env"

    if not env_example.is_file():
        print(f"ERROR: {env_example} not found", file=sys.stderr)
        sys.exit(1)

    # Backup existing .env
    if env_file.is_file():
        backup = PROJECT_ROOT / ".env.bak"
        shutil.copy2(env_file, backup)
        print(f"Backed up existing .env to {backup.name}")

    content = env_example.read_text(encoding="utf-8")

    # Find and replace all change_me_* patterns
    pattern = re.compile(r"change_me_(\w+)")
    replacements: dict[str, str] = {}

    for match in pattern.finditer(content):
        placeholder = match.group(0)
        suffix = match.group(1)
        if suffix in SECRETS and suffix not in replacements:
            gen_name, description = SECRETS[suffix]
            value = GENERATORS[gen_name]()
            replacements[suffix] = value
            print(f"  {description}: {value[:8]}...")

    # Apply replacements
    def replace_match(match: re.Match[str]) -> str:
        suffix = match.group(1)
        return replacements.get(suffix, match.group(0))

    result = pattern.sub(replace_match, content)

    # Check for any remaining change_me_ placeholders
    remaining = pattern.findall(result)
    if remaining:
        print(f"WARNING: Unresolved placeholders: {remaining}", file=sys.stderr)

    env_file.write_text(result, encoding="utf-8")
    print(f"\n.env generated with {len(replacements)} secrets.")
    print("IMPORTANT: Keep .env secure and never commit it to version control.")


if __name__ == "__main__":
    main()
