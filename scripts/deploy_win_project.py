#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import argparse
import os
import subprocess
import sys
import time
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


def log_path() -> str:
    return os.path.join(os.environ.get("USERPROFILE", "."), "logs", "project_deploy.log")


def log_line(text: str):
    print(text)
    os.makedirs(os.path.dirname(log_path()), exist_ok=True)
    with open(log_path(), "a", encoding="utf-8") as f:
        f.write(text + "\n")


def main():
    parser = argparse.ArgumentParser(description="Windows 项目部署", formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--branch", default=os.getenv("CI_COMMIT_REF_NAME", "master"))
    parser.add_argument("--dir", default=r"C:\new-im-project")
    parser.add_argument("--compose", default="docker-compose.win.yml")
    parser.add_argument("--version", action="version", version=read_version())
    args = parser.parse_args()

    t0 = time.time()
    try:
        run('powershell -Command "docker system prune -a -f"')
        run(f'git clone --depth 1 -b {args.branch} {args.repo} "{args.dir}"')
        run(f'cd /d "{args.dir}\\backend" && mvn.cmd clean package -DskipTests')
        run(f'cd /d "{args.dir}" && docker-compose.exe -f {args.compose} up -d')
        time.sleep(90)
        ps = output(f'cd /d "{args.dir}" && docker-compose.exe -f {args.compose} ps')
        log_line(ps)
        cost_ms = int((time.time() - t0) * 1000)
        log_line(f"DEPLOY_OK cost_ms={cost_ms}")
        sys.exit(0)
    except Exception as e:
        log_line(f"DEPLOY_FAIL {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
