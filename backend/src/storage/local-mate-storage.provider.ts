import { randomUUID } from 'node:crypto';
import type { MateStorageProvider, MateUpload } from '../mates/gallery/mate-storage.js';

export class LocalMateStorageProvider implements MateStorageProvider {
  async store(mateId: number, file: MateUpload): Promise<{ url: string; storageKey: string }> {
    const storageKey = `local/mates/${mateId}/${randomUUID()}`;
    return {
      url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
      storageKey,
    };
  }

  async remove(_storageKey: string): Promise<void> {}
}
