FROM docker.m.daocloud.io/library/rust:1-bookworm AS builder
WORKDIR /app
COPY . .
RUN cargo build --release -p im-server-rs

FROM debian:bookworm-slim
ARG IM_BUILD_NONCE
LABEL im.build.nonce=$IM_BUILD_NONCE
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -r -u 10001 appuser
WORKDIR /app
COPY --from=builder /app/target/release/im-server-rs /usr/local/bin/im-server-rs
USER appuser
EXPOSE 8083
ENTRYPOINT ["im-server-rs"]
