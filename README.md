# mateflow — Backend

> Good company, thoughtfully connected.

mateflow connects people with Mates for shared activities. This repository provides the backend for discovery, bookings, PromptPay payments, realtime conversations, reviews, and notifications.

## Features

- Authentication and role-based access for renters, Mates, and administrators.
- Mate profiles, photos, and availability management.
- Booking lifecycle and cancellation rules.
- Stripe PromptPay QR payments and payment status tracking.
- Realtime messaging with typing indicators and read receipts.
- Reviews for completed bookings and user notifications.

## Tech Stack

NestJS · TypeScript · PostgreSQL · Prisma ORM · Socket.IO · Stripe · S3-compatible storage

## Getting Started

Requires **Node.js 24**, npm, and Docker with Compose.

```bash
git clone https://github.com/djfiffo/rent-a-mate.git
cd rent-a-mate
docker compose up -d
cd backend
npm ci
cp .env.example .env
```

**Before continuing, configure the database URL and JWT secrets** using the [installation guide](backend/README.md).

```bash
npm run db:update
npm run seed
npm run start:dev
```

Default API: **http://localhost:3000/api/v1**

## Repository Structure

| Location                                                             | Purpose                                            |
| -------------------------------------------------------------------- | -------------------------------------------------- |
| [backend/](backend/)                                                 | NestJS application, database contract, and tests   |
| [backend/README.md](backend/README.md)                               | Installation, environment setup, and testing guide |
| [docker-compose.yml](docker-compose.yml)                             | Local PostgreSQL and object storage                |
| [docker-compose.prod.yml](docker-compose.prod.yml)                   | Production Compose configuration                   |
| [.env.production.example](.env.production.example)                   | Production environment template                    |
| [.github/workflows/backend-ci.yml](.github/workflows/backend-ci.yml) | Verification and E2E workflow                      |

## Frontend

The web application lives in the [mateflow frontend repository](https://github.com/IkrtI/rent-a-mate-frontend). Run it on port `3001` alongside the backend on port `3000` for local development.

Never use local sample credentials in production or commit real environment files.
