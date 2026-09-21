import { randomUUID } from 'node:crypto';

export const MATE_STORAGE_TOKEN = Symbol('MATE_STORAGE_TOKEN');

export interface MateUpload {
  buffer: Buffer;
  mimetype: string;
}

/**
 * Boundary for the gallery's storage provider. MinIO or another object-store
 * adapter can replace the local provider without changing the mate service.
 */
export interface MateStorageProvider {
  remove(storageKey: string): Promise<void>;
  store(mateId: number, file: MateUpload): Promise<{ url: string; storageKey: string }>;
}

export class LocalMateStorageProvider implements MateStorageProvider {
  async store(mateId: number, file: MateUpload): Promise<{ url: string; storageKey: string }> {
    // A data URL keeps local/test environments self-contained. Production can
    // inject a provider that writes to object storage and returns a CDN URL.
    const storageKey = `local/mates/${mateId}/${randomUUID()}`;
    return {
      url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
      storageKey,
    };
  }

  async remove(_storageKey: string): Promise<void> {
    // The local provider is self-contained; deleting the database row is
    // sufficient because no external object was created.
  }
}
