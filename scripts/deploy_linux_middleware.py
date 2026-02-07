#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
from datetime import datetime


VERSION_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "VERSION")
LOG_PATH = "/var/log/middleware_deploy.log"


def read_version() -> str:
    try:
        with open(VERSION_FILE, "r", encoding="utf-8") as f:
            return f.read().strip()
    except Exception:
        return "0.0.0"


def log_json(event: str, payload: dict):
    rec = {"ts": datetime.utcnow().isoformat() + "Z", "event": event, "payload": payload}
    line = json.dumps(rec, ensure_ascii=False)
    print(line)
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        subprocess.run(f"sudo sh -c 'echo \"{line}\" >> {LOG_PATH}'", shell=True)


def run(cmd: str, check=True) -> int:
    log_json("run", {"cmd": cmd})
    r = subprocess.run(cmd, shell=True)
    if check and r.returncode != 0:
        raise RuntimeError(cmd)
    return r.returncode


def output(cmd: str) -> str:
    return subprocess.check_output(cmd, shell=True, universal_newlines=True).strip()


def port_in_use(host: str, port: int, timeout_ms=200) -> bool:
    s = socket.socket()
    s.settimeout(timeout_ms / 1000.0)
    try:
        s.connect((host, port))
        return True
    except Exception:
        return False
    finally:
        s.close()


def find_free_port(host: str, start_port: int) -> int:
    p = start_port
    while port_in_use(host, p):
        p += 1
    return p


def ensure_docker():
    if shutil.which("docker"):
        return
    script_path = "/tmp/get-docker.sh"
    with urllib.request.urlopen("https://get.docker.com") as r:
        content = r.read()
    with open(script_path, "wb") as f:
        f.write(content)
    run(f"sh {script_path}")
    if shutil.which("systemctl"):
        run("systemctl enable docker", check=False)
        run("systemctl start docker", check=False)
    else:
        run("service docker start", check=False)


def cleanup_images(args):
    run("docker rm -f nacos nginx mysql redis kafka mysql-exporter redis-exporter kafka-exporter", check=False)
    run("docker network rm im-net", check=False)
    run("docker system prune -af --volumes", check=False)


def deploy(args):
    args.registry_port = find_free_port(args.host, args.registry_port)
    args.nginx_http = find_free_port(args.host, args.nginx_http)
    args.mysql_port = find_free_port(args.host, args.mysql_port)
    args.redis_port = find_free_port(args.host, args.redis_port)
    args.kafka_port = find_free_port(args.host, args.kafka_port)
    args.mysql_exporter_port = find_free_port(args.host, args.mysql_exporter_port)
    args.redis_exporter_port = find_free_port(args.host, args.redis_exporter_port)
    args.kafka_exporter_port = find_free_port(args.host, args.kafka_exporter_port)

    for p in [args.data_dir, args.log_dir]:
        run(f"mkdir -p {p}", check=False)
    for name in ["mysql", "redis", "kafka", "nginx", "nacos"]:
        run(f"mkdir -p {args.data_dir}/{name}", check=False)
        run(f"mkdir -p {args.log_dir}/{name}", check=False)

    net_name = args.network
    if run(f"docker network ls --format '{{{{.Name}}}}' | grep -w {net_name}", check=False) != 0:
        run(f"docker network create {net_name}")

    run(
        "docker run -d --restart unless-stopped "
        f"--name nacos --network {net_name} "
        f"-p {args.registry_port}:8848 "
        "-e MODE=standalone "
        f"-v {args.data_dir}/nacos:/home/nacos/data "
        f"-v {args.log_dir}/nacos:/home/nacos/logs "
        f"nacos/nacos-server:{args.registry_version}"
    )
    nginx_volumes = [f"-v {args.log_dir}/nginx:/var/log/nginx"]
    if args.frontend_dir and os.path.exists(args.frontend_dir):
        nginx_volumes.insert(0, f"-v {args.frontend_dir}:/usr/share/nginx/html:ro")
    else:
        log_json("warning", {"msg": f"frontend_dir_not_found: {args.frontend_dir}"})
    if args.nginx_conf and os.path.exists(args.nginx_conf):
        nginx_volumes.insert(0, f"-v {args.nginx_conf}:/etc/nginx/conf.d/default.conf:ro")
    else:
        log_json("warning", {"msg": f"nginx_conf_not_found: {args.nginx_conf}"})
    run(
        "docker run -d --restart unless-stopped "
        f"--name nginx --network {net_name} "
        f"-p {args.nginx_http}:80 "
        f"{' '.join(nginx_volumes)} "
        f"nginx:{args.nginx_version}"
    )
    run(
        "docker run -d --restart unless-stopped "
        f"--name mysql --network {net_name} "
        f"-p {args.mysql_port}:3306 "
        f"-e MYSQL_ROOT_PASSWORD={args.mysql_password} "
        f"-v {args.data_dir}/mysql:/var/lib/mysql "
        f"-v {args.log_dir}/mysql:/var/log/mysql "
        f"mysql:{args.mysql_version}"
    )
    run(
        "docker run -d --restart unless-stopped "
        f"--name redis --network {net_name} "
        f"-p {args.redis_port}:6379 "
        f"-v {args.data_dir}/redis:/data "
        f"-v {args.log_dir}/redis:/var/log/redis "
        f"redis:{args.redis_version} "
        "--appendonly yes"
    )
    kafka_img = f"apache/kafka:{args.kafka_version}"
    run(f"docker pull {kafka_img}", check=False)
    run(
        "docker run -d --restart unless-stopped "
        f"--name kafka --network {net_name} "
        f"-p {args.kafka_port}:9092 "
        f"-e KAFKA_NODE_ID=1 "
        f"-e KAFKA_PROCESS_ROLES=broker,controller "
        f"-e KAFKA_CONTROLLER_QUORUM_VOTERS=1@kafka:9093 "
        f"-e KAFKA_LISTENERS=PLAINTEXT://:9092,CONTROLLER://:9093 "
        f"-e KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://kafka:9092 "
        f"-e KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT "
        f"-e KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER "
        f"-e KAFKA_INTER_BROKER_LISTENER_NAME=PLAINTEXT "
        f"-e KAFKA_CLUSTER_ID=5L6g3nShT-eMCtK--X86sw "
        f"-v {args.data_dir}/kafka:/var/lib/kafka/data "
        f"-v {args.log_dir}/kafka:/var/log/kafka "
        f"{kafka_img}"
    )
    run(
        "docker run -d --restart unless-stopped "
        f"--name mysql-exporter --network {net_name} "
        f"-p {args.mysql_exporter_port}:9104 "
        f"-e DATA_SOURCE_NAME='root:{args.mysql_password}@(mysql:3306)/' "
        f"prom/mysqld-exporter:{args.mysql_exporter_version}"
    )
    run(
        "docker run -d --restart unless-stopped "
        f"--name redis-exporter --network {net_name} "
        f"-p {args.redis_exporter_port}:9121 "
        f"-e REDIS_ADDR=redis://redis:6379 "
        f"oliver006/redis_exporter:{args.redis_exporter_version}"
    )
    run(
        "docker run -d --restart unless-stopped "
        f"--name kafka-exporter --network {net_name} "
        f"-p {args.kafka_exporter_port}:9308 "
        f"danielqsj/kafka-exporter:{args.kafka_exporter_version} "
        f"--kafka.server=kafka:9092"
    )

    log_json("deployed", {
        "ports": {
            "nacos": args.registry_port,
            "nginx": args.nginx_http,
            "mysql": args.mysql_port,
            "redis": args.redis_port,
            "kafka": args.kafka_port,
            "mysql_exporter": args.mysql_exporter_port,
            "redis_exporter": args.redis_exporter_port,
            "kafka_exporter": args.kafka_exporter_port,
        }
    })


def rollback(args):
    for c in [
        "nacos",
        "nginx",
        "mysql",
        "redis",
        "kafka",
        "mysql-exporter",
        "redis-exporter",
        "kafka-exporter",
    ]:
        run(f"docker rm -f {c}", check=False)
    run(f"docker network rm {args.network}", check=False)
    log_json("rollback", {"status": "done"})


def http_health(url: str) -> int:
    t0 = time.time()
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=3) as resp:
        return resp.status, int((time.time() - t0) * 1000)


def tcp_health(host: str, port: int) -> int:
    t0 = time.time()
    ok = port_in_use(host, port, timeout_ms=400)
    return (200 if ok else 0), int((time.time() - t0) * 1000)


def test_middleware_health(args):
    checks = [
        ("nacos_http", f"http://{args.host}:{args.registry_port}/nacos/actuator/health"),
        ("nginx_http", f"http://{args.host}:{args.nginx_http}/"),
    ]
    for name, url in checks:
        code, latency = (0, 0)
        for _ in range(30):
            try:
                code, latency = http_health(url)
            except Exception:
                code, latency = (0, 0)
            if code == 200:
                break
            time.sleep(2)
        print(json.dumps({"service": name, "code": code, "latency_ms": latency}))
        assert code == 200 and latency < 500
    tcp_checks = [
        ("mysql_tcp", args.host, args.mysql_port),
        ("redis_tcp", args.host, args.redis_port),
        ("kafka_tcp", args.host, args.kafka_port),
    ]
    for name, host, port in tcp_checks:
        code, latency = (0, 0)
        for _ in range(60):
            code, latency = tcp_health(host, port)
            if code == 200:
                break
            time.sleep(2)
        print(json.dumps({"service": name, "code": code, "latency_ms": latency}))
        assert code == 200 and latency < 500


def main():
    parser = argparse.ArgumentParser(description="Linux中间件部署", formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--network", default="im-net")
    parser.add_argument("--data-dir", dest="data_dir", default="/home/data")
    parser.add_argument("--log-dir", dest="log_dir", default="/home/new-im-project/logs")
    parser.add_argument("--registry-version", default="v2.3.2")
    parser.add_argument("--nginx-version", default="latest")
    parser.add_argument("--frontend-dir", dest="frontend_dir", default="/home/new-im-project/frontend/dist")
    parser.add_argument("--nginx-conf", dest="nginx_conf", default="/home/new-im-project/frontend/nginx.conf")
    parser.add_argument("--mysql-version", default="8.0")
    parser.add_argument("--redis-version", default="7-alpine")
    parser.add_argument("--kafka-version", default="3.7.0")
    parser.add_argument("--mysql-exporter-version", default="v0.15.1")
    parser.add_argument("--redis-exporter-version", default="v1.61.0")
    parser.add_argument("--kafka-exporter-version", default="v1.7.0")
    parser.add_argument("--mysql-password", default="root123")
    parser.add_argument("--registry-port", type=int, default=8848)
    parser.add_argument("--nginx-http", type=int, default=80)
    parser.add_argument("--mysql-port", type=int, default=3306)
    parser.add_argument("--redis-port", type=int, default=6379)
    parser.add_argument("--kafka-port", type=int, default=9092)
    parser.add_argument("--mysql-exporter-port", type=int, default=9104)
    parser.add_argument("--redis-exporter-port", type=int, default=9121)
    parser.add_argument("--kafka-exporter-port", type=int, default=9308)
    parser.add_argument("--version", action="version", version=read_version())
    args = parser.parse_args()

    deployed_ok = False
    try:
        ensure_docker()
        cleanup_images(args)
        deploy(args)
        deployed_ok = True
        test_middleware_health(args)
    except Exception as e:
        log_json("error", {"msg": str(e)})
        if not deployed_ok:
            rollback(args)
        else:
            log_json("warning", {"msg": "health_check_failed"})
            sys.exit(2)
    sys.exit(0)


if __name__ == "__main__":
    main()
