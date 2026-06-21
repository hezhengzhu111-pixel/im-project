FROM docker.m.daocloud.io/library/rust:1-bookworm AS wasm-builder
WORKDIR /workspace
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      libssl-dev \
      pkg-config \
      python3 \
    && rm -rf /var/lib/apt/lists/*
RUN rustup target add wasm32-unknown-unknown
RUN cargo install wasm-pack --locked
COPY rust ./rust
WORKDIR /workspace/rust/crates/im-flutter-bridge
RUN RUSTFLAGS="-C target-feature=-atomics,-bulk-memory,-mutable-globals" \
      wasm-pack build --target no-modules --out-dir /wasm-pkg --no-default-features \
    && python3 patch_wasm_js.py /wasm-pkg/im_rust_bridge.js \
    && test -f /wasm-pkg/im_rust_bridge.js \
    && test -f /wasm-pkg/im_rust_bridge_bg.wasm

FROM ghcr.io/cirruslabs/flutter:stable AS builder
WORKDIR /workspace
COPY flutter ./flutter
COPY --from=wasm-builder /wasm-pkg ./flutter/apps/web/web/pkg
WORKDIR /workspace/flutter/apps/web
# Melos-generated overrides may contain Windows-style paths that break Linux builds.
RUN find /workspace/flutter -name pubspec_overrides.yaml -delete
RUN flutter pub get
ARG FRONTEND_BUILD_MODE=sit
RUN test -f web/pkg/im_rust_bridge.js && test -f web/pkg/im_rust_bridge_bg.wasm
RUN if [ "${FRONTEND_BUILD_MODE}" = "dev" ]; then \
      flutter build web --debug --pwa-strategy=none; \
    elif [ "${FRONTEND_BUILD_MODE}" = "sit" ]; then \
      flutter build web --release --pwa-strategy=none; \
    else \
      flutter build web --release --pwa-strategy=none; \
    fi

FROM docker.m.daocloud.io/library/nginx:1.27-alpine
COPY --from=builder /workspace/flutter/apps/web/build/web /usr/share/nginx/html
COPY flutter/apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
ARG IM_BUILD_NONCE
LABEL im.build.nonce=$IM_BUILD_NONCE
CMD ["nginx", "-g", "daemon off;"]
