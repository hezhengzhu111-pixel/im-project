FROM ghcr.io/cirruslabs/flutter:stable AS builder
WORKDIR /app
COPY . .
WORKDIR /app/apps/web
RUN flutter pub get
ARG FRONTEND_BUILD_MODE=sit
RUN if [ "${FRONTEND_BUILD_MODE}" = "dev" ]; then \
      flutter build web --debug; \
    elif [ "${FRONTEND_BUILD_MODE}" = "sit" ]; then \
      flutter build web --release; \
    else \
      flutter build web --release --obfuscate --split-debug-info=/debug-info; \
    fi

FROM docker.m.daocloud.io/library/nginx:1.27-alpine
COPY --from=builder /app/apps/web/build/web /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
ARG IM_BUILD_NONCE
LABEL im.build.nonce=$IM_BUILD_NONCE
CMD ["nginx", "-g", "daemon off;"]
