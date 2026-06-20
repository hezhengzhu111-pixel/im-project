# Remote Deploy

Use this flow when the cloud server is too slow to build Rust, WASM, Flutter, or Maven artifacts.
The script builds Docker images locally, uploads image tar files plus a remote-ready Compose file, and starts services over SSH with Docker commands.
For remote deployment, local packaging uses `imctl.py build --docker-only --package-images`, so it does not run an extra host-side Flutter web dist build.

## Prerequisites

Local machine:

- Python 3
- PyYAML for the Python used to run the script
- Docker Desktop running
- Rust/Cargo, Flutter, wasm-pack
- `ssh` and `scp` available in the terminal

Remote server:

- Linux server reachable by SSH
- Docker and Docker Compose v2
- The SSH user can run Docker commands
- `tar`
- Enough disk space for image tar files, Docker images, and runtime data

## Deploy

The default target is built into `scripts/remote_deploy.py`:

- Host: `223.109.143.207`
- User: `root`
- Identity file: `D:\project\new-im-project\ssh\im-ssh.pem`
- Remote dir: `/home/new-im-project`
- Compose project name: selected profile, for example `sit` or `prod`

```sh
python scripts/remote_deploy.py --profile sit
```

Deployment modes:

- `--all`: recreate middleware and application services.
- `--server`: deploy application services only, using `docker compose up --no-deps`; middleware and database are not touched.

Spring AI is currently excluded from both local and remote deployment targets.

Before building, the script runs:

```sh
python scripts/imctl.py --profile sit clean source-pollution
```

This removes generated artifacts from source directories, such as Rust `target/`, Flutter `build/`, and `pubspec.lock` files. Disable it only when you want to inspect those files manually:

```sh
python scripts/remote_deploy.py --profile sit --no-clean-source-pollution
```

Preview the full command chain without building, uploading, or connecting:

```sh
python scripts/remote_deploy.py --profile sit --dry-run
```

You can still override the target when needed:

```sh
python scripts/remote_deploy.py --host 1.2.3.4 --user root --identity-file ~/.ssh/id_rsa --remote-dir /opt/new-im-project --profile sit
```

With a custom runtime env file:

```sh
python scripts/remote_deploy.py --profile prod --env-file build/runtime/env/prod.env
```

Reuse existing local image tar files and skip rebuilding:

```sh
python scripts/remote_deploy.py --profile sit --skip-build
```

Recreate middleware and services remotely:

```sh
python scripts/remote_deploy.py --profile sit --all
```

Deploy services only:

```sh
python scripts/remote_deploy.py --profile sit --server
```

Deploy only selected application services:

```sh
python scripts/remote_deploy.py --profile sit --services im-server im-api-server
```

## What It Uploads

- `build/dist/images/*.tar`
- `build/runtime/compose/docker-compose.remote.yml`
- SQL files under `sql/`
- The selected env file as `build/runtime/env/remote.env` unless `--skip-env-upload` is used

Remote deployment does not upload or execute the project Python deployment scripts.
The server only needs `tar`, Docker, and Docker Compose v2.

On the server, it runs Docker directly:

```sh
docker load -i build/dist/images/*.tar
docker compose --project-name sit --env-file /home/new-im-project/build/runtime/env/remote.env -f /home/new-im-project/build/runtime/compose/docker-compose.remote.yml up -d im-server im-api-server im-frontend
```

## HTTPS

Remote deployment now includes an `im-nginx` reverse proxy that terminates HTTPS on port 443 and redirects HTTP on port 80 to HTTPS. A self-signed certificate for the target host (or IP) is generated automatically on the first deploy and uploaded with the bundle.

- Web UI: `https://<host>/`
- API: `https://<host>/api/`
- WebSocket: `wss://<host>/ws/` or `wss://<host>/websocket/`

To use a real domain certificate, replace the files in `build/runtime/nginx/ssl/` (`im-server.crt` and `im-server.key`) before deploying, or install certbot on the server after deployment.

