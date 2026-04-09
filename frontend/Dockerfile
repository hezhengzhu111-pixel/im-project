FROM docker.m.daocloud.io/library/node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm config set registry https://registry.npmjs.org/ \
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
RUN if [ "${FRONTEND_BUILD_MODE}" = "dev" ]; then npm run build:dev; \
    elif [ "${FRONTEND_BUILD_MODE}" = "sit" ]; then npm run build:sit; \
    else npm run build; \
    fi

FROM docker.m.daocloud.io/library/nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
ARG IM_BUILD_NONCE
LABEL im.build.nonce=$IM_BUILD_NONCE
CMD ["nginx", "-g", "daemon off;"]
