#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import argparse
import json
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


def check_windows_version():
    ver = output('powershell -Command "([System.Environment]::OSVersion.Version.Build)"')
    if int(ver) < 18362:
        raise RuntimeError("Windows 版本低于 1903")


def port_in_use(port: int) -> bool:
    cmd = f'powershell -Command "Get-NetTCPConnection -State Listen -LocalPort {port} -ErrorAction SilentlyContinue | Select -First 1"'
    return len(output(cmd)) > 0


def find_free_port(start: int) -> int:
    p = start
    while port_in_use(p):
        p += 1
    return p


def win_to_wsl_path(path: str) -> str:
    path = path.replace("\\", "/")
    if ":" in path:
        drive = path[0].lower()
        rest = path[2:]
        return f"/run/desktop/mnt/host/{drive}/{rest}"
    return path


def deploy(args):
    args.nginx_port = find_free_port(args.nginx_port)
    args.mysql_port = find_free_port(args.mysql_port)
    args.redis_port = find_free_port(args.redis_port)
    args.kafka_port = find_free_port(args.kafka_port)
    args.registry_port = find_free_port(args.registry_port)

    data_dir = win_to_wsl_path(args.data_dir)
    log_dir = win_to_wsl_path(args.log_dir)
    run(f"powershell -Command \"New-Item -ItemType Directory -Force -Path '{args.data_dir}\\mysql','{args.data_dir}\\redis','{args.data_dir}\\kafka','{args.log_dir}\\nginx','{args.log_dir}\\nacos'\"")

    run(
        f"docker run -d --restart unless-stopped --name nacos -p {args.registry_port}:8848 "
        f"-e MODE=standalone -v {data_dir}/nacos:/home/nacos/data -v {log_dir}/nacos:/home/nacos/logs "
        f"nacos/nacos-server:{args.registry_version}"
    )
    nginx_volumes = [f"-v {log_dir}/nginx:/var/log/nginx"]
    if args.frontend_dir and os.path.exists(args.frontend_dir):
        nginx_volumes.insert(0, f"-v {win_to_wsl_path(args.frontend_dir)}:/usr/share/nginx/html:ro")
    if args.nginx_conf and os.path.exists(args.nginx_conf):
        nginx_volumes.insert(0, f"-v {win_to_wsl_path(args.nginx_conf)}:/etc/nginx/conf.d/default.conf:ro")
    run(
        f"docker run -d --restart unless-stopped --name nginx -p {args.nginx_port}:80 "
        f"{' '.join(nginx_volumes)} nginx:{args.nginx_version}"
    )
    run(
        f"docker run -d --restart unless-stopped --name mysql -p {args.mysql_port}:3306 "
        f"-e MYSQL_ROOT_PASSWORD={args.mysql_password} -v {data_dir}/mysql:/var/lib/mysql mysql:{args.mysql_version}"
    )
    run(
        f"docker run -d --restart unless-stopped --name redis -p {args.redis_port}:6379 "
        f"-v {data_dir}/redis:/data redis:{args.redis_version} --appendonly yes"
    )
    run(
        f"docker run -d --restart unless-stopped --name kafka -p {args.kafka_port}:9092 "
        f"-v {data_dir}/kafka:/var/lib/kafka/data bitnami/kafka:{args.kafka_version}"
    )

    status = {
        "nacos": {"id": output("docker ps -q -f name=nacos"), "port": args.registry_port, "url": f"http://localhost:{args.registry_port}/nacos"},
        "nginx": {"id": output("docker ps -q -f name=nginx"), "port": args.nginx_port, "url": f"http://localhost:{args.nginx_port}"},
        "mysql": {"id": output("docker ps -q -f name=mysql"), "port": args.mysql_port, "password": args.mysql_password},
        "redis": {"id": output("docker ps -q -f name=redis"), "port": args.redis_port},
        "kafka": {"id": output("docker ps -q -f name=kafka"), "port": args.kafka_port},
    }
    with open("middleware_status.json", "w", encoding="utf-8") as f:
        json.dump(status, f, ensure_ascii=False, indent=2)


def main():
    parser = argparse.ArgumentParser(description="Windows 中间件部署", formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    parser.add_argument("--data-dir", default=r"C:\im-data")
    parser.add_argument("--log-dir", default=r"C:\im-logs")
    parser.add_argument("--nginx-version", default="latest")
    parser.add_argument("--frontend-dir", dest="frontend_dir", default=r"C:\new-im-project\frontend\dist")
    parser.add_argument("--nginx-conf", dest="nginx_conf", default=r"C:\new-im-project\frontend\nginx.conf")
    parser.add_argument("--mysql-version", default="8.0")
    parser.add_argument("--redis-version", default="7-alpine")
    parser.add_argument("--kafka-version", default="3.7")
    parser.add_argument("--registry-version", default="v2.3.2")
    parser.add_argument("--mysql-password", default="root123")
    parser.add_argument("--nginx-port", type=int, default=80)
    parser.add_argument("--mysql-port", type=int, default=3306)
    parser.add_argument("--redis-port", type=int, default=6379)
    parser.add_argument("--kafka-port", type=int, default=9092)
    parser.add_argument("--registry-port", type=int, default=8848)
    parser.add_argument("--version", action="version", version=read_version())
    args = parser.parse_args()

    check_windows_version()
    deploy(args)


if __name__ == "__main__":
    main()
