export interface MinioStorageConfig {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  publicUrl: string;
}

const REQUIRED_KEYS = [
  'MINIO_ENDPOINT',
  'MINIO_PORT',
  'MINIO_USE_SSL',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
  'MINIO_BUCKET',
  'MINIO_PUBLIC_URL',
] as const;

/**
 * Return null when MinIO is not configured so unit/e2e environments can keep
 * using the in-process provider. Partial configuration is always rejected.
 */
export function readMinioConfig(env: NodeJS.ProcessEnv = process.env): MinioStorageConfig | null {
  const values = Object.fromEntries(REQUIRED_KEYS.map((key) => [key, env[key]?.trim()])) as Record<
    (typeof REQUIRED_KEYS)[number],
    string | undefined
  >;
  const configured = REQUIRED_KEYS.some((key) => values[key]);
  if (!configured) {
    if (env['NODE_ENV'] === 'production') {
      throw new Error('MinIO storage is required in production; configure all MINIO_* variables');
    }
    return null;
  }

  const missing = REQUIRED_KEYS.filter((key) => !values[key]);
  if (missing.length > 0) {
    throw new Error(`Incomplete MinIO configuration; missing ${missing.join(', ')}`);
  }

  const port = Number(values.MINIO_PORT);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('MINIO_PORT must be an integer between 1 and 65535');
  }

  if (values.MINIO_USE_SSL !== 'true' && values.MINIO_USE_SSL !== 'false') {
    throw new Error('MINIO_USE_SSL must be true or false');
  }

  const publicUrl = values.MINIO_PUBLIC_URL!;
  try {
    new URL(publicUrl);
  } catch {
    throw new Error('MINIO_PUBLIC_URL must be an absolute URL');
  }

  return {
    endPoint: values.MINIO_ENDPOINT!.replace(/^https?:\/\//, '').replace(/\/$/, ''),
    port,
    useSSL: values.MINIO_USE_SSL === 'true',
    accessKey: values.MINIO_ACCESS_KEY!,
    secretKey: values.MINIO_SECRET_KEY!,
    bucket: values.MINIO_BUCKET!,
    publicUrl: publicUrl.replace(/\/$/, ''),
  };
}
