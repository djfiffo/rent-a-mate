# Chat client integration guide: REST writes, Socket.IO updates

Booking chat has one durable message-write path and one optional realtime
channel:

- **REST**: `GET/POST /api/v1/bookings/:bookingId/messages` loads history and
  creates messages.
- **Socket.IO**: `/chat` joins booking rooms, broadcasts committed messages,
  typing state, and read receipts.

## Message flow

The client always sends a message with REST, whether the socket is connected
or not. Each user action carries a UUID `clientMessageId`, and a retry reuses
the same UUID. `MessagesController` calls `MessagesService.create()` exactly once.
That service writes the message and recipient notification in one transaction.
Only after it resolves does the controller publish a message-created event;
the gateway observes that result and emits `new_message` without writing to the
database again.

Clients should merge the REST response and `new_message` event by message ID.
The sender can receive both representations of the same committed row, but it
must render only one message.

The database has a unique `(senderId, clientMessageId)` constraint. If a REST
response is lost and the client retries, the backend returns the original row,
does not create another notification, and does not broadcast the row again.

| Situation | Transport |
|---|---|
| Initial history and pagination | REST `GET` |
| Create a message | REST `POST` |
| Receive a committed message while connected | Socket `new_message` |
| Socket unavailable | REST polling |
| Reconnect or join a room | Socket join, then REST reconciliation |
| Typing state | Socket `typing` |
| Mark/read receipt | Socket `mark_read` / `messages_read` |

## Authentication

Call `POST /auth/socket-ticket` through the frontend's same-origin BFF. It uses
the HttpOnly session server-side and returns a short-lived, single-use ticket.
Pass the ticket only as `socket.handshake.auth.ticket`. A reconnect must request
a fresh ticket.

## Socket event reference

All client-to-server events acknowledge with `{ ok: true, data? }` or
`{ ok: false, error: string }`.

| Event | Direction | Payload | Notes |
|---|---|---|---|
| `join_booking` | client → server | `{ bookingId }` | Checks participation and joins `booking:{bookingId}` |
| `leave_booking` | client → server | `{ bookingId }` | Leaves the room |
| `typing` | client → server → room | `{ bookingId, isTyping }` | Transient and not persisted |
| `mark_read` | client → server | `{ bookingId }` | Persists read state and broadcasts `messages_read` |
| `new_message` | server → client | created message | Emitted after a successful REST write |
| `messages_read` | server → client | `{ bookingId, readerId, updatedCount }` | Read receipt update |

There is deliberately no `send_message` Socket event. This prevents a client
from sending the same user action through Socket and REST and creating two
database rows.
