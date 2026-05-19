FROM docker.m.daocloud.io/library/node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/rust-e2ee-wasm/package.json ./packages/rust-e2ee-wasm/package.json
COPY packages/shared-api-contract/package.json ./packages/shared-api-contract/package.json
COPY packages/shared-auth-core/package.json ./packages/shared-auth-core/package.json
COPY packages/shared-e2ee-core/package.json ./packages/shared-e2ee-core/package.json
COPY packages/shared-im-core/package.json ./packages/shared-im-core/package.json
COPY packages/shared-normalizers/package.json ./packages/shared-normalizers/package.json
COPY packages/shared-platform-ports/package.json ./packages/shared-platform-ports/package.json
COPY packages/shared-types/package.json ./packages/shared-types/package.json
COPY packages/shared-utils/package.json ./packages/shared-utils/package.json
COPY packages/shared-ws-core/package.json ./packages/shared-ws-core/package.json
RUN npm config set registry https://registry.npmmirror.com/ \
    && npm config set fetch-retries 5 \
    && npm config set fetch-retry-factor 2 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm config set prefer-online true \
    && npm config set audit false \
    && npm config set fund false \
    && for attempt in 1 2 3; do \
        npm ci && break; \
        if [ "$attempt" -eq 3 ]; then exit 1; fi; \
        echo "npm ci failed, retrying in 10s (attempt $attempt/3)"; \
        sleep 10; \
    done
COPY . .
ARG FRONTEND_BUILD_MODE=sit
ENV E2EE_WASM_BUILD_SKIP=1
RUN if [ "${FRONTEND_BUILD_MODE}" = "dev" ]; then npm run web:build:dev; \
    elif [ "${FRONTEND_BUILD_MODE}" = "sit" ]; then npm run web:build:sit; \
    else npm run web:build; \
    fi

FROM docker.m.daocloud.io/library/nginx:1.27-alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY --from=builder /app/apps/web/nginx-main.conf /etc/nginx/nginx.conf
COPY --from=builder /app/apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
ARG IM_BUILD_NONCE
LABEL im.build.nonce=$IM_BUILD_NONCE
CMD ["nginx", "-g", "daemon off;"]