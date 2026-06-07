FROM docker.m.daocloud.io/library/rust:1-bookworm AS builder
WORKDIR /app
ENV CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse
COPY . .
RUN --mount=type=cache,id=im-cargo-registry,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,id=im-cargo-git,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,id=im-server-cargo-target,target=/app/target \
    cargo build --release -p im-server \
    && cp /app/target/release/im-server /tmp/im-server-rs

FROM docker.m.daocloud.io/library/debian:bookworm-slim
ARG IM_BUILD_NONCE
ARG DEBIAN_MIRROR=http://mirrors.aliyun.com/debian
ARG DEBIAN_SECURITY_MIRROR=http://mirrors.aliyun.com/debian-security
LABEL im.build.nonce=$IM_BUILD_NONCE
RUN set -eux; \
    printf 'Acquire::Retries "5";\nAcquire::http::Timeout "30";\n' > /etc/apt/apt.conf.d/80-retries; \
    printf '%s\n' \
        "deb ${DEBIAN_MIRROR} bookworm main" \
        "deb ${DEBIAN_MIRROR} bookworm-updates main" \
        "deb ${DEBIAN_SECURITY_MIRROR} bookworm-security main" \
        > /etc/apt/sources.list; \
    rm -f /etc/apt/sources.list.d/debian.sources; \
    apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl3 curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -r -u 10001 appuser
WORKDIR /app
COPY --from=builder /tmp/im-server-rs /usr/local/bin/im-server-rs
USER appuser
EXPOSE 8083
ENTRYPOINT ["im-server-rs"]
