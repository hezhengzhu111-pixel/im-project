from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

import yaml

PROFILES_DIR = Path(__file__).resolve().parent.parent / "deploy" / "profiles"


@dataclass
class ProfileConfig:
    """Profile-based deployment configuration."""

    profile: str = "local"

    # Services
    default_services: List[str] = field(default_factory=lambda: ["mysql8", "redis", "im-gateway", "im-service", "im-web"])
    include_ai: bool = False

    # Build
    docker_build: bool = False
    docker_pull: bool = False
    parallel_build: bool = True
    build_profile: str = "debug"

    # Database
    auto_init_db: bool = True
    auto_migrate: bool = True

    # Health checks
    health_timeout: int = 180
    wait_for_ready: bool = True

    # Logging
    verbose: bool = False
    debug: bool = False

    # Reports
    generate_reports: bool = False


def load_profile(profile_name: str) -> ProfileConfig:
    """Load a profile configuration from YAML file."""
    profile_path = PROFILES_DIR / f"{profile_name}.yml"

    if not profile_path.exists():
        raise ValueError(f"Profile '{profile_name}' not found at {profile_path}")

    with open(profile_path, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f)

    config = ProfileConfig(profile=profile_name)

    # Load services
    services = data.get('services', {})
    if 'default' in services:
        config.default_services = services['default']
    config.include_ai = services.get('include_ai', False)

    # Load build settings
    build = data.get('build', {})
    config.docker_build = build.get('docker', False)
    config.docker_pull = build.get('pull', False)
    config.parallel_build = build.get('parallel', True)
    config.build_profile = build.get('profile', 'debug')

    # Load database settings
    db = data.get('database', {})
    config.auto_init_db = db.get('auto_init', True)
    config.auto_migrate = db.get('auto_migrate', True)

    # Load health settings
    health = data.get('health', {})
    config.health_timeout = health.get('timeout', 180)
    config.wait_for_ready = health.get('wait', True)

    # Load logging settings
    logging = data.get('logging', {})
    config.verbose = logging.get('verbose', False)
    config.debug = logging.get('debug', False)

    # Load report settings
    reports = data.get('reports', {})
    config.generate_reports = reports.get('generate', False)

    return config


def get_available_profiles() -> List[str]:
    """List all available profiles."""
    if not PROFILES_DIR.exists():
        return []

    profiles = []
    for profile_file in PROFILES_DIR.glob("*.yml"):
        profiles.append(profile_file.stem)

    return sorted(profiles)
