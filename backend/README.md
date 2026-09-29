# mateflow — Backend Setup

The NestJS API powering mateflow: a platform for discovering Mates, booking shared activities, chatting, and paying with PromptPay.

See the [project overview](../README.md) for features and repository structure.

## Prerequisites

- Node.js **24** and npm.
- Docker with Docker Compose.
- Stripe test credentials only when testing Stripe integration instead of mock payments.

## Installation

### 1. Start local services

From the repository root:

```bash
docker compose up -d
```

This starts PostgreSQL 17 on port `5432` and RustFS S3-compatible object storage on ports `9000` and `9001`.

### 2. Install dependencies

```bash
cd backend
npm ci
cp .env.example .env
```

### 3. Configure the environment

Edit `backend/.env`. Set these local values and replace each secret placeholder with a separate, securely generated value:

```dotenv
DATABASE_URL=postgresql://saig:1234@localhost:5432/rent_a_mate
JWT_ACCESS_SECRET=replace-with-a-random-access-secret
JWT_REFRESH_SECRET=replace-with-a-random-refresh-secret
JWT_SOCKET_TICKET_SECRET=replace-with-a-random-ticket-secret
SOCKET_TICKET_TTL_SECONDS=60
CORS_ORIGIN=http://localhost:3001
PORT=3000
API_PREFIX=api/v1
PAYMENTS_MODE=mock
```

The database credentials match local Compose and are **for development only**. Add `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` explicitly; the example file does not currently include them.

Keep the local `MINIO_*` settings from `.env.example` when using the provided storage service. These environment names also apply to RustFS.

| Variables                                               | Purpose                                   |
| ------------------------------------------------------- | ----------------------------------------- |
| `DATABASE_URL`                                          | PostgreSQL connection                     |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`               | Access and refresh token signing          |
| `JWT_SOCKET_TICKET_SECRET`, `SOCKET_TICKET_TTL_SECONDS` | Socket authentication                     |
| `CORS_ORIGIN`                                           | Allowed frontend origins, comma-separated |
| `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`         | Storage connection                        |
| `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`  | Storage credentials and bucket            |
| `MINIO_PUBLIC_URL`                                      | Public image base URL                     |
| `PAYMENTS_MODE`                                         | Local `mock` or `stripe` mode             |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`            | Stripe API and webhook credentials        |
| `STRIPE_API_VERSION`                                    | Configured Stripe API version             |

Never commit real secrets or share your `.env`.

### 4. Prepare the database

```bash
npm run db:update
npm run seed
```

This project uses a Prisma ORM database contract. Use the repository scripts rather than assuming conventional Prisma migration commands apply.

Optional demo account seeding requires `DEMO_ACCOUNT_PASSWORD`. Use a development-only password.

### 5. Start the API

```bash
npm run start:dev
```

Default API: **http://localhost:3000/api/v1**

Run the [frontend](https://github.com/IkrtI/rent-a-mate-frontend) on **http://localhost:3001**, configured with `BACKEND_URL=http://localhost:3000/api/v1` and `NEXT_PUBLIC_SOCKET_URL=http://localhost:3000`.

## Application Flow

Renters discover Mates and request bookings. The backend enforces booking permissions and transitions between `pending`, `confirmed`, `completed`, and `cancelled`. Renters can review their own completed bookings.

REST loads and saves messages. Socket.IO broadcasts messages, typing activity, and read receipts through the `/chat` namespace. Clients use short-lived, single-use tickets and request a new ticket on reconnect. Messages are not saved through both transports.

For payments, the backend returns `bookingId`, `status`, and `clientSecret`. The frontend uses Stripe.js to present PromptPay QR. Stripe webhooks and backend status reconciliation confirm the payment result.

### Trying payments locally

Use backend `PAYMENTS_MODE=mock` with frontend `NEXT_PUBLIC_PAYMENTS_MODE=mock` for mock payments. Mock mode is unavailable in production.

To test Stripe:

1. Switch both applications to `stripe` mode.
2. Configure matching Stripe test secret and publishable keys.
3. Configure webhook delivery to `POST /api/v1/webhooks/stripe` and set its signing secret.
4. Confirm PromptPay is available for your Stripe account.

Showing a QR code is not proof of payment. The frontend waits for backend confirmation.

## Project Structure

```text
src/
  auth/       Authentication
  mates/      Mate profiles and related functionality
  bookings/   Booking lifecycle
  payments/   Payments, refunds, and status handling
  messages/   Message API
  prisma/     Database contract and integration
prisma/       Seed script
test/         E2E tests and fixtures
```

## Development Commands

Run from `backend/`:

| Command                | Description                                   |
| ---------------------- | --------------------------------------------- |
| `npm run start:dev`    | Start in watch mode                           |
| `npm run build`        | Compile application                           |
| `npm run start:prod`   | Run compiled application                      |
| `npm run format:check` | Check formatting                              |
| `npm run lint`         | Run Oxlint                                    |
| `npm test`             | Run unit tests                                |
| `npm run test:cov`     | Run tests with coverage                       |
| `npm run test:e2e`     | Run database-backed E2E tests                 |
| `npm run verify`       | Check formatting, lint, unit tests, and build |
| `npm run db:update`    | Apply database contract                       |
| `npm run seed`         | Seed initial data                             |

## E2E Tests

**Use a dedicated test database. Tests reset fixture data. Never use production or a database containing data you need.**

Create the database once from the repository root:

```bash
docker compose exec postgres createdb -U saig rent_a_mate_test
```

Run from `backend/`:

```bash
(
  export DATABASE_URL='postgresql://saig:1234@localhost:5432/rent_a_mate_test'
  export TEST_DATABASE_URL="$DATABASE_URL"
  npm run db:update && npm run seed && npm run test:e2e
)
```

The subshell keeps test environment variables out of your normal development session. E2E tests use a real test database but do not verify live Stripe payments.

## CI and Production

[GitHub Actions](../.github/workflows/backend-ci.yml) runs two independent jobs on pushes and pull requests:

- **Verify:** dependency installation, formatting, lint, unit tests, and build.
- **E2E:** PostgreSQL 17 service, database preparation, seed, and E2E tests.

CI uses Node.js 24 and does not deploy.

See [the production environment template](../.env.production.example), [production Compose](../docker-compose.prod.yml), and [Dockerfile](Dockerfile). Use HTTPS, restricted CORS, dedicated database/storage credentials, strong signing secrets, and Stripe mode with correctly configured webhooks. Frontend and backend Stripe credentials must belong to the same account and mode. The proxy must support WebSocket connections.

Example environment files are not loaded automatically. Review database changes as part of your release process; building does not update the database.
