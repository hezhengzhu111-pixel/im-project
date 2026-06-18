# Features

The IM project provides a multi-platform messaging product with Rust backend services, Flutter clients, and an optional Spring AI service.

## Authentication

The platform supports account authentication, token issuance, refresh-token handling, WebSocket ticketing, internal service authentication, and gateway-to-service authorization.

## One-to-One Chat

Private chat supports message sending, receiving, storage, delivery through the IM server, unread state, event streams, and multi-device fan-out behavior.

## Group Chat

Group messaging supports group conversation flows, group event streams, hot Redis shards for group traffic, and E2EE-oriented group message handling.

## Contacts

Contact features cover user relationship flows, friend/contact APIs, and client-side contact presentation through shared Flutter feature packages.

## Moments

Moments functionality provides social timeline-style publishing and reading flows through the Flutter feature layer and backend API contracts.

## File Transfer

Local file storage is mounted at `/data/im-files` inside runtime containers and persisted at `build/runtime/files` on the host. The API server enforces configured limits for images, files, audio, video, avatars, and multipart uploads.

## Voice Messages

Voice message support is included through the file/message pipeline with audio-specific upload sizing and message metadata handling.

## Notifications

Notification and push dispatch behavior is controlled by backend event streams and runtime options such as `IM_PUSH_DISPATCHER_ENABLED`.

## End-to-End Encryption

E2EE support includes Rust core crates, FFI/bridge crates, private and group E2EE flows, OPK lifecycle checks, plaintext database scan gates, and staged acceptance tests under `tests/`.

## AI

The optional Spring AI service integrates with the API server through `im-spring-ai`, Redis, internal service secrets, and AI task streams. Runtime AI settings are provided through `build/runtime/env/local.env`.
