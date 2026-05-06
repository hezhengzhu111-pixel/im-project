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
ARG UBUNTU_MIRROR=http://mirrors.aliyun.com/ubuntu
LABEL im.build.nonce=$IM_BUILD_NONCE
RUN set -eux; \
    printf 'Acquire::Retries "5";\nAcquire::http::Timeout "30";\n' > /etc/apt/apt.conf.d/80-retries; \
    printf '%s\n' \
        "deb ${UBUNTU_MIRROR} noble main restricted universe multiverse" \
        "deb ${UBUNTU_MIRROR} noble-updates main restricted universe multiverse" \
        "deb ${UBUNTU_MIRROR} noble-security main restricted universe multiverse" \
        > /etc/apt/sources.list; \
    rm -f /etc/apt/sources.list.d/ubuntu.sources; \
    apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -r -u 10001 appuser
WORKDIR /app
COPY --from=builder /app/target/spring-ai-im-*.jar app.jar
USER appuser
EXPOSE 8084
ENTRYPOINT ["java", "-jar", "app.jar"]
