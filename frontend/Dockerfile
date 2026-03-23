FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ARG FRONTEND_BUILD_MODE=sit
RUN npm run build -- --mode ${FRONTEND_BUILD_MODE}

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
ARG IM_BUILD_NONCE
LABEL im.build.nonce=$IM_BUILD_NONCE
CMD ["nginx", "-g", "daemon off;"]
