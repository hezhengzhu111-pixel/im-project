FROM docker.m.daocloud.io/library/eclipse-temurin:25-jdk-noble AS builder
WORKDIR /app
COPY pom.xml pom.xml
COPY mvnw mvnw
COPY .mvn .mvn
RUN sed -i 's/\r$//' mvnw \
    && chmod +x mvnw \
    && ./mvnw dependency:go-offline -B -q
COPY src src
RUN ./mvnw package -DskipTests -B -q

FROM docker.m.daocloud.io/library/eclipse-temurin:25-jre-noble
ARG IM_BUILD_NONCE
ARG UBUNTU_MIRROR=http://mirrors.cloud.tencent.com/ubuntu
ARG UBUNTU_MIRROR_FALLBACKS="http://mirrors.aliyun.com/ubuntu http://mirrors.ustc.edu.cn/ubuntu http://mirrors.tuna.tsinghua.edu.cn/ubuntu http://archive.ubuntu.com/ubuntu"
LABEL im.build.nonce=$IM_BUILD_NONCE
RUN set -eux; \
    printf 'Acquire::Retries "2";\nAcquire::http::Timeout "15";\nAcquire::http::Pipeline-Depth "0";\n' > /etc/apt/apt.conf.d/80-retries; \
    rm -f /etc/apt/sources.list.d/ubuntu.sources; \
    install_runtime_deps() { \
        mirror="$1"; \
        printf '%s\n' \
            "deb ${mirror} noble main restricted universe multiverse" \
            "deb ${mirror} noble-updates main restricted universe multiverse" \
            "deb ${mirror} noble-security main restricted universe multiverse" \
            > /etc/apt/sources.list; \
        rm -rf /var/lib/apt/lists/*; \
        apt-get update && apt-get install -y --no-install-recommends curl; \
    }; \
    installed=0; \
    for mirror in ${UBUNTU_MIRROR} ${UBUNTU_MIRROR_FALLBACKS}; do \
        if install_runtime_deps "${mirror}"; then \
            installed=1; \
            break; \
        fi; \
        echo "apt mirror failed, trying next: ${mirror}" >&2; \
    done; \
    if [ "${installed}" != "1" ]; then \
        echo "all Ubuntu apt mirrors failed" >&2; \
        exit 1; \
    fi; \
    rm -rf /var/lib/apt/lists/*; \
    useradd -r -u 10001 appuser
WORKDIR /app
COPY --from=builder /app/target/spring-ai-im-*.jar app.jar
USER appuser
EXPOSE 8084
ENTRYPOINT ["java", "-jar", "app.jar"]
