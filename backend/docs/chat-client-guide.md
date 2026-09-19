# Chat client integration guide: REST vs Socket.IO

This backend exposes booking chat (spec §6.7) through **two entry points that
call the exact same server-side logic**:

- **REST**: `GET/POST /api/v1/bookings/:bookingId/messages` (mandatory, always
  available) — see `MessagesController`/`MessagesService`.
- **Socket.IO**: the `/chat` namespace (optional, real-time) — see
  `ChatGateway`.

Both ultimately call `MessagesService.assertParticipant()` / `.create()` /
`.markRead()`. There is only **one** place messages are ever written to the
database. This guide is for frontend/client implementers deciding which path
to use and when.

## The one hard rule: never use both paths for the same message

`MessagesService.create()` has no de-duplication/idempotency check. If a
client both `POST`s a message over REST **and** `emit`s `send_message` over
Socket.IO for the same user action, the server will happily insert **two**
separate rows — the same text will appear twice in the chat.

**Pick exactly one path per outgoing message.** Never call both for the same
send action.

## Decision table

| Situation | Use |
|---|---|
| Socket connected (normal case — chat screen open) | `emit('send_message', ...)` — faster, and the room broadcast (`new_message`) delivers it to the other participant in the same round trip |
| Socket not connected / still connecting / disconnected | `POST /bookings/:bookingId/messages` (REST fallback) |
| Loading chat history (initial load, pagination, infinite scroll) | `GET /bookings/:bookingId/messages` — **always**, regardless of socket state; Socket.IO has no pagination endpoint |
| Receiving new messages in real time while the chat screen is open | Listen for the `new_message` event only — do not poll `GET /messages` while connected |
| Background job / admin tool / any caller that does not want to hold a persistent connection | `POST /messages` — always |
| Socket.IO server disabled/unavailable entirely | The whole feature still works over REST alone; Socket.IO is optional per spec, REST is mandatory |

## Recommended send logic (handles the race where the socket drops mid-send)

```
function sendMessage(bookingId, content):
    if socket.connected:
        emit "send_message" { bookingId, content } with ack callback
        wait up to ~3s for ack
        if ack received:
            done
        else:
            # socket looked connected but never acked (e.g. it just dropped)
            fall back to POST /bookings/{bookingId}/messages
    else:
        POST /bookings/{bookingId}/messages
```

Do **not** start both the `emit` and the `POST` at the same time "just to be
safe" — always try one, then fall back to the other only if the first fails
or times out.

## Event reference (Socket.IO, `/chat` namespace)

Auth: pass the access token via `socket.handshake.auth.token` (or, as a
fallback, a `token` query-string parameter) when connecting. The same
`isBanned`/`isActive` checks used by REST's `JwtAuthGuard` apply here too, via
`WsJwtGuard`.

All client→server events reply through their ack callback with
`{ ok: true, data? }` or `{ ok: false, error: string }` — Socket.IO has no
HTTP status codes, so exceptions from `MessagesService` are translated into
this envelope instead of throwing.

| Event | Direction | Payload | Notes |
|---|---|---|---|
| `join_booking` | client → server | `{ bookingId }` | Authorizes via the same participant check as REST; joins room `booking:{bookingId}` |
| `leave_booking` | client → server | `{ bookingId }` | No authorization check (leaving is always safe) |
| `send_message` | client → server | `{ bookingId, content }` | Same validation/gating as REST (`422 MESSAGE_NOT_ALLOWED` unless the booking is `confirmed`/`completed`); broadcasts `new_message` to the whole room including the sender |
| `typing` | client → server → broadcast | `{ bookingId, isTyping }` | Not persisted; broadcast to everyone else in the room, never echoed back to the sender |
| `mark_read` | client → server | `{ bookingId }` | Marks the other participant's unread messages as read; broadcasts `messages_read` to the room |

Server→client-only events:

| Event | Payload |
|---|---|
| `new_message` | The created message (same shape as a REST list item) |
| `typing` | `{ bookingId, userId, isTyping }` |
| `messages_read` | `{ bookingId, readerId, updatedCount }` |
| `error` | `{ message }` — emitted once right before the server disconnects an unauthenticated socket |
