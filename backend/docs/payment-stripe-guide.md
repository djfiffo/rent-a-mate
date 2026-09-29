# Payments (Stripe) guide

Full Stripe-backed payment flow for a confirmed booking — no mock mode.
Every payment/refund is a two-leg async flow: an endpoint kicks off a
Stripe action and returns immediately with `pending`/`refunding`; the
*final* state (`paid`/`failed`/`refunded`) is only ever set by the
`/webhooks/stripe` handler once Stripe confirms it really happened.

## 1. Environment setup

Copy the Stripe block from [`.env.example`](../.env.example) into your `.env`
and fill in real values:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_API_VERSION=2026-08-26.dahlia
```

- `STRIPE_SECRET_KEY` — from the Stripe dashboard (test mode key, starts
  `sk_test_`).
- `STRIPE_WEBHOOK_SECRET` — printed by the Stripe CLI when you run
  `stripe listen` (see below), or from a configured webhook endpoint in the
  dashboard. Starts `whsec_`.
- `STRIPE_API_VERSION` — pinned SDK version; only change this if you
  intentionally upgrade the `stripe` npm package.

Without these two env vars set, `StripeProvider` throws on construction —
this happens as soon as Nest resolves `PaymentsModule`, so the app (and any
e2e test that boots the full `AppModule`) will fail to start.

## 2. Local webhook testing with the Stripe CLI

Stripe webhooks can't be triggered from Postman — they must come from
Stripe (or the Stripe CLI acting as Stripe). Install the
[Stripe CLI](https://stripe.com/docs/stripe-cli), then, with the backend
running (`npm run start:dev`):

```bash
stripe login
stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe
```

`stripe listen` prints a `whsec_...` value — copy that into your `.env` as
`STRIPE_WEBHOOK_SECRET` and restart the backend so it picks up the change.

Keep `stripe listen` running in a separate terminal for the whole session;
it forwards every webhook event Stripe would normally send to your local
server.

## 3. Endpoint reference

All endpoints require `Authorization: Bearer <jwt>` except the webhook.

| Method | Path                                | Role     | Purpose                                             |
| ------ | ----------------------------------- | -------- | ---------------------------------------------------- |
| POST   | `/api/v1/bookings/:bookingId/payment` | renter   | Create (or resume) a PaymentIntent; returns `clientSecret` |
| GET    | `/api/v1/bookings/:bookingId/payment` | renter/mate | Current payment status for a booking |
| POST   | `/api/v1/bookings/:bookingId/payment/refund` | admin | Manually refund an already-paid booking |
| GET    | `/api/v1/payments`                  | renter/mate | Own paginated payment history |
| POST   | `/api/v1/webhooks/stripe`           | Stripe only | Receives `payment_intent.succeeded`/`payment_intent.payment_failed`/`charge.refunded` |

`POST /payment` never returns `status: 'paid'` — only `pending` (with a
`clientSecret` to confirm client-side) or `paid` if a previous call already
completed. The renter's client is expected to use `clientSecret` with
Stripe.js/Stripe Elements to actually collect card details and confirm the
PaymentIntent — this backend never sees card data.

## 4. End-to-end test flow

1. Create + confirm a booking as usual (see
   [`quick-test-flow.md`](./quick-test-flow.md)).
2. `POST /api/v1/bookings/:bookingId/payment` as the renter → note the
   `clientSecret`.
3. Confirm the PaymentIntent using a
   [Stripe test card](https://stripe.com/docs/testing) (e.g.
   `4242 4242 4242 4242`) via Stripe.js, **or** from the Stripe CLI:
   ```bash
   stripe payment_intents confirm pi_xxx --payment-method pm_card_visa
   ```
4. Watch the `stripe listen` terminal — it should forward
   `payment_intent.succeeded` to your running backend, which flips the
   `Payment` row to `paid` and creates a `payment_paid` notification for the
   renter.
5. `GET /api/v1/bookings/:bookingId/payment` now returns `status: 'paid'`.
6. Cancel the booking (`POST /api/v1/bookings/:bookingId/cancel`) — since
   it was `paid`, `BookingsService.cancel()` automatically calls
   `PaymentsService.refund()`, which creates a Stripe refund and marks the
   payment `refunding`.
7. `stripe listen` forwards `charge.refunded` → the payment flips to
   `refunded` and the renter gets a `payment_refunded` notification.

## 5. Refund rules

- Refunds are **only** triggered automatically when a booking is cancelled
  *and* its payment was already `paid` at that moment. A booking cancelled
  while still `pending`/`confirmed`-but-unpaid needs no refund action.
- An admin can also refund a paid booking directly via
  `POST /bookings/:bookingId/payment/refund`, independent of cancellation
  (e.g. for disputes).
- `refund()` is idempotent: calling it again on a payment that is already
  `refunding`/`refunded` is a no-op.

## 6. Notification types

| Type                | Sent when                                             |
| ------------------- | ------------------------------------------------------ |
| `payment_paid`       | `payment_intent.succeeded` webhook received             |
| `payment_failed`     | `payment_intent.payment_failed` webhook received        |
| `payment_refunded`   | `charge.refunded` webhook received                       |

## 7. Idempotency

Both `stripe.paymentIntents.create()` and `stripe.refunds.create()` are
called with an `idempotencyKey` derived from the booking id
(`booking-<id>-payment` / `booking-<id>-refund`), so a retried request
never double-charges or double-refunds. Every webhook delivery is also
deduped by `event.id` via the `StripeWebhookEvent` table before it's acted
on, since Stripe guarantees at-least-once (not exactly-once) delivery.
