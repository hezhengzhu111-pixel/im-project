# im-server-rs

Rust implementation of the IM websocket push service.

It keeps the Java `im-server` external contracts:

- `GET /health`, `GET /ready`
- `POST /api/im/offline/{userId}`
- `POST /api/im/heartbeat/{userId}`
- `POST /api/im/heartbeat`
- `POST /api/im/online-status`
- `GET /websocket/{userId}`

The websocket path variable is accepted only for route compatibility. User
identity is validated from Gateway-injected signed headers and the ws ticket.
