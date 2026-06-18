#!/usr/bin/env python3
"""
P1-6 Unified E2EE Plaintext Database Scan.

Scans all P0/P1 E2EE database tables for plaintext secret leakage.

Required tables:
  - service_message_service_db.messages (content, e2ee_envelope_json)
  - service_message_service_db.message_deliveries (header, ciphertext)
  - service_user_service_db.e2ee_sender_keys (encrypted_sender_key)

Optional tables (warning only):
  - service_user_service_db.e2ee_pre_key_claims (one_time_pre_key)

Usage:
    python tests/p1/p1_db_plaintext_scan.py \
        --db-url mysql://root:root123@127.0.0.1:3306/service_message_service_db \
        --secrets secret1,secret2,secret3

If --secrets is not provided, uses built-in P0/P1 test secrets.
"""

from __future__ import annotations

import sys
import os
import argparse
import hashlib
from typing import List, Dict, Optional, Tuple


# ============================================================================
# Built-in P0/P1 test secrets
# ============================================================================

P0_SECRETS = [
    "p0-web-to-mobile-secret-001",
    "p0-mobile-to-web-secret-001",
]

P1_SECRETS = [
    "p1-multi-alice-to-bob-secret",
    "p1-multi-alice-dev2-to-bob-secret",
    "p1-group-secret-message",
]

BUILT_IN_SECRETS = P0_SECRETS + P1_SECRETS

# ============================================================================
# Table definitions
# ============================================================================

# format: (schema, table, columns, required)
SCAN_TARGETS: List[Tuple[str, str, List[str], bool]] = [
    (
        "service_message_service_db",
        "messages",
        ["content", "e2ee_envelope_json"],
        True,
    ),
    (
        "service_message_service_db",
        "message_deliveries",
        ["header", "ciphertext"],
        True,
    ),
    (
        "service_user_service_db",
        "e2ee_sender_keys",
        ["encrypted_sender_key"],
        True,
    ),
    (
        "service_user_service_db",
        "e2ee_pre_key_claims",
        ["one_time_pre_key"],
        False,
    ),
    (
        "service_user_service_db",
        "e2ee_one_time_pre_keys",
        ["pre_key"],
        False,
    ),
    (
        "service_user_service_db",
        "e2ee_devices",
        ["identity_key", "signing_identity_key", "signed_pre_key"],
        False,
    ),
]


# ============================================================================
# Scanner
# ============================================================================

def secret_hash(secret: str) -> str:
    """Short hash of a secret for safe reporting."""
    return hashlib.sha256(secret.encode()).hexdigest()[:8]


def scan_database(
    db_url: str,
    secrets: List[str],
) -> Tuple[List[str], List[str]]:
    """Scan all target tables for plaintext secrets.

    Returns (violations, warnings).
    - violations: plaintext secret hits or required table missing
    - warnings: optional table missing or inaccessible
    """
    try:
        import pymysql
    except ImportError:
        return (
            ["pymysql not installed. Run: pip install pymysql"],
            [],
        )

    # Parse MySQL URL
    url = db_url
    if url.startswith("mysql://"):
        url = url[8:]
    user_pass, host_db = url.split("@", 1)
    user, password = user_pass.split(":", 1)
    host_port, database = host_db.split("/", 1)
    if ":" in host_port:
        host, port_str = host_port.split(":", 1)
        port = int(port_str)
    else:
        host = host_port
        port = 3306

    violations: List[str] = []
    warnings: List[str] = []

    conn = pymysql.connect(
        host=host, port=port, user=user, password=password,
        database=database, charset="utf8mb4",
    )
    cursor = conn.cursor()

    for schema, table, columns, required in SCAN_TARGETS:
        # Check if table exists
        try:
            cursor.execute(
                "SELECT 1 FROM INFORMATION_SCHEMA.TABLES "
                "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s",
                (schema, table),
            )
            if not cursor.fetchone():
                msg = (
                    f"Required table {schema}.{table} not found"
                    if required else
                    f"Optional table {schema}.{table} not found"
                )
                if required:
                    violations.append(msg)
                else:
                    warnings.append(msg)
                continue
        except pymysql.err.ProgrammingError as e:
            if required:
                violations.append(f"Cannot query table {schema}.{table}: {e}")
            else:
                warnings.append(f"Cannot query optional table {schema}.{table}: {e}")
            continue

        # Check each column
        for col in columns:
            # Verify column exists
            try:
                cursor.execute(f"SELECT * FROM {schema}.{table} WHERE 1=0")
                table_cols = [d[0] for d in cursor.description]
            except pymysql.err.ProgrammingError as e:
                warnings.append(f"Cannot describe {schema}.{table}: {e}")
                continue

            if col not in table_cols:
                msg = (
                    f"Required column {schema}.{table}.{col} not found"
                    if required else
                    f"Optional column {schema}.{table}.{col} not found"
                )
                if required:
                    violations.append(msg)
                else:
                    warnings.append(msg)
                continue

            # LIKE scan for each secret
            for secret in secrets:
                try:
                    cursor.execute(
                        f"SELECT 1 FROM {schema}.{table} "
                        f"WHERE {col} LIKE %s LIMIT 5",
                        (f"%{secret}%",),
                    )
                    rows = cursor.fetchall()
                    if rows:
                        violations.append(
                            f"PLAINTEXT HIT: {schema}.{table}.{col} "
                            f"(rows matched: {len(rows)}) "
                            f"secret_hash={secret_hash(secret)}"
                        )
                except pymysql.err.ProgrammingError as e:
                    warnings.append(
                        f"Cannot scan {schema}.{table}.{col} for secret "
                        f"[{secret_hash(secret)}]: {e}"
                    )

    cursor.close()
    conn.close()

    return violations, warnings


# ============================================================================
# Main
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="P1 E2EE Database Plaintext Scan")
    parser.add_argument(
        "--base-url",
        default=None,
        help="Backend base URL (accepted for compatibility with p1_sit_gate.py, ignored)",
    )
    parser.add_argument(
        "--db-url",
        default=None,
        help="MySQL URL (mysql://user:pass@host:port/database) — required",
    )
    parser.add_argument(
        "--secrets",
        default=None,
        help="Comma-separated list of test secrets to scan for",
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Directory to write scan results (default: artifacts/p1-db-scan)",
    )
    args = parser.parse_args()

    if not args.db_url:
        print("FAIL: --db-url is required for P1 DB plaintext scan")
        sys.exit(1)

    secrets = BUILT_IN_SECRETS
    if args.secrets:
        secrets = [s.strip() for s in args.secrets.split(",") if s.strip()]

    if not secrets:
        print("FAIL: No secrets provided (use --secrets or rely on built-in defaults)")
        sys.exit(1)

    print(f"Scanning {len(secrets)} secrets across {len(SCAN_TARGETS)} tables...")
    print(f"Secrets: {', '.join(secret_hash(s) for s in secrets)}")
    print()

    violations, warnings = scan_database(args.db_url, secrets)

    # Print warnings
    if warnings:
        print("WARNINGS:")
        for w in warnings:
            print(f"  [WARN] {w}")
        print()

    # Print violations
    if violations:
        print("VIOLATIONS:")
        for v in violations:
            print(f"  [FAIL] {v}")
        print(f"\nTotal violations: {len(violations)}")
    else:
        print("No plaintext violations found.")

    # Write output
    if args.output_dir:
        out_path = os.path.join(args.output_dir, "plaintext-scan.txt")
        os.makedirs(args.output_dir, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write("# P1 DB Plaintext Scan Results\n\n")
            f.write(f"secrets_scanned={len(secrets)}\n")
            f.write(f"violations={len(violations)}\n")
            f.write(f"warnings={len(warnings)}\n\n")
            for v in violations:
                f.write(f"FAIL: {v}\n")
            for w in warnings:
                f.write(f"WARN: {w}\n")

    # Exit
    has_failures = any(v for v in violations if not v.startswith("Optional"))
    if has_failures:
        print("\nP1 DB PLAN TEXT SCAN: FAIL")
        sys.exit(1)

    print("\nP1 DB PLAIN TEXT SCAN: PASS")
    sys.exit(0)


if __name__ == "__main__":
    main()
