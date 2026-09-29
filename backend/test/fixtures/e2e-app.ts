import express from 'express';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module.js';
import { StripeProvider } from '../../src/payments/providers/stripe.provider.js';

export type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

export class FakeStripeProvider {
  private sequence = 0;
  readonly createdIntents: Array<{
    params: Record<string, unknown>;
    options: Record<string, unknown>;
  }> = [];
  readonly retrievedIntents: string[] = [];
  readonly createdRefunds: Array<{
    params: Record<string, unknown>;
    options: Record<string, unknown>;
  }> = [];

  readonly client = {
    paymentIntents: {
      create: async (
        params: Record<string, unknown>,
        options: Record<string, unknown>,
      ) => {
        this.createdIntents.push({ params, options });
        const id = `pi_e2e_${++this.sequence}`;
        return { id, client_secret: `${id}_secret` };
      },
      retrieve: async (id: string) => {
        this.retrievedIntents.push(id);
        return { id, client_secret: `${id}_secret` };
      },
    },
    refunds: {
      create: async (
        params: { payment_intent: string },
        options: Record<string, unknown>,
      ) => {
        this.createdRefunds.push({ params, options });
        return { id: `re_${params.payment_intent}` };
      },
    },
    webhooks: {
      constructEvent: (body: Buffer, signature: string): StripeEvent => {
        if (signature !== 'e2e-valid-signature') {
          throw new Error('Invalid signature');
        }
        return JSON.parse(body.toString('utf8')) as StripeEvent;
      },
    },
  };

  get webhookSecret(): string {
    return 'whsec_e2e';
  }

  reset(): void {
    this.createdIntents.length = 0;
    this.retrievedIntents.length = 0;
    this.createdRefunds.length = 0;
  }
}

export async function createE2eApp(
  options: { listen?: boolean } = {},
): Promise<{
  app: INestApplication<App>;
  module: TestingModule;
  stripe: FakeStripeProvider;
  url?: string;
}> {
  const stripe = new FakeStripeProvider();
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(StripeProvider)
    .useValue(stripe)
    .compile();

  const app = module.createNestApplication({ bodyParser: false });
  app.use('/api/v1/webhooks/stripe', express.raw({ type: 'application/json' }));
  app.use(express.json());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.setGlobalPrefix('api/v1');

  if (options.listen) {
    await app.listen(0, '127.0.0.1');
    return { app, module, stripe, url: await app.getUrl() };
  }

  await app.init();
  return { app, module, stripe };
}
