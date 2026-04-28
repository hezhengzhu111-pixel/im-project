#!/usr/bin/env python3
from __future__ import annotations

import argparse
from collections.abc import Sequence

from deploy_utils import ensure_docker_environment, resolve_executable, run_command


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Remove all Docker containers and images on this host."
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Required confirmation flag. Without it, no cleanup is performed.",
    )
    parser.add_argument(
        "--volumes",
        action="store_true",
        help="Also prune unused Docker volumes. This can delete database and file data.",
    )
    parser.add_argument(
        "--networks",
        action="store_true",
        help="Also prune unused Docker networks.",
    )
    parser.add_argument(
        "--builder-cache",
        action="store_true",
        help="Also prune Docker build cache.",
    )
    return parser


def docker_ids(docker_cmd: str, args: Sequence[str]) -> list[str]:
    result = run_command([docker_cmd, *args], capture_output=True, check=False)
    if result.returncode != 0:
        return []
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def run_batched(docker_cmd: str, args: Sequence[str], ids: Sequence[str]) -> None:
    batch_size = 100
    for start in range(0, len(ids), batch_size):
        run_command([docker_cmd, *args, *ids[start : start + batch_size]])


def main() -> None:
    args = build_parser().parse_args()
    if not args.yes:
        raise SystemExit("Refusing to clean Docker without --yes.")

    ensure_docker_environment()
    docker_cmd = resolve_executable("Docker", ["docker"])

    containers = docker_ids(docker_cmd, ["ps", "-aq"])
    if containers:
        run_batched(docker_cmd, ["rm", "-f"], containers)
    else:
        print("No Docker containers to remove.")

    images = docker_ids(docker_cmd, ["images", "-aq"])
    if images:
        run_batched(docker_cmd, ["rmi", "-f"], images)
    else:
        print("No Docker images to remove.")

    if args.volumes:
        run_command([docker_cmd, "volume", "prune", "-f"])
    if args.networks:
        run_command([docker_cmd, "network", "prune", "-f"])
    if args.builder_cache:
        run_command([docker_cmd, "builder", "prune", "-af"])

    print("Docker cleanup complete.")


if __name__ == "__main__":
    main()
