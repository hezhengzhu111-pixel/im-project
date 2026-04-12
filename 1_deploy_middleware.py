from __future__ import annotations

import json
from textwrap import dedent
from typing import Union

from deploy_utils import (
    ELASTICSEARCH_CONTAINER_NAME,
    ELASTICSEARCH_INTERNAL_PORT,
    KAFKA_CONTAINER_NAME,
    KAFKA_EXTERNAL_PORT,
    KAFKA_INTERNAL_PORT,
    MYSQL_CONTAINER_NAME,
    MYSQL_INTERNAL_PORT,
    NACOS_CONTAINER_NAME,
    NACOS_INTERNAL_PORT,
    REDIS_CONTAINER_NAME,
    REDIS_INTERNAL_PORT,
    DeploymentConfig,
    ensure_directory,
    ensure_docker_network,
    fatal,
    load_config,
    resolve_docker_compose_command,
    resolve_executable,
    run_command,
    wait_for_container,
    write_text_file,
)


def quote_yaml(value: Union[str, int]) -> str:
    return json.dumps(str(value))


def build_compose_content(config: DeploymentConfig) -> str:
    network_name = config.global_docker_network
    mysql_password = quote_yaml(config.mysql_root_password)
    redis_password = quote_yaml(config.redis_password)

    return dedent(
        f"""
        services:
          mysql:
            image: mysql:8.0.39
            container_name: {MYSQL_CONTAINER_NAME}
            hostname: {MYSQL_CONTAINER_NAME}
            restart: unless-stopped
            command:
              - mysqld
              - --character-set-server=utf8mb4
              - --collation-server=utf8mb4_0900_ai_ci
            environment:
              TZ: "Asia/Shanghai"
              MYSQL_ROOT_PASSWORD: {mysql_password}
            ports:
              - {quote_yaml(f"{config.mysql_port}:{MYSQL_INTERNAL_PORT}")}
            volumes:
              - mysql_data:/var/lib/mysql
            healthcheck:
              test: ["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 -uroot -p$$MYSQL_ROOT_PASSWORD --silent"]
              interval: 10s
              timeout: 5s
              retries: 20
              start_period: 30s
            networks:
              {network_name}:
                aliases:
                  - {MYSQL_CONTAINER_NAME}

          redis:
            image: redis:7.2-alpine
            container_name: {REDIS_CONTAINER_NAME}
            hostname: {REDIS_CONTAINER_NAME}
            restart: unless-stopped
            command:
              - redis-server
              - --appendonly
              - "yes"
              - --requirepass
              - {redis_password}
            ports:
              - {quote_yaml(f"{config.redis_port}:{REDIS_INTERNAL_PORT}")}
            volumes:
              - redis_data:/data
            healthcheck:
              test: ["CMD", "redis-cli", "-a", {redis_password}, "ping"]
              interval: 10s
              timeout: 3s
              retries: 20
            networks:
              {network_name}:
                aliases:
                  - {REDIS_CONTAINER_NAME}

          nacos-standalone:
            image: nacos/nacos-server:v2.4.2-slim
            container_name: {NACOS_CONTAINER_NAME}
            hostname: {NACOS_CONTAINER_NAME}
            restart: unless-stopped
            environment:
              TZ: "Asia/Shanghai"
              MODE: "standalone"
              PREFER_HOST_MODE: "hostname"
              NACOS_AUTH_ENABLE: "false"
              JVM_XMS: "256m"
              JVM_XMX: "256m"
              JVM_XMN: "128m"
            ports:
              - {quote_yaml(f"{config.nacos_port}:{NACOS_INTERNAL_PORT}")}
            volumes:
              - nacos_data:/home/nacos/data
            networks:
              {network_name}:
                aliases:
                  - {NACOS_CONTAINER_NAME}

          kafka:
            image: apache/kafka:3.7.0
            container_name: {KAFKA_CONTAINER_NAME}
            hostname: {KAFKA_CONTAINER_NAME}
            restart: unless-stopped
            environment:
              TZ: "Asia/Shanghai"
              KAFKA_NODE_ID: "1"
              KAFKA_PROCESS_ROLES: "broker,controller"
              KAFKA_LISTENERS: "INTERNAL://0.0.0.0:{KAFKA_INTERNAL_PORT},EXTERNAL://0.0.0.0:{KAFKA_EXTERNAL_PORT},CONTROLLER://0.0.0.0:9093"
              KAFKA_ADVERTISED_LISTENERS: "INTERNAL://{KAFKA_CONTAINER_NAME}:{KAFKA_INTERNAL_PORT},EXTERNAL://localhost:{config.kafka_port}"
              KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: "INTERNAL:PLAINTEXT,EXTERNAL:PLAINTEXT,CONTROLLER:PLAINTEXT"
              KAFKA_INTER_BROKER_LISTENER_NAME: "INTERNAL"
              KAFKA_CONTROLLER_LISTENER_NAMES: "CONTROLLER"
              KAFKA_CONTROLLER_QUORUM_VOTERS: "1@{KAFKA_CONTAINER_NAME}:9093"
              KAFKA_CLUSTER_ID: "5L6g3nShT-eMCtK--X86sw"
              KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: "1"
              KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: "1"
              KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: "1"
              KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: "0"
              KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
            ports:
              - {quote_yaml(f"{config.kafka_port}:{KAFKA_EXTERNAL_PORT}")}
            networks:
              {network_name}:
                aliases:
                  - {KAFKA_CONTAINER_NAME}

          elasticsearch:
            image: elasticsearch:8.10.4
            container_name: {ELASTICSEARCH_CONTAINER_NAME}
            hostname: {ELASTICSEARCH_CONTAINER_NAME}
            restart: unless-stopped
            environment:
              TZ: "Asia/Shanghai"
              discovery.type: "single-node"
              xpack.security.enabled: "false"
              ES_JAVA_OPTS: "-Xms512m -Xmx512m"
            ports:
              - {quote_yaml(f"{config.elasticsearch_port}:{ELASTICSEARCH_INTERNAL_PORT}")}
            volumes:
              - es_data:/usr/share/elasticsearch/data
            networks:
              {network_name}:
                aliases:
                  - {ELASTICSEARCH_CONTAINER_NAME}

        networks:
          {network_name}:
            external: true
            name: {quote_yaml(network_name)}

        volumes:
          mysql_data:
          redis_data:
          nacos_data:
          es_data:
        """
    ).strip() + "\n"


def main() -> None:
    config = load_config()
    docker_cmd = resolve_executable("Docker", ["docker"])
    compose_cmd = resolve_docker_compose_command(docker_cmd)

    ensure_docker_network(docker_cmd, config.global_docker_network)

    middleware_dir = config.middleware_dir
    ensure_directory(middleware_dir)
    compose_path = middleware_dir / "docker-compose.yml"
    compose_content = build_compose_content(config)
    write_text_file(compose_path, compose_content)

    print(f"已生成 compose 文件: {compose_path}")
    print("注意: 当前脚本仅对 MySQL 和 Redis 启用认证，Nacos/Elasticsearch/Kafka 保持无鉴权模式。")

    run_command([*compose_cmd, "up", "-d"], cwd=middleware_dir)

    for container_name in (
        MYSQL_CONTAINER_NAME,
        REDIS_CONTAINER_NAME,
        NACOS_CONTAINER_NAME,
        KAFKA_CONTAINER_NAME,
        ELASTICSEARCH_CONTAINER_NAME,
    ):
        wait_for_container(docker_cmd, container_name, timeout_seconds=240)

    print("中间件部署完成。")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        fatal("操作已取消。")
