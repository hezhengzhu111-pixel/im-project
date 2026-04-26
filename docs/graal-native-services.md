# GraalVM Native Java Services

This project supports an opt-in native image path for Java backend services.
The default deployment remains JVM-based; native mode is selected per service.

## Recommended rollout

Start with the smallest service:

```powershell
python 3_deploy_services.py -registry-monitor --native-services registry-monitor
```

Then validate the container:

```powershell
docker ps --filter name=im-registry-monitor
curl.exe http://localhost:8090/actuator/health
curl.exe http://localhost:8090/services
```

Gateway can be tested next:

```powershell
python 3_deploy_services.py -gateway --native-services gateway
```

## Direct image build

The deployment script uses `backend/Dockerfile.native`. The equivalent Docker command is:

```powershell
$env:DOCKER_BUILDKIT="1"
docker build -f backend/Dockerfile.native `
  --build-arg MODULE_DIR=registry-monitor `
  --build-arg NATIVE_BINARY=im-registry-monitor `
  -t im-registry-monitor-native:latest `
  backend
```

Run it manually:

```powershell
docker run --rm --name im-registry-monitor-native `
  --network im-network `
  -p 8090:8090 `
  -e SPRING_PROFILES_ACTIVE=sit,native `
  -e SPRING_CONFIG_ADDITIONAL_LOCATION=classpath:/sit/ `
  im-registry-monitor-native:latest
```

## Notes

- `auth-service` and `im-server` are Rust services and do not use this path.
- Native mode disables Spring Cloud refresh and OpenFeign refresh/lazy attribute resolution.
- Native mode disables springdoc UI/API docs unless explicitly re-enabled.
- Native mode excludes Tomcat metrics auto-configuration because its JMX path is not stable under GraalVM native image.
- Native runtime hints include `sit/`, `dev/`, `logback-spring.xml`, Gateway Lua scripts, and static resources.
- Native image builds are CPU and memory intensive; test one service at a time.
- Native Docker builds use BuildKit cache mounts for Maven dependencies. The first build is still slow, but later builds avoid re-downloading dependencies and reuse the dependency-resolution layer while POM files stay unchanged.

For a local smoke test without Nacos registration:

```powershell
docker run --rm --name im-registry-monitor-native-check `
  -p 18090:8090 `
  -e SPRING_PROFILES_ACTIVE=sit,native `
  -e SPRING_CONFIG_ADDITIONAL_LOCATION=classpath:/sit/ `
  -e SPRING_CLOUD_SERVICE_REGISTRY_AUTO_REGISTRATION_ENABLED=false `
  -e SPRING_CLOUD_NACOS_DISCOVERY_REGISTER_ENABLED=false `
  -e IM_REGISTRY_MONITOR_NACOS_BASE_URL=http://127.0.0.1:1/nacos `
  im-registry-monitor-native:latest
```
