import 'dotenv/config';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'e2e-access-secret-at-least-32-characters';
process.env.JWT_REFRESH_SECRET = 'e2e-refresh-secret-at-least-32-characters';
process.env.JWT_ACCESS_TTL = '15m';
process.env.STRIPE_SECRET_KEY = 'sk_test_e2e';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_e2e';

const configuredUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!configuredUrl) {
  throw new Error(
    'TEST_DATABASE_URL or DATABASE_URL is required for E2E tests',
  );
}

const databaseUrl = new URL(configuredUrl);
if (!process.env.TEST_DATABASE_URL) {
  databaseUrl.pathname = `${databaseUrl.pathname.replace(/\/$/, '')}_test`;
}

const databaseName = databaseUrl.pathname.slice(1);
if (!/(^|_)test($|_)/i.test(databaseName)) {
  throw new Error(
    `Refusing to run E2E tests against non-test database: ${databaseName}`,
  );
}

process.env.DATABASE_URL = databaseUrl.toString();

for (const key of [
  'MINIO_ENDPOINT',
  'MINIO_PORT',
  'MINIO_USE_SSL',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
  'MINIO_BUCKET',
  'MINIO_PUBLIC_URL',
  'OBSERVE_APP_KEY',
  'OBSERVE_APP_SECRET',
]) {
  delete process.env[key];
}
