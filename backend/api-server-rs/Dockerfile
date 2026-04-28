FROM docker.m.daocloud.io/library/rust:1-bookworm AS builder
WORKDIR /app
ENV CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse
COPY . .
RUN --mount=type=cache,id=im-cargo-registry,target=/usr/local/cargo/registry \
    --mount=type=cache,id=im-cargo-git,target=/usr/local/cargo/git \
    --mount=type=cache,id=im-cargo-target,target=/app/target \
    cargo build --release -p api-server-rs \
    && cp /app/target/release/api-server-rs /tmp/api-server-rs

FROM debian:bookworm-slim
ARG IM_BUILD_NONCE
LABEL im.build.nonce=$IM_BUILD_NONCE
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -r -u 10001 appuser
WORKDIR /app
COPY --from=builder /tmp/api-server-rs /usr/local/bin/api-server-rs
USER appuser
EXPOSE 8082
ENTRYPOINT ["api-server-rs"]
