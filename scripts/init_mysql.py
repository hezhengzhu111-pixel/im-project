#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import argparse
import configparser
import hashlib
import json
import os
import sys
import time

import pymysql

VERSION_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "VERSION")


def read_version() -> str:
    try:
        with open(VERSION_FILE, "r", encoding="utf-8") as f:
            return f.read().strip()
    except Exception:
        return "0.0.0"


def load_config(path: str):
    cfg = configparser.ConfigParser()
    cfg.read(path, encoding="utf-8")
    section = cfg["mysql"]
    return {
        "host": section.get("host", "127.0.0.1"),
        "port": section.getint("port", 3306),
        "user": section.get("user", "root"),
        "password": section.get("password", ""),
        "charset": section.get("charset", "utf8mb4"),
        "database": section.get("database", ""),
    }


def file_hash(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


def ensure_schema_table(cursor):
    cursor.execute(
        "CREATE TABLE IF NOT EXISTS schema_version ("
        "id INT AUTO_INCREMENT PRIMARY KEY,"
        "filename VARCHAR(255) NOT NULL,"
        "hash VARCHAR(64) NOT NULL,"
        "applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
        ")"
    )


def executed_hashes(cursor):
    cursor.execute("SELECT filename, hash FROM schema_version")
    return {(row[0], row[1]) for row in cursor.fetchall()}


def list_sql_files(root: str):
    files = []
    for name in os.listdir(root):
        if name.startswith("v") and name.endswith(".sql"):
            files.append(os.path.join(root, name))
    return sorted(files)


def split_sql(content: str):
    statements = []
    buff = []
    for line in content.splitlines():
        if line.strip().startswith("--"):
            continue
        buff.append(line)
        if line.strip().endswith(";"):
            stmt = "\n".join(buff).strip().rstrip(";")
            if stmt:
                statements.append(stmt)
            buff = []
    tail = "\n".join(buff).strip()
    if tail:
        statements.append(tail)
    return statements


def main():
    parser = argparse.ArgumentParser(description="MySQL 初始化", formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    parser.add_argument("--config", default="db/config.ini")
    parser.add_argument("--sql-dir", default="sql")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--version", action="version", version=read_version())
    args = parser.parse_args()

    t0 = time.time()
    report = {"success": 0, "failed": 0, "errors": []}
    cfg = load_config(args.config)
    conn = pymysql.connect(
        host=cfg["host"],
        port=cfg["port"],
        user=cfg["user"],
        password=cfg["password"],
        database=cfg["database"] or None,
        charset=cfg["charset"],
        autocommit=True,
    )
    try:
        with conn.cursor() as cur:
            ensure_schema_table(cur)
            done = executed_hashes(cur)
            files = list_sql_files(args.sql_dir)
            for path in files:
                h = file_hash(path)
                key = (os.path.basename(path), h)
                if key in done:
                    continue
                sql_text = open(path, "r", encoding="utf-8").read()
                statements = split_sql(sql_text)
                if args.dry_run:
                    for s in statements:
                        print(s)
                    continue
                try:
                    for s in statements:
                        cur.execute(s)
                    cur.execute("INSERT INTO schema_version(filename, hash) VALUES(%s,%s)", key)
                    report["success"] += 1
                except Exception as e:
                    report["failed"] += 1
                    report["errors"].append({"file": path, "error": str(e)})
    finally:
        conn.close()
    report["cost_ms"] = int((time.time() - t0) * 1000)
    with open("init_report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    if report["failed"] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
