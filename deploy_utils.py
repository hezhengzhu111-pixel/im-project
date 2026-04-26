from __future__ import annotations

import json
import os
import platform
import re
import shlex
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import IO, Any, Mapping, NoReturn, Optional, Sequence, Union

try:
    from dotenv import load_dotenv as _load_dotenv
except ImportError:
    _load_dotenv = None


def load_dotenv(dotenv_path: Path, override: bool = False) -> None:
    if _load_dotenv is not None:
        _load_dotenv(dotenv_path, override=override)
        return

    with Path(dotenv_path).open("r", encoding="utf-8") as env_stream:
        for raw_line in env_stream:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            if not key or (not override and key in os.environ):
                continue
            value = _strip_env_value(value.strip())
            os.environ[key] = value


def _strip_env_value(value: str) -> str:
    if not value:
        return ""
    if (value[0], value[-1:]) in {('"', '"'), ("'", "'")}:
        return value[1:-1]
    if " #" in value:
        value = value.split(" #", 1)[0].rstrip()
    return value

MYSQL_CONTAINER_NAME = "im-mysql"
REDIS_CONTAINER_NAME = "im-redis"
NACOS_CONTAINER_NAME = "im-nacos"
ZOOKEEPER_CONTAINER_NAME = "im-zookeeper"
KAFKA_CONTAINER_NAME = "im-kafka"
ELASTICSEARCH_CONTAINER_NAME = "admin-es"

MYSQL_INTERNAL_PORT = 3306
REDIS_INTERNAL_PORT = 6379
NACOS_INTERNAL_PORT = 8848
ZOOKEEPER_INTERNAL_PORT = 2181
KAFKA_INTERNAL_PORT = 29092
KAFKA_EXTERNAL_PORT = 9092
ELASTICSEARCH_INTERNAL_PORT = 9200

IS_WINDOWS = os.name == "nt"
PROJECT_ROOT = Path(__file__).resolve().parent


def _path_from_env(name: str, default: Path) -> Path:
    return Path(os.getenv(name, str(default))).expanduser()


JAVA_REQUIRED_MAJOR = 21
DEFAULT_TOOLS_ROOT = PROJECT_ROOT / ".deploy-tools" if IS_WINDOWS else Path("/opt")
TOOLS_ROOT = _path_from_env("IM_PROJECT_TOOLS_ROOT", DEFAULT_TOOLS_ROOT)
JAVA_INSTALL_ROOT = _path_from_env(
    "IM_JAVA_INSTALL_ROOT",
    TOOLS_ROOT / "java" if IS_WINDOWS else Path("/opt"),
)
JAVA_HOME_SYMLINK = JAVA_INSTALL_ROOT / "jdk-21"
JAVA_PROFILE_FILE = Path("/etc/profile.d/im-project-java.sh")
JAVA_ARCHIVE_NAMES = {
    ("linux", "x64"): "openjdk-21_linux-x64_bin.tar.gz",
    ("linux", "aarch64"): "openjdk-21_linux-aarch64_bin.tar.gz",
    ("windows", "x64"): "microsoft-jdk-21-windows-x64.zip",
    ("windows", "aarch64"): "microsoft-jdk-21-windows-aarch64.zip",
}
JAVA_DOWNLOAD_URLS = {
    ("linux", "x64"): [
        "https://mirrors.huaweicloud.com/openjdk/21/openjdk-21_linux-x64_bin.tar.gz",
        "https://repo.huaweicloud.com/openjdk/21/openjdk-21_linux-x64_bin.tar.gz",
        "https://aka.ms/download-jdk/microsoft-jdk-21-linux-x64.tar.gz",
    ],
    ("linux", "aarch64"): [
        "https://mirrors.huaweicloud.com/openjdk/21/openjdk-21_linux-aarch64_bin.tar.gz",
        "https://repo.huaweicloud.com/openjdk/21/openjdk-21_linux-aarch64_bin.tar.gz",
        "https://aka.ms/download-jdk/microsoft-jdk-21-linux-aarch64.tar.gz",
    ],
    ("windows", "x64"): [
        "https://aka.ms/download-jdk/microsoft-jdk-21-windows-x64.zip",
        "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk",
    ],
    ("windows", "aarch64"): [
        "https://aka.ms/download-jdk/microsoft-jdk-21-windows-aarch64.zip",
        "https://api.adoptium.net/v3/binary/latest/21/ga/windows/aarch64/jdk/hotspot/normal/eclipse?project=jdk",
    ],
}

MAVEN_VERSION = "3.9.14"
MAVEN_LOCAL_REPOSITORY = _path_from_env(
    "MAVEN_LOCAL_REPOSITORY",
    PROJECT_ROOT / ".maven-repository" if IS_WINDOWS else Path("/home/maven"),
)
MAVEN_SETTINGS_FILE = MAVEN_LOCAL_REPOSITORY / "settings.xml"
MAVEN_INSTALL_ROOT = _path_from_env(
    "IM_MAVEN_INSTALL_ROOT",
    TOOLS_ROOT / "maven" if IS_WINDOWS else Path("/opt"),
)
MAVEN_INSTALL_DIR = MAVEN_INSTALL_ROOT / f"apache-maven-{MAVEN_VERSION}"
MAVEN_SYMLINK = MAVEN_INSTALL_ROOT / "maven"
MAVEN_BIN_SYMLINK = Path("/usr/local/bin/mvn")
MAVEN_ARCHIVE_NAME = f"apache-maven-{MAVEN_VERSION}-bin.tar.gz"
MAVEN_DOWNLOAD_URLS = [
    f"https://mirrors.aliyun.com/apache/maven/maven-3/{MAVEN_VERSION}/binaries/{MAVEN_ARCHIVE_NAME}",
    f"https://repo.huaweicloud.com/apache/maven/maven-3/{MAVEN_VERSION}/binaries/{MAVEN_ARCHIVE_NAME}",
    f"https://mirrors.cloud.tencent.com/apache/maven/maven-3/{MAVEN_VERSION}/binaries/{MAVEN_ARCHIVE_NAME}",
    f"https://mirrors.tuna.tsinghua.edu.cn/apache/maven/maven-3/{MAVEN_VERSION}/binaries/{MAVEN_ARCHIVE_NAME}",
    f"https://downloads.apache.org/maven/maven-3/{MAVEN_VERSION}/binaries/{MAVEN_ARCHIVE_NAME}",
    f"https://dlcdn.apache.org/maven/maven-3/{MAVEN_VERSION}/binaries/{MAVEN_ARCHIVE_NAME}",
    f"https://archive.apache.org/dist/maven/maven-3/{MAVEN_VERSION}/binaries/{MAVEN_ARCHIVE_NAME}",
]


@dataclass(frozen=True)
class DeploymentConfig:
    project_dir: Path
    env_file: Path
    global_docker_network: str
    git_repo_url: str
    git_branch: str
    backend_code_root: Path
    mysql_port: int
    redis_port: int
    nacos_port: int
    kafka_port: int
    elasticsearch_port: int
    mysql_root_password: str
    redis_password: str
    nacos_username: str
    nacos_password: str
    kafka_password: str
    elasticsearch_password: str
    gateway_port: int
    auth_service_port: int
    user_service_port: int
    group_service_port: int
    message_service_port: int
    im_server_port: int
    file_service_port: int
    log_service_port: int
    registry_monitor_port: int
    frontend_port: int
    jwt_secret: str
    auth_refresh_secret: str
    im_internal_secret: str
    im_gateway_auth_secret: str

    @property
    def repo_root(self) -> Path:
        return self.backend_code_root.parent

    @property
    def frontend_root(self) -> Path:
        return self.repo_root / "frontend"

    @property
    def middleware_dir(self) -> Path:
        return self.project_dir / "im-middleware"

    @property
    def sql_init_file(self) -> Path:
        return self.backend_code_root / "sql" / "mysql8" / "init_all.sql"

    @property
    def file_service_volume_name(self) -> str:
        return "im-file-service-data"


def fatal(message: str) -> NoReturn:
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def load_config(base_dir: Optional[Path] = None) -> DeploymentConfig:
    project_dir = (base_dir or Path.cwd()).resolve()
    env_file = project_dir / ".env"
    if not env_file.is_file():
        fatal(
            f"未找到环境文件: {env_file}\n"
            "请先基于 .env.example 创建 .env，并填写所有必需配置。"
        )

    load_dotenv(env_file, override=True)

    return DeploymentConfig(
        project_dir=project_dir,
        env_file=env_file,
        global_docker_network=_get_optional_env("GLOBAL_DOCKER_NETWORK", "im-network"),
        git_repo_url=_get_required_env("GIT_REPO_URL"),
        git_branch=_get_required_env("GIT_BRANCH"),
        backend_code_root=_resolve_path(_get_required_env("BACKEND_CODE_ROOT"), project_dir),
        mysql_port=_get_required_int_env("MYSQL_PORT"),
        redis_port=_get_required_int_env("REDIS_PORT"),
        nacos_port=_get_required_int_env("NACOS_PORT"),
        kafka_port=_get_required_int_env("KAFKA_PORT"),
        elasticsearch_port=_get_required_int_env("ELASTICSEARCH_PORT"),
        mysql_root_password=_get_required_env("MYSQL_ROOT_PASSWORD"),
        redis_password=_get_required_env("REDIS_PASSWORD"),
        nacos_username=_get_required_env("NACOS_USERNAME"),
        nacos_password=_get_required_env("NACOS_PASSWORD"),
        kafka_password=_get_required_env("KAFKA_PASSWORD"),
        elasticsearch_password=_get_required_env("ELASTICSEARCH_PASSWORD"),
        gateway_port=_get_required_int_env("GATEWAY_PORT"),
        auth_service_port=_get_required_int_env("AUTH_SERVICE_PORT"),
        user_service_port=_get_required_int_env("USER_SERVICE_PORT"),
        group_service_port=_get_required_int_env("GROUP_SERVICE_PORT"),
        message_service_port=_get_required_int_env("MESSAGE_SERVICE_PORT"),
        im_server_port=_get_required_int_env("IM_SERVER_PORT"),
        file_service_port=_get_required_int_env("FILE_SERVICE_PORT"),
        log_service_port=_get_required_int_env("LOG_SERVICE_PORT"),
        registry_monitor_port=_get_required_int_env("REGISTRY_MONITOR_PORT"),
        frontend_port=_get_required_int_env("FRONTEND_PORT"),
        jwt_secret=_get_required_env("JWT_SECRET"),
        auth_refresh_secret=_get_required_env("AUTH_REFRESH_SECRET"),
        im_internal_secret=_get_required_env("IM_INTERNAL_SECRET"),
        im_gateway_auth_secret=_get_required_env("IM_GATEWAY_AUTH_SECRET"),
    )


def _get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        fatal(f".env 中缺少必填项或值为空: {name}")
    return value


def _get_optional_env(name: str, default: str) -> str:
    value = os.getenv(name, "").strip()
    return value or default


def _get_required_int_env(name: str) -> int:
    raw_value = _get_required_env(name)
    try:
        value = int(raw_value)
    except ValueError as exc:
        fatal(f".env 中的 {name} 必须是整数，当前值: {raw_value}")
        raise exc

    if value <= 0 or value > 65535:
        fatal(f".env 中的 {name} 超出有效端口范围: {value}")
    return value


def _resolve_path(raw_path: str, base_dir: Path) -> Path:
    path = Path(raw_path)
    if not path.is_absolute():
        path = (base_dir / path).resolve()
    else:
        path = path.resolve()
    return path


def resolve_executable(display_name: str, candidates: Sequence[str]) -> str:
    for candidate in candidates:
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    fatal(f"未找到 {display_name} 命令，请确认它已经安装并且在 PATH 中可用。")


def ensure_maven_ready() -> str:
    ensure_java_ready()

    mvn_cmd = shutil.which("mvn") or shutil.which("mvn.cmd")
    if mvn_cmd:
        print(f"Maven 已存在: {mvn_cmd}")
    else:
        print("未检测到 Maven，开始自动安装 Maven。")
        mvn_cmd = install_maven()

    ensure_maven_settings()
    run_command([mvn_cmd, "-s", MAVEN_SETTINGS_FILE, "-v"])
    return mvn_cmd


def ensure_java_ready() -> None:
    java_home = find_usable_java_home()
    if java_home:
        configure_java_home(java_home)
        print(f"JDK {JAVA_REQUIRED_MAJOR}+ 已存在: {java_home}")
        return

    print(f"未检测到可用 JDK {JAVA_REQUIRED_MAJOR}+，开始自动安装 Java 环境。")
    java_home = install_java()
    configure_java_home(java_home)
    verify_java_home(java_home)


def find_usable_java_home() -> Optional[Path]:
    java_home_env = os.getenv("JAVA_HOME", "").strip()
    if java_home_env:
        java_home = Path(java_home_env)
        if is_usable_java_home(java_home):
            return java_home

    candidates = [JAVA_HOME_SYMLINK]
    for binary_name in ("javac", "java"):
        binary_path = shutil.which(binary_name)
        if not binary_path:
            continue
        inferred_home = infer_java_home_from_binary(Path(binary_path))
        if inferred_home:
            candidates.append(inferred_home)
    candidates.extend(find_common_java_homes())

    seen: set[Path] = set()
    for candidate in candidates:
        candidate = candidate.resolve()
        if candidate in seen:
            continue
        seen.add(candidate)
        if is_usable_java_home(candidate):
            return candidate
    return None


def infer_java_home_from_binary(binary_path: Path) -> Optional[Path]:
    resolved = binary_path.resolve()
    if resolved.parent.name != "bin":
        return None
    return resolved.parent.parent


def find_common_java_homes() -> list[Path]:
    candidates: list[Path] = []
    if IS_WINDOWS:
        roots = [
            Path(os.getenv("ProgramFiles", r"C:\Program Files")) / "Microsoft",
            Path(os.getenv("ProgramFiles", r"C:\Program Files")) / "Eclipse Adoptium",
            Path(os.getenv("ProgramFiles", r"C:\Program Files")) / "Java",
            Path(os.getenv("ProgramFiles(x86)", r"C:\Program Files (x86)")) / "Microsoft",
            Path(os.getenv("LOCALAPPDATA", "")) / "Programs" / "Eclipse Adoptium",
            JAVA_INSTALL_ROOT,
        ]
    else:
        roots = [
            JAVA_INSTALL_ROOT,
            Path("/usr/lib/jvm"),
            Path("/usr/java"),
        ]

    for root in roots:
        if not root or not root.is_dir():
            continue
        for child in root.iterdir():
            if not child.is_dir():
                continue
            name = child.name.lower()
            if "jdk" in name or "java-21" in name or "openjdk-21" in name:
                candidates.append(child)
    return candidates


def java_bin(java_home: Path, name: str) -> Path:
    executable = f"{name}.exe" if IS_WINDOWS else name
    return java_home / "bin" / executable


def is_usable_java_home(java_home: Path) -> bool:
    java_cmd = java_bin(java_home, "java")
    javac_cmd = java_bin(java_home, "javac")
    if not java_cmd.is_file() or not javac_cmd.is_file():
        return False
    return get_java_major_version(java_cmd) >= JAVA_REQUIRED_MAJOR


def get_java_major_version(java_cmd: Path) -> int:
    result = run_command([java_cmd, "-version"], capture_output=True, check=False)
    output = f"{result.stdout}\n{result.stderr}"
    match = re.search(r'version "(\d+)(?:\.(\d+))?', output)
    if not match:
        return 0
    major = int(match.group(1))
    if major == 1 and match.group(2):
        return int(match.group(2))
    return major


def install_java() -> Path:
    if IS_WINDOWS:
        if install_java_with_windows_package_manager():
            java_home = find_usable_java_home()
            if java_home:
                return java_home
            print("Windows 包管理器安装完成，但仍未找到可用 JDK，继续使用压缩包方式安装。")
        return install_java_from_archive()

    if os.name != "posix":
        fatal(f"当前系统未检测到 JDK {JAVA_REQUIRED_MAJOR}+，自动安装仅支持 Linux/macOS，请手动安装后重试。")

    if install_java_with_package_manager():
        java_home = find_usable_java_home()
        if java_home:
            return java_home
        print("系统包管理器安装完成，但仍未找到可用 JDK，继续使用压缩包方式安装。")

    return install_java_from_archive()


def install_java_with_windows_package_manager() -> bool:
    package_manager_commands = [
        (
            "winget",
            [
                [
                    "winget",
                    "install",
                    "--id",
                    "Microsoft.OpenJDK.21",
                    "-e",
                    "--accept-package-agreements",
                    "--accept-source-agreements",
                    "--silent",
                ]
            ],
        ),
        ("choco", [["choco", "install", "-y", "microsoft-openjdk21"]]),
        ("scoop", [["scoop", "install", "java/microsoft21-jdk"]]),
    ]

    for executable, commands in package_manager_commands:
        if not shutil.which(executable):
            continue

        print(f"检测到 Windows 包管理器 {executable}，尝试自动安装 JDK {JAVA_REQUIRED_MAJOR}。")
        succeeded = True
        for command in commands:
            result = run_command(command, check=False)
            if result.returncode != 0:
                succeeded = False
                break
        if succeeded:
            return True

        print(f"通过 {executable} 安装 JDK 失败，尝试下一种安装方式。")

    print("未检测到可用 Windows 包管理器，或包管理器安装均失败，改用压缩包方式安装 JDK。")
    return False


def install_java_with_package_manager() -> bool:
    package_manager_commands = [
        ("apt-get", [["apt-get", "update"], ["apt-get", "install", "-y", "openjdk-21-jdk"]]),
        ("dnf", [["dnf", "install", "-y", "java-21-openjdk-devel"]]),
        ("yum", [["yum", "install", "-y", "java-21-openjdk-devel"]]),
        ("apk", [["apk", "add", "--no-cache", "openjdk21"]]),
    ]

    for executable, commands in package_manager_commands:
        if not shutil.which(executable):
            continue

        print(f"检测到包管理器 {executable}，尝试自动安装 JDK {JAVA_REQUIRED_MAJOR}。")
        succeeded = True
        for command in commands:
            result = run_privileged_command(command, check=False)
            if result.returncode != 0:
                succeeded = False
                break
        if succeeded:
            return True

        print(f"通过 {executable} 安装 JDK 失败，尝试下一种安装方式。")
        continue

    print("未检测到可用包管理器，或包管理器安装均失败，改用压缩包方式安装 JDK。")
    return False


def install_java_from_archive() -> Path:
    java_platform = resolve_java_platform()
    java_arch = resolve_java_architecture()
    archive_key = (java_platform, java_arch)
    archive_name = JAVA_ARCHIVE_NAMES.get(archive_key)
    download_urls = JAVA_DOWNLOAD_URLS.get(archive_key)
    if not archive_name or not download_urls:
        fatal(f"当前系统暂不支持自动安装 JDK: {platform.system()} {platform.machine()}")

    archive_path = Path(tempfile.gettempdir()) / archive_name
    downloader = resolve_downloader()

    for download_url in download_urls:
        print(f"开始下载 JDK {JAVA_REQUIRED_MAJOR}: {download_url}")
        if download_archive(downloader, download_url, archive_path):
            break
        print("当前 JDK 下载地址不可用，尝试下一个镜像。")
    else:
        fatal("所有 JDK 下载地址均不可用，请检查服务器网络或稍后重试。")

    extracted_dir_name = get_archive_top_level_dir(archive_path)
    if not extracted_dir_name:
        fatal(f"无法识别 JDK 压缩包顶层目录: {archive_path}")

    extracted_home = JAVA_INSTALL_ROOT / extracted_dir_name
    if IS_WINDOWS:
        ensure_directory(JAVA_INSTALL_ROOT)
        shutil.unpack_archive(str(archive_path), str(JAVA_INSTALL_ROOT))
        return extracted_home

    run_privileged_command(["mkdir", "-p", str(JAVA_INSTALL_ROOT)])
    run_privileged_command(["tar", "-xzf", str(archive_path), "-C", str(JAVA_INSTALL_ROOT)])
    run_privileged_command(["ln", "-sfn", str(extracted_home), str(JAVA_HOME_SYMLINK)])
    return JAVA_HOME_SYMLINK


def resolve_java_platform() -> str:
    system_name = platform.system().lower()
    if system_name == "windows":
        return "windows"
    if system_name == "linux":
        return "linux"
    fatal(f"当前系统暂不支持自动安装 JDK: {platform.system()}")


def resolve_java_architecture() -> str:
    machine = platform.machine().lower()
    if machine in {"x86_64", "amd64"}:
        return "x64"
    if machine in {"aarch64", "arm64"}:
        return "aarch64"
    fatal(f"当前 CPU 架构暂不支持自动安装 JDK: {platform.machine()}")


def get_archive_top_level_dir(archive_path: Path) -> Optional[str]:
    if archive_path.suffix.lower() == ".zip":
        with zipfile.ZipFile(archive_path) as archive:
            for member_name in archive.namelist():
                parts = Path(member_name).parts
                if parts:
                    return parts[0]
        return None

    with tarfile.open(archive_path, "r:gz") as archive:
        for member in archive:
            parts = Path(member.name).parts
            if parts:
                return parts[0]
    return None


def configure_java_home(java_home: Path) -> None:
    java_home_text = str(java_home)
    java_bin = str(java_home / "bin")
    os.environ["JAVA_HOME"] = java_home_text
    path_parts = os.environ.get("PATH", "").split(os.pathsep)
    if java_bin not in path_parts:
        os.environ["PATH"] = os.pathsep.join([java_bin] + path_parts)

    if IS_WINDOWS:
        persist_windows_java_home(java_home_text)
        return

    profile_content = (
        f"export JAVA_HOME={shlex.quote(java_home_text)}\n"
        "export PATH=\"$JAVA_HOME/bin:$PATH\"\n"
    )
    try:
        write_text_file(JAVA_PROFILE_FILE, profile_content)
    except PermissionError:
        print(f"警告: 无法写入 {JAVA_PROFILE_FILE}，当前部署进程已设置 JAVA_HOME，但重新登录后可能需要手动配置。")


def persist_windows_java_home(java_home_text: str) -> None:
    setx_cmd = shutil.which("setx")
    if not setx_cmd:
        print("警告: 当前进程已设置 JAVA_HOME，但未找到 setx，无法持久写入 Windows 用户环境变量。")
        return

    result = run_command([setx_cmd, "JAVA_HOME", java_home_text], capture_output=True, check=False)
    if result.returncode != 0:
        print("警告: 当前进程已设置 JAVA_HOME，但写入 Windows 用户环境变量失败。")


def verify_java_home(java_home: Path) -> None:
    if not is_usable_java_home(java_home):
        fatal(f"JDK 安装完成但校验失败，请检查 JAVA_HOME={java_home}")
    run_command([java_bin(java_home, "java"), "-version"])
    run_command([java_bin(java_home, "javac"), "-version"])


def install_maven() -> str:
    if IS_WINDOWS:
        if install_maven_with_windows_package_manager():
            mvn_cmd = shutil.which("mvn") or shutil.which("mvn.cmd")
            if mvn_cmd:
                return mvn_cmd
            print("Windows 包管理器安装完成，但 PATH 中仍未找到 mvn，继续使用压缩包方式安装。")
        return install_maven_from_archive()

    if os.name != "posix":
        fatal("当前系统未检测到 Maven，自动安装仅支持 Linux/macOS，请手动安装 Maven 后重试。")

    if install_maven_with_package_manager():
        mvn_cmd = shutil.which("mvn")
        if mvn_cmd:
            return mvn_cmd
        print("系统包管理器安装完成，但 PATH 中仍未找到 mvn，继续使用压缩包方式安装。")

    return install_maven_from_archive()


def install_maven_with_windows_package_manager() -> bool:
    package_manager_commands = [
        (
            "winget",
            [
                [
                    "winget",
                    "install",
                    "--id",
                    "Apache.Maven",
                    "-e",
                    "--accept-package-agreements",
                    "--accept-source-agreements",
                    "--silent",
                ]
            ],
        ),
        ("choco", [["choco", "install", "-y", "maven"]]),
        ("scoop", [["scoop", "install", "maven"]]),
    ]

    for executable, commands in package_manager_commands:
        if not shutil.which(executable):
            continue

        print(f"检测到 Windows 包管理器 {executable}，尝试自动安装 Maven。")
        succeeded = True
        for command in commands:
            result = run_command(command, check=False)
            if result.returncode != 0:
                succeeded = False
                break
        if succeeded:
            return True

        print(f"通过 {executable} 安装 Maven 失败，尝试下一种安装方式。")

    print("未检测到可用 Windows 包管理器，或包管理器安装均失败，改用压缩包方式安装 Maven。")
    return False


def install_maven_with_package_manager() -> bool:
    package_manager_commands = [
        ("apt-get", [["apt-get", "update"], ["apt-get", "install", "-y", "maven"]]),
        ("dnf", [["dnf", "install", "-y", "maven"]]),
        ("yum", [["yum", "install", "-y", "maven"]]),
        ("apk", [["apk", "add", "--no-cache", "maven"]]),
    ]

    for executable, commands in package_manager_commands:
        if not shutil.which(executable):
            continue

        print(f"检测到包管理器 {executable}，尝试自动安装 Maven。")
        succeeded = True
        for command in commands:
            result = run_privileged_command(command, check=False)
            if result.returncode != 0:
                succeeded = False
                break
        if succeeded:
            return True

        print(f"通过 {executable} 安装 Maven 失败，尝试下一种安装方式。")
        continue

    print("未检测到可用包管理器，或包管理器安装均失败，改用压缩包方式安装 Maven。")
    return False


def install_maven_from_archive() -> str:
    archive_path = Path(tempfile.gettempdir()) / MAVEN_ARCHIVE_NAME
    downloader = resolve_downloader()
    for download_url in MAVEN_DOWNLOAD_URLS:
        print(f"开始下载 Maven {MAVEN_VERSION}: {download_url}")
        if download_archive(downloader, download_url, archive_path):
            break
        print("当前 Maven 下载地址不可用，尝试下一个镜像。")
    else:
        fatal("所有 Maven 下载地址均不可用，请检查服务器网络或稍后重试。")

    if IS_WINDOWS:
        ensure_directory(MAVEN_INSTALL_ROOT)
        shutil.unpack_archive(str(archive_path), str(MAVEN_INSTALL_ROOT))
        mvn_cmd = str(MAVEN_INSTALL_DIR / "bin" / "mvn.cmd")
    else:
        run_privileged_command(["mkdir", "-p", str(MAVEN_INSTALL_ROOT)])
        run_privileged_command(["mkdir", "-p", str(MAVEN_BIN_SYMLINK.parent)])
        run_privileged_command(["tar", "-xzf", str(archive_path), "-C", str(MAVEN_INSTALL_ROOT)])
        run_privileged_command(["ln", "-sfn", str(MAVEN_INSTALL_DIR), str(MAVEN_SYMLINK)])
        run_privileged_command(["ln", "-sfn", str(MAVEN_SYMLINK / "bin" / "mvn"), str(MAVEN_BIN_SYMLINK)])
        mvn_cmd = shutil.which("mvn") or str(MAVEN_SYMLINK / "bin" / "mvn")
    if not Path(mvn_cmd).exists() and not shutil.which(mvn_cmd):
        fatal("Maven 压缩包安装完成后仍未找到 mvn 命令，请检查 /opt/maven/bin/mvn。")
    return mvn_cmd


def download_archive(downloader: str, download_url: str, archive_path: Path) -> bool:
    if archive_path.exists():
        archive_path.unlink()

    if downloader == "curl":
        command = ["curl", "-fL", download_url, "-o", archive_path]
    elif downloader == "wget":
        command = ["wget", "-O", archive_path, download_url]
    else:
        try:
            urllib.request.urlretrieve(download_url, str(archive_path))
        except Exception:
            if archive_path.exists():
                archive_path.unlink()
            return False
        return archive_path.is_file() and archive_path.stat().st_size > 0

    result = run_command(command, check=False)
    if result.returncode == 0 and archive_path.is_file() and archive_path.stat().st_size > 0:
        return True

    if archive_path.exists():
        archive_path.unlink()
    return False


def resolve_downloader() -> str:
    if shutil.which("curl"):
        return "curl"
    if shutil.which("wget"):
        return "wget"
    return "python"


def run_privileged_command(command: Sequence[str], *, check: bool = True) -> subprocess.CompletedProcess[Any]:
    if os.name == "posix" and hasattr(os, "geteuid") and os.geteuid() != 0:
        sudo_cmd = shutil.which("sudo")
        if not sudo_cmd:
            fatal("自动安装 Maven 需要 root 权限，当前用户不是 root，且未找到 sudo。")
        command = [sudo_cmd] + list(command)
    return run_command(command, check=check)


def ensure_maven_settings() -> None:
    settings_content = build_maven_settings_xml(MAVEN_LOCAL_REPOSITORY)
    try:
        write_text_file(MAVEN_SETTINGS_FILE, settings_content)
    except PermissionError:
        fatal(f"无法写入 Maven 配置目录 {MAVEN_LOCAL_REPOSITORY}，请使用 root 用户或授予写入权限。")

    print(f"Maven 国内源配置已生成: {MAVEN_SETTINGS_FILE}")
    print(f"Maven 本地仓库目录: {MAVEN_LOCAL_REPOSITORY}")


def build_maven_settings_xml(local_repository: Path) -> str:
    local_repository_text = str(local_repository)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<settings xmlns="http://maven.apache.org/SETTINGS/1.2.0"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.2.0 https://maven.apache.org/xsd/settings-1.2.0.xsd">
  <localRepository>{local_repository_text}</localRepository>

  <mirrors>
    <mirror>
      <id>aliyunmaven</id>
      <name>Aliyun Maven Repository</name>
      <url>https://maven.aliyun.com/repository/public</url>
      <mirrorOf>*</mirrorOf>
    </mirror>
  </mirrors>

  <profiles>
    <profile>
      <id>aliyun-public</id>
      <repositories>
        <repository>
          <id>aliyun-public</id>
          <url>https://maven.aliyun.com/repository/public</url>
          <releases>
            <enabled>true</enabled>
          </releases>
          <snapshots>
            <enabled>true</enabled>
          </snapshots>
        </repository>
      </repositories>
      <pluginRepositories>
        <pluginRepository>
          <id>aliyun-public</id>
          <url>https://maven.aliyun.com/repository/public</url>
          <releases>
            <enabled>true</enabled>
          </releases>
          <snapshots>
            <enabled>true</enabled>
          </snapshots>
        </pluginRepository>
      </pluginRepositories>
    </profile>
  </profiles>

  <activeProfiles>
    <activeProfile>aliyun-public</activeProfile>
  </activeProfiles>
</settings>
"""


def resolve_docker_compose_command(docker_cmd: str) -> list[str]:
    docker_compose_check = subprocess.run(
        [docker_cmd, "compose", "version"],
        capture_output=True,
        text=True,
        check=False,
    )
    if docker_compose_check.returncode == 0:
        return [docker_cmd, "compose"]

    if shutil.which("docker-compose"):
        docker_compose_binary_check = subprocess.run(
            ["docker-compose", "version"],
            capture_output=True,
            text=True,
            check=False,
        )
        if docker_compose_binary_check.returncode == 0:
            return ["docker-compose"]

    fatal("未找到可用的 docker compose 命令，请安装 Docker Compose 插件或 docker-compose。")


def run_command(
    command: Sequence[Union[str, Path]],
    *,
    cwd: Optional[Path] = None,
    env: Optional[Mapping[str, str]] = None,
    capture_output: bool = False,
    stdin: Optional[IO[Any]] = None,
    check: bool = True,
) -> subprocess.CompletedProcess[Any]:
    command_parts = [str(part) for part in command]
    printable_command = " ".join(shlex.quote(part) for part in command_parts)
    if cwd is not None:
        print(f"\n>>> {printable_command}    [cwd={cwd}]")
    else:
        print(f"\n>>> {printable_command}")

    completed = subprocess.run(
        command_parts,
        cwd=str(cwd) if cwd else None,
        env={**os.environ, **env} if env else None,
        stdin=stdin,
        capture_output=capture_output,
        text=capture_output,
        check=False,
    )

    if check and completed.returncode != 0:
        if capture_output:
            if completed.stdout:
                print(completed.stdout, file=sys.stderr)
            if completed.stderr:
                print(completed.stderr, file=sys.stderr)
        fatal(f"命令执行失败，退出码 {completed.returncode}: {printable_command}")

    return completed


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_text_file(path: Path, content: str) -> None:
    ensure_directory(path.parent)
    path.write_text(content, encoding="utf-8")


def ensure_backend_layout(config: DeploymentConfig) -> None:
    pom_file = config.backend_code_root / "pom.xml"
    if not pom_file.is_file():
        fatal(
            "后端代码根路径无效，未找到 backend/pom.xml。\n"
            f"BACKEND_CODE_ROOT={config.backend_code_root}"
        )


def ensure_frontend_layout(config: DeploymentConfig) -> None:
    package_json = config.frontend_root / "package.json"
    dockerfile = config.frontend_root / "Dockerfile"
    nginx_conf = config.frontend_root / "nginx.conf"
    missing_files = [
        str(path) for path in (package_json, dockerfile, nginx_conf) if not path.is_file()
    ]
    if missing_files:
        fatal(f"前端目录结构不完整，缺少文件: {', '.join(missing_files)}")


def ensure_docker_network(docker_cmd: str, network_name: str) -> None:
    network_details = get_docker_network_details(docker_cmd, network_name)
    if network_details:
        validate_docker_network_attachable(network_name, network_details)
        print(f"Docker 网络已存在: {network_name}")
        return

    run_command([docker_cmd, "network", "create", "--driver", "bridge", network_name])
    print(f"Docker 网络已创建: {network_name}")


def docker_network_exists(docker_cmd: str, network_name: str) -> bool:
    return get_docker_network_details(docker_cmd, network_name) is not None


def get_docker_network_details(docker_cmd: str, network_name: str) -> Optional[dict[str, Any]]:
    completed = run_command(
        [docker_cmd, "network", "inspect", network_name, "--format", "{{json .}}"],
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        return None
    try:
        return json.loads(completed.stdout.strip())
    except json.JSONDecodeError:
        fatal(f"Docker 网络信息解析失败: {network_name}")


def validate_docker_network_attachable(network_name: str, details: dict[str, Any]) -> None:
    driver = str(details.get("Driver") or "")
    scope = str(details.get("Scope") or "")
    attachable = bool(details.get("Attachable"))
    if driver == "overlay" and scope == "swarm" and not attachable:
        containers = details.get("Containers") or {}
        container_names = [
            str(item.get("Name") or container_id)
            for container_id, item in containers.items()
            if isinstance(item, dict)
        ]
        occupied = f"\n当前网络内已有容器: {', '.join(container_names)}" if container_names else ""
        fatal(
            f"Docker 网络 {network_name} 是非 attachable 的 swarm/overlay 网络，"
            "普通 docker compose 容器无法加入该网络。"
            f"{occupied}\n"
            "请先删除或重建该网络，例如:\n"
            f"  docker network rm {network_name}\n"
            f"  docker network create --driver bridge {network_name}"
        )


def docker_volume_exists(docker_cmd: str, volume_name: str) -> bool:
    completed = run_command(
        [docker_cmd, "volume", "inspect", volume_name],
        capture_output=True,
        check=False,
    )
    return completed.returncode == 0


def ensure_docker_volume(docker_cmd: str, volume_name: str) -> None:
    if docker_volume_exists(docker_cmd, volume_name):
        print(f"Docker 卷已存在: {volume_name}")
        return

    run_command([docker_cmd, "volume", "create", volume_name])
    print(f"Docker 卷已创建: {volume_name}")


def docker_container_exists(docker_cmd: str, container_name: str) -> bool:
    return get_container_state(docker_cmd, container_name) is not None


def docker_container_running(docker_cmd: str, container_name: str) -> bool:
    state = get_container_state(docker_cmd, container_name)
    return bool(state and state.get("Running"))


def assert_container_running(docker_cmd: str, container_name: str) -> None:
    if not docker_container_exists(docker_cmd, container_name):
        fatal(f"未找到容器: {container_name}")
    if not docker_container_running(docker_cmd, container_name):
        fatal(f"容器未处于运行状态: {container_name}")


def get_container_state(docker_cmd: str, container_name: str) -> Optional[dict[str, Any]]:
    completed = run_command(
        [docker_cmd, "inspect", container_name, "--format", "{{json .State}}"],
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        return None

    stdout = completed.stdout.strip()
    if not stdout:
        return None

    return json.loads(stdout)


def wait_for_container(
    docker_cmd: str,
    container_name: str,
    *,
    timeout_seconds: int = 180,
    poll_interval_seconds: int = 3,
) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        state = get_container_state(docker_cmd, container_name)
        if state is None:
            time.sleep(poll_interval_seconds)
            continue

        if state.get("Status") in {"exited", "dead"}:
            fatal(f"容器启动失败，状态为 {state.get('Status')}: {container_name}")

        health = state.get("Health")
        if health:
            if health.get("Status") == "healthy":
                print(f"容器健康检查通过: {container_name}")
                return
            if health.get("Status") == "unhealthy":
                fatal(f"容器健康检查失败: {container_name}")
        elif state.get("Running"):
            print(f"容器已启动: {container_name}")
            return

        time.sleep(poll_interval_seconds)

    fatal(f"等待容器就绪超时: {container_name}")


def docker_image_exists(docker_cmd: str, image_name: str) -> bool:
    completed = run_command(
        [docker_cmd, "image", "inspect", image_name],
        capture_output=True,
        check=False,
    )
    return completed.returncode == 0


def stop_container_if_running(docker_cmd: str, container_name: str) -> None:
    if docker_container_running(docker_cmd, container_name):
        run_command([docker_cmd, "stop", container_name])
        print(f"已停止容器: {container_name}")
    else:
        print(f"容器未运行，跳过停止: {container_name}")


def remove_container_if_exists(docker_cmd: str, container_name: str) -> None:
    if docker_container_exists(docker_cmd, container_name):
        run_command([docker_cmd, "rm", "-f", container_name])
        print(f"已删除容器: {container_name}")
    else:
        print(f"容器不存在，跳过删除: {container_name}")


def remove_image_if_exists(docker_cmd: str, image_name: str) -> None:
    if docker_image_exists(docker_cmd, image_name):
        run_command([docker_cmd, "rmi", "-f", image_name])
        print(f"已删除镜像: {image_name}")
    else:
        print(f"镜像不存在，跳过删除: {image_name}")


def synchronize_repository(config: DeploymentConfig, git_cmd: str) -> None:
    repo_root = config.repo_root
    backend_root = config.backend_code_root
    repo_parent = repo_root.parent

    if not repo_root.exists():
        ensure_directory(repo_parent)
        run_command(
            [
                git_cmd,
                "clone",
                "--branch",
                config.git_branch,
                "--single-branch",
                config.git_repo_url,
                str(repo_root),
            ],
            cwd=repo_parent,
        )
    elif not (repo_root / ".git").is_dir():
        fatal(f"仓库根目录存在但不是 Git 仓库: {repo_root}")

    worktree_status = run_command(
        [git_cmd, "status", "--porcelain"],
        cwd=repo_root,
        capture_output=True,
    ).stdout.strip()
    if worktree_status:
        print("检测到当前工作区存在本地改动，跳过自动 git 同步，继续使用当前代码部署。")
    else:
        print("检测到现有工作区，跳过自动 git 同步，继续使用当前代码部署。")

    if not backend_root.exists():
        fatal(f"后端目录不存在: {backend_root}")

    ensure_backend_layout(config)


def build_common_backend_environment(config: DeploymentConfig) -> dict[str, str]:
    return {
        "TZ": "Asia/Shanghai",
        "SPRING_PROFILES_ACTIVE": "sit",
        "SPRING_CONFIG_ADDITIONAL_LOCATION": "classpath:/sit/",
        "JWT_SECRET": config.jwt_secret,
        "AUTH_REFRESH_SECRET": config.auth_refresh_secret,
        "IM_AUTH_SERVICE_URL": "http://im-auth-service:8084",
        "IM_INTERNAL_SECRET": config.im_internal_secret,
        "IM_GATEWAY_AUTH_SECRET": config.im_gateway_auth_secret,
        "IM_MYSQL_HOST": MYSQL_CONTAINER_NAME,
        "IM_MYSQL_PORT": str(MYSQL_INTERNAL_PORT),
        "IM_MYSQL_USERNAME": "root",
        "IM_MYSQL_PASSWORD": config.mysql_root_password,
        "IM_REDIS_HOST": REDIS_CONTAINER_NAME,
        "IM_REDIS_PORT": str(REDIS_INTERNAL_PORT),
        "SPRING_DATA_REDIS_PASSWORD": config.redis_password,
        "IM_NACOS_SERVER_ADDR": f"{NACOS_CONTAINER_NAME}:{NACOS_INTERNAL_PORT}",
        "IM_KAFKA_BOOTSTRAP_SERVERS": f"{KAFKA_CONTAINER_NAME}:{KAFKA_INTERNAL_PORT}",
    }
