#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

# 假设 VERSION 文件在脚本的上级目录，如果在当前目录可直接改为 "VERSION"
VERSION_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "VERSION")
PROJECT_LOG = "/var/log/project_deploy.log"


def read_version() -> str:
    try:
        if os.path.exists(VERSION_FILE):
            with open(VERSION_FILE, "r", encoding="utf-8") as f:
                return f.read().strip()
        return "0.0.1" # 默认版本
    except Exception:
        return "0.0.0"


def log_line(text: str):
    print(text)
    try:
        with open(PROJECT_LOG, "a", encoding="utf-8") as f:
            f.write(text + "\n")
    except Exception:
        # 如果没有权限写入日志文件，尝试用 sudo
        subprocess.run(f"sudo sh -c 'echo \"{text}\" >> {PROJECT_LOG}'", shell=True)


def run(cmd: str, check=True) -> int:
    log_line(f"$ {cmd}")
    r = subprocess.run(cmd, shell=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"命令执行失败: {cmd}")
    return r.returncode


def output(cmd: str) -> str:
    return subprocess.check_output(cmd, shell=True, universal_newlines=True).strip()


def ensure_pip():
    code = run(f"{sys.executable} -m pip --version", check=False)
    if code != 0:
        run(f"{sys.executable} -m ensurepip --upgrade")


def ensure_pyyaml():
    try:
        import yaml
        return yaml
    except ImportError:
        pass
    except Exception:
        pass
        
    log_line("正在安装 PyYAML...")
    ensure_pip()
    # 尝试安装 PyYAML
    run(f"{sys.executable} -m pip install --no-input PyYAML==6.0.1", check=False)
    try:
        import yaml
        return yaml
    except ImportError:
        # 如果安装失败，再次尝试忽略版本
        run(f"{sys.executable} -m pip install --no-input PyYAML", check=False)
        import yaml
        return yaml


def detect_pkg_manager():
    for pm in ["apt-get", "dnf", "yum"]:
        if shutil.which(pm):
            return pm
    return ""


def ensure_git():
    if shutil.which("git"):
        return
    pm = detect_pkg_manager()
    log_line(f"检测到包管理器: {pm}, 正在安装 git...")
    if pm == "apt-get":
        run("apt-get update -y")
        run("apt-get install -y git")
    elif pm == "dnf":
        run("dnf install -y git")
    elif pm == "yum":
        run("yum install -y git")
    else:
        raise RuntimeError("未找到可用包管理器安装 git")


def ensure_docker():
    if shutil.which("docker"):
        return
    log_line("正在安装 Docker...")
    script_path = "/tmp/get-docker.sh"
    try:
        with urllib.request.urlopen("https://get.docker.com") as r:
            content = r.read()
        with open(script_path, "wb") as f:
            f.write(content)
        run(f"sh {script_path}")
    except Exception as e:
        log_line(f"自动安装 Docker 失败: {e}")
        
    if shutil.which("systemctl"):
        run("systemctl enable docker", check=False)
        run("systemctl start docker", check=False)
    else:
        run("service docker start", check=False)


def ensure_docker_compose():
    # 检查插件版 docker compose
    if run("docker compose version", check=False) == 0:
        return "docker compose"
    # 检查独立版 docker-compose
    if shutil.which("docker-compose"):
        return "docker-compose"
    
    log_line("正在安装 Docker Compose...")
    arch = output("uname -m")
    if arch in ("x86_64", "amd64"):
        bin_name = "docker-compose-linux-x86_64"
    elif arch in ("aarch64", "arm64"):
        bin_name = "docker-compose-linux-aarch64"
    else:
        raise RuntimeError(f"不支持架构: {arch}")
    
    url = f"https://github.com/docker/compose/releases/download/v2.29.2/{bin_name}"
    # 使用国内代理加速下载 (可选)
    # url = f"https://ghproxy.com/{url}" 
    
    try:
        with urllib.request.urlopen(url) as r:
            content = r.read()
        with open("/usr/local/bin/docker-compose", "wb") as f:
            f.write(content)
        run("chmod +x /usr/local/bin/docker-compose")
    except Exception as e:
        log_line(f"安装 Docker Compose 失败: {e}")
        raise
        
    return "docker-compose"


def down_clear(compose_path: str):
    compose = ensure_docker_compose()
    if os.path.exists(compose_path):
        log_line("清理旧容器...")
        run(f"{compose} -f {compose_path} down --rmi all --volumes", check=False)
    run("docker system prune -af", check=False)
    # run("docker builder prune -af", check=False) # 如果构建缓存很有用，这句可以注释掉


def git_clone(repo: str, branch: str, target: str):
    log_line(f"正在克隆代码: {repo} -> {target}")
    # 注意：密码包含在 repo URL 中，日志打印时最好脱敏，这里为了调试保留
    for i in range(3):
        code = run(f"git clone --depth 1 -b {branch} \"{repo}\" {target}", check=False)
        if code == 0:
            return
        log_line(f"Git clone 失败，重试 {i+1}/3...")
        time.sleep(2)
    raise RuntimeError("git clone 失败，请检查网络或账号密码")


def build_maven(project_dir: str):
    log_line("开始 Maven 构建...")
    # 确保本地 .m2 目录存在，加速构建
    m2_dir = os.path.expanduser("~/.m2")
    if not os.path.exists(m2_dir):
        os.makedirs(m2_dir)
        
    # 注意：这里假设你的项目结构中，backend 文件夹里有 pom.xml
    cmd = (
        f"docker run --rm "
        f"-v {project_dir}/backend:/project "
        f"-v {m2_dir}:/root/.m2 "
        f"-w /project "
        f"maven:3.9-eclipse-temurin-21 "
        f"mvn clean package -DskipTests"
    )
    run(cmd)


def build_service_images(compose_path: str, image_name: str, version: str):
    log_line("开始构建 Docker 镜像...")
    yaml = ensure_pyyaml()
    with open(compose_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
        
    services = data.get("services", {})
    images = {}
    
    for name, cfg in services.items():
        # 如果是预定义镜像（如 redis/mysql），跳过构建
        if "build" not in cfg:
            if "image" in cfg:
                images[name] = cfg["image"]
            continue
            
        build = cfg["build"]
        context_path = build if isinstance(build, str) else build.get("context", ".")
        
        # 处理相对路径
        base_dir = os.path.dirname(compose_path)
        abs_context = os.path.abspath(os.path.join(base_dir, context_path))
        
        dockerfile = "Dockerfile"
        args = {}
        if isinstance(build, dict):
            dockerfile = build.get("dockerfile", "Dockerfile")
            args = build.get("args", {}) or {}
            
        tag = f"{image_name}-{name}:{version}"
        cmd = f"docker build -t {tag} -f {os.path.join(abs_context, dockerfile)} {abs_context}"
        
        for k, v in args.items():
            cmd += f" --build-arg {k}={v}"
            
        run(cmd)
        images[name] = tag
        
    return images


def build_stack_compose(compose_path: str, images: dict, out_path: str):
    yaml = ensure_pyyaml()
    with open(compose_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
        
    services = data.get("services", {})
    for name, cfg in services.items():
        if name in images:
            cfg["image"] = images[name]
        # Swarm 模式不需要 build 和 container_name
        if "build" in cfg:
            del cfg["build"]
        if "container_name" in cfg:
            del cfg["container_name"]
        # 确保 restart policy 兼容 swarm
        if "restart" in cfg:
            del cfg["restart"] # Swarm 使用 deploy.restart_policy
            
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def stack_deploy(compose_path: str, stack_name: str):
    log_line("初始化 Swarm 并部署...")
    # 只有未初始化时才执行 init，否则忽略报错
    run(f"docker swarm init", check=False)
    
    run(f"docker stack deploy -c {compose_path} {stack_name}")
    
    log_line("等待服务启动 (60秒)...")
    time.sleep(60)
    
    services = output("docker service ls --format '{{.Name}} {{.Replicas}}'")
    log_line("服务状态检查:")
    log_line(services)
    
    # 简单检查副本数是否一致
    for line in services.splitlines():
        parts = line.split()
        if len(parts) < 2: continue
        name = parts[0]
        replicas = parts[1]
        
        if "/" in replicas:
            cur, exp = replicas.split("/")
            if cur != exp:
                # 警告但不强制失败，因为有些服务启动很慢
                log_line(f"⚠️ 警告: 服务 {name} 尚未完全就绪 ({replicas})")


def stack_rollback(stack_name: str):
    log_line("正在回滚...")
    run(f"docker stack rm {stack_name}", check=False)
    time.sleep(10)


def main():
    parser = argparse.ArgumentParser(description="Linux 项目部署", formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    
    # --- 核心修改：嵌入了账号密码的 Git 地址 (密码中的 @ 转义为 %40) ---
    auth_repo_url = "https://myhzz:100102024hua%40@gitee.com/myhzz/new-im-project.git"
    
    # 设置 repo 默认值
    parser.add_argument("--repo", default=auth_repo_url, help="Git 仓库地址")
    parser.add_argument("--branch", default=os.getenv("CI_COMMIT_REF_NAME", "master"))
    parser.add_argument("--dir", default="/home/new-im-project")
    parser.add_argument("--image-name", default="new-im-project")
    parser.add_argument("--stack", dest="stack_name", default="im-stack")
    parser.add_argument("--compose", default="docker-compose.yml")
    
    # --- 核心修改：移除了导致冲突的 action="version" 参数 ---
    parser.add_argument("--version", default=read_version(), help="构建镜像使用的版本号")
    
    args = parser.parse_args()

    t0 = time.time()
    try:
        ensure_docker()
        ensure_git()
        
        # 1. 强制清理目录：为了防止 git clone 报 "exists" 错误
        if os.path.exists(args.dir):
            log_line(f"检测到目录 {args.dir} 已存在，正在删除以重新拉取...")
            shutil.rmtree(args.dir) # 递归删除文件夹
            
        # 2. 创建目录并克隆
        os.makedirs(args.dir, exist_ok=True)
        git_clone(args.repo, args.branch, args.dir)
        
        compose_path = os.path.join(args.dir, args.compose)
        if not os.path.exists(compose_path):
            raise RuntimeError(f"未找到 docker-compose 文件: {compose_path}")

        # 3. 清理旧容器 (可选)
        # down_clear(compose_path) 
        
        # 4. 构建与部署
        build_maven(args.dir)
        images = build_service_images(compose_path, args.image_name, args.version)
        
        stack_file = "/tmp/im-stack-compose.json"
        build_stack_compose(compose_path, images, stack_file)
        stack_deploy(stack_file, args.stack_name)
        
        git_id = output(f"git -C {args.dir} rev-parse HEAD")
        cost_ms = int((time.time() - t0) * 1000)
        
        log_line("="*50)
        log_line(f"✅ DEPLOY SUCCESS | Images: {len(images)} | Commit: {git_id[:7]} | Cost: {cost_ms}ms")
        log_line("="*50)
        sys.exit(0)
        
    except Exception as e:
        log_line(f"❌ DEPLOY FAILED: {str(e)}")
        # 仅在需要时回滚，或者手动回滚
        # stack_rollback(args.stack_name)
        sys.exit(1)


if __name__ == "__main__":
    main()
