#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import csv
import os
import subprocess
import sys
from datetime import datetime

VERSION_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "VERSION")


def read_version() -> str:
    try:
        with open(VERSION_FILE, "r", encoding="utf-8") as f:
            return f.read().strip()
    except Exception:
        return "0.0.0"


def run(cmd: str, check=True) -> int:
    r = subprocess.run(cmd, shell=True)
    if check and r.returncode != 0:
        raise RuntimeError(cmd)
    return r.returncode


def output(cmd: str) -> str:
    return subprocess.check_output(cmd, shell=True, universal_newlines=True).strip()


def main():
    types = ["feat", "fix", "docs", "style", "refactor", "test", "chore"]
    print("选择提交类型:")
    for i, t in enumerate(types, 1):
        print(f"{i}. {t}")
    idx = int(input("输入数字: ").strip())
    ctype = types[idx - 1]
    scope = input("scope(可空): ").strip()
    subject = input("subject: ").strip()
    msg = f"{ctype}({scope}): {subject}" if scope else f"{ctype}: {subject}"

    run("git add -A")
    run("pre-commit run --all-files")
    run(f'git commit -m "{msg}"')

    branch = output("git rev-parse --abbrev-ref HEAD")
    author = output("git config user.name")
    files = output("git diff --name-only HEAD~1..HEAD")
    with open("commit_history.csv", "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([author, datetime.now().isoformat(), branch, msg, files.replace("\n", ";")])

    if branch in ("main", "master"):
        ts = datetime.now().strftime("%Y%m%d%H%M%S")
        tmp = f"auto/{ts}"
        run(f"git checkout -b {tmp}")
        run("git push -u origin HEAD")
        print(f"请在平台创建 PR: 分支 {tmp}")


if __name__ == "__main__":
    if "--version" in sys.argv:
        print(read_version())
        sys.exit(0)
    main()
