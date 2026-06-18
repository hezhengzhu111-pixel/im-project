from __future__ import annotations

import sys


def run_imctl(argv: list[str]) -> None:
    from .cli import main

    main(argv)


def legacy_start(argv: list[str]) -> None:
    mapping = {
        "start": "up",
        "stop": "down",
        "restart": "restart",
        "status": "status",
        "logs": "logs",
    }
    if not argv:
        run_imctl(["status"])
        return
    command = argv[0]
    run_imctl([mapping.get(command, command), *argv[1:]])


def legacy_init(argv: list[str]) -> None:
    if "--check-only" in argv:
        filtered = [arg for arg in argv if arg != "--check-only"]
        run_imctl(["doctor", *filtered])
        return
    if "--runtime-only" in argv:
        filtered = [arg for arg in argv if arg != "--runtime-only"]
        run_imctl(["runtime", "ensure", *filtered])
        return
    if "--middleware-only" in argv:
        filtered = [arg for arg in argv if arg != "--middleware-only"]
        run_imctl(["middleware", "up", *filtered])
        return
    if "--db-only" in argv:
        filtered = [arg for arg in argv if arg != "--db-only"]
        run_imctl(["db", "ensure", *filtered])
        return
    if "--clean-runtime" in argv:
        filtered = [arg for arg in argv if arg != "--clean-runtime"]
        run_imctl(["clean", "runtime", *filtered])
        return
    run_imctl(["init", *argv])


def legacy_init_db(argv: list[str]) -> None:
    filtered = list(argv)
    full = False
    if "--full" in filtered:
        filtered.remove("--full")
        full = True
    if filtered and filtered[0] == "full":
        filtered = filtered[1:]
        full = True
    elif filtered and filtered[0] == "check":
        filtered = filtered[1:]
    run_imctl(["db", "reset" if full else "check", *filtered])


def legacy_middleware(argv: list[str]) -> None:
    filtered = list(argv)
    if "--status-only" in filtered:
        filtered.remove("--status-only")
        run_imctl(["middleware", "status", *filtered])
        return
    run_imctl(["middleware", "up", *filtered])


def legacy_services(argv: list[str]) -> None:
    filtered: list[str] = []
    skip_next = False
    for index, arg in enumerate(argv):
        if skip_next:
            skip_next = False
            continue
        if arg == "--no-build":
            continue
        if arg == "--no-deps":
            continue
        if arg == "--with-deps":
            filtered.append("--with-deps")
            continue
        if arg == "--skip-middleware-check":
            filtered.append("--skip-middleware")
            continue
        filtered.append(arg)
    run_imctl(["up", *filtered])
