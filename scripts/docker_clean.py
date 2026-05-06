#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence

from deploy_utils import ensure_docker_environment, fatal, resolve_executable, run_command


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Remove one Docker container/image, or fully reset local Docker data."
    )
    parser.add_argument(
        "target",
        nargs="?",
        help="Container name/id, image id/tag, or 'full'.",
    )
    parser.add_argument(
        "--target",
        dest="target_option",
        help="Container name/id, image id/tag, or 'full'.",
    )
    parser.add_argument("--container", help="Remove a specific container by name or id.")
    parser.add_argument("--image", help="Remove a specific image by id or tag.")
    parser.add_argument("--full", action="store_true", help="Remove containers, images, volumes, networks, and build cache.")
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Confirm destructive cleanup. Required for --full/full.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the Docker commands that would be executed.",
    )
    return parser


def parse_args() -> argparse.Namespace:
    parser = build_parser()
    args, unknown = parser.parse_known_args()
    implicit_targets: list[str] = []
    for item in unknown:
        if item.startswith("--") and len(item) > 2:
            implicit_targets.append(item[2:])
            continue
        parser.error(f"unrecognized argument: {item}")
    selected_targets = [
        value
        for value in [
            args.target,
            args.target_option,
            args.container,
            args.image,
            "full" if args.full else None,
            *implicit_targets,
        ]
        if value
    ]
    if len(selected_targets) != 1:
        parser.error("choose exactly one target: container/image id/name, --container, --image, or --full")
    args.resolved_target = selected_targets[0]
    return args


def docker_ids(docker_cmd: str, args: Sequence[str]) -> list[str]:
    result = run_command([docker_cmd, *args], capture_output=True, check=False)
    if result.returncode != 0:
        return []
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def run_docker(docker_cmd: str, args: Sequence[str], *, dry_run: bool = False) -> None:
    command = [docker_cmd, *args]
    if dry_run:
        print("$ " + " ".join(command))
        return
    run_command(command)


def run_batched(
    docker_cmd: str,
    args: Sequence[str],
    ids: Sequence[str],
    *,
    dry_run: bool = False,
) -> None:
    batch_size = 100
    for start in range(0, len(ids), batch_size):
        run_docker(docker_cmd, [*args, *ids[start : start + batch_size]], dry_run=dry_run)


def docker_object_exists(docker_cmd: str, object_type: str, target: str) -> bool:
    result = run_command(
        [docker_cmd, object_type, "inspect", target],
        capture_output=True,
        check=False,
    )
    return result.returncode == 0


def clean_full(docker_cmd: str, *, dry_run: bool) -> None:
    if dry_run:
        print(f"$ {docker_cmd} ps -aq")
        print(f"$ {docker_cmd} rm -f <all-containers>")
        print(f"$ {docker_cmd} images -aq")
        print(f"$ {docker_cmd} rmi -f <all-images>")
        print(f"$ {docker_cmd} volume ls -q")
        print(f"$ {docker_cmd} volume rm -f <all-volumes>")
        print(f"$ {docker_cmd} volume prune -f")
        print(f"$ {docker_cmd} network prune -f")
        print(f"$ {docker_cmd} builder prune -af")
        print("Docker full reset dry-run complete.")
        return

    containers = docker_ids(docker_cmd, ["ps", "-aq"])
    if containers:
        run_batched(docker_cmd, ["rm", "-f"], containers, dry_run=dry_run)
    else:
        print("No Docker containers to remove.")

    images = docker_ids(docker_cmd, ["images", "-aq"])
    if images:
        run_batched(docker_cmd, ["rmi", "-f"], images, dry_run=dry_run)
    else:
        print("No Docker images to remove.")

    volumes = docker_ids(docker_cmd, ["volume", "ls", "-q"])
    if volumes:
        run_batched(docker_cmd, ["volume", "rm", "-f"], volumes, dry_run=dry_run)
    else:
        print("No Docker volumes to remove.")

    run_docker(docker_cmd, ["volume", "prune", "-f"], dry_run=dry_run)
    run_docker(docker_cmd, ["network", "prune", "-f"], dry_run=dry_run)
    run_docker(docker_cmd, ["builder", "prune", "-af"], dry_run=dry_run)
    print("Docker full reset complete.")


def clean_target(docker_cmd: str, args: argparse.Namespace) -> None:
    target = args.resolved_target
    if args.container:
        run_docker(docker_cmd, ["rm", "-f", target], dry_run=args.dry_run)
        print(f"Container removal {'dry-run' if args.dry_run else 'complete'}: {target}")
        return
    if args.image:
        run_docker(docker_cmd, ["rmi", "-f", target], dry_run=args.dry_run)
        print(f"Image removal {'dry-run' if args.dry_run else 'complete'}: {target}")
        return
    if args.dry_run:
        print(f"$ {docker_cmd} container inspect {target}")
        print(f"$ {docker_cmd} rm -f {target}  # if target is a container")
        print(f"$ {docker_cmd} image inspect {target}")
        print(f"$ {docker_cmd} rmi -f {target}  # if target is an image")
        return

    if docker_object_exists(docker_cmd, "container", target):
        run_docker(docker_cmd, ["rm", "-f", target], dry_run=args.dry_run)
        print(f"Container removed: {target}")
        return
    if docker_object_exists(docker_cmd, "image", target):
        run_docker(docker_cmd, ["rmi", "-f", target], dry_run=args.dry_run)
        print(f"Image removed: {target}")
        return
    fatal(f"Docker container or image not found: {target}")


def main() -> None:
    args = parse_args()
    target = str(args.resolved_target).strip()
    if not target:
        raise SystemExit("Target is empty.")

    if args.dry_run:
        docker_cmd = resolve_executable("Docker", ["docker"])
    else:
        ensure_docker_environment()
        docker_cmd = resolve_executable("Docker", ["docker"])

    if target.lower() == "full":
        if not args.yes and not args.dry_run:
            print("Refusing full Docker reset without --yes.", file=sys.stderr)
            raise SystemExit(1)
        clean_full(docker_cmd, dry_run=args.dry_run)
        return
    clean_target(docker_cmd, args)


if __name__ == "__main__":
    main()
