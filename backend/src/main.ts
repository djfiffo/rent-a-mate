import express from 'express';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';

async function bootstrap() {
  const apiPrefix = process.env['API_PREFIX'] ?? 'api/v1';

  // Stripe webhook signature verification (see StripeWebhookController) needs
  // the exact raw request bytes, which Nest's default JSON body parser would
  // already have consumed/parsed by the time a controller sees it. Body
  // parsing is disabled globally and wired back up manually below so the
  // webhook path gets a raw Buffer while every other route keeps the same
  // JSON behavior it always had.
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
    bodyParser: false,
  });

  app.use(
    `/${apiPrefix}/webhooks/stripe`,
    express.raw({ type: 'application/json' }),
  );
  app.use(express.json());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  const corsOrigin = process.env['CORS_ORIGIN'];
  if (corsOrigin) {
    app.enableCors({
      origin: corsOrigin
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type'],
    });
  }
  app.setGlobalPrefix(apiPrefix);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
